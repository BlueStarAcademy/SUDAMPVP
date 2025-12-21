const prisma = require('../config/database');
const bcrypt = require('bcrypt');
const { getRedisClient } = require('../config/redis');

class UserService {
  async createUser(email, nickname, password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Use transaction to ensure both user and ranking are created atomically
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          nickname,
          password: hashedPassword,
          rating: 1500,
          strategyTickets: 10,
          casualTickets: 10,
          strategyTicketMax: 10,
          casualTicketMax: 10,
        },
      });

      // Create ranking entry
      await tx.ranking.create({
        data: {
          userId: user.id,
          rating: 1500,
        },
      });

      return user;
    });

    return result;
  }

  async findUserByEmail(email) {
    try {
      return await prisma.user.findUnique({
        where: { email },
      });
    } catch (error) {
      console.error('Database error in findUserByEmail:', error);
      throw error;
    }
  }

  async findUserByNickname(nickname) {
    return await prisma.user.findUnique({
      where: { nickname },
    });
  }

  async findAllUsers() {
    return await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        nickname: true,
      },
    });
  }

  async findUserById(id) {
    return await prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            gamesAsBlack: true,
            gamesAsWhite: true,
          },
        },
      },
    });
  }

  async verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  async updateRating(userId, newRating) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { rating: newRating },
    });

    // Update ranking
    await prisma.ranking.upsert({
      where: { userId },
      update: { rating: newRating },
      create: { userId, rating: newRating },
    });

    // Invalidate cache
    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.del(`user:${userId}`);
        await redis.del(`ranking:${userId}`);
      } catch (error) {
        console.error('Redis cache invalidation error:', error);
      }
    }

    return user;
  }

  async getUserProfile(userId) {
    try {
      console.log('getUserProfile called with userId:', userId);
      const cacheKey = `user:${userId}`;
      const redis = getRedisClient();
      console.log('Redis client status:', redis ? 'available' : 'not available');
      
      // Skip Redis cache if not available (to prevent hanging)
      // Redis is optional, so we'll just fetch from database directly
      console.log('Skipping Redis cache, fetching directly from database');

      console.log('Fetching user from database...');
      const user = await this.findUserById(userId);
      console.log('findUserById completed, user:', user ? 'found' : 'not found');
      
      if (!user) return null;

      console.log('Building user profile...');
      const profile = {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        rating: user.rating,
        wins: user.wins,
        losses: user.losses,
        draws: user.draws,
        totalGames: (user._count?.gamesAsBlack || 0) + (user._count?.gamesAsWhite || 0),
      };

      // Skip Redis cache write (Redis is optional)
      // Cache will be added back when Redis is properly configured

      console.log('User profile built successfully');
      return profile;
    } catch (error) {
      console.error('Error in getUserProfile:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        code: error.code
      });
      throw error;
    }
  }

  async getUserStats(userId) {
    try {
      const user = await this.findUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // 현재는 게임 타입 구분이 없으므로 전체 통계만 반환
      // 추후 Game 모델에 gameType 필드가 추가되면 타입별 통계 계산
      const allGames = await prisma.game.findMany({
        where: {
          OR: [
            { blackId: userId },
            { whiteId: userId }
          ],
          result: { not: null }
        }
      });

      // 전략바둑 통계 (현재는 전체 게임으로 계산)
      const strategyGames = allGames.filter(game => !game.isAiGame);
      const strategyWins = strategyGames.filter(game => {
        if (game.blackId === userId) return game.result === 'black_win';
        if (game.whiteId === userId) return game.result === 'white_win';
        return false;
      }).length;
      const strategyLosses = strategyGames.filter(game => {
        if (game.blackId === userId) return game.result === 'white_win';
        if (game.whiteId === userId) return game.result === 'black_win';
        return false;
      }).length;
      const strategyDraws = strategyGames.filter(game => game.result === 'draw').length;

      // 놀이바둑 통계 (현재는 0으로 설정, 추후 gameType 필드 추가 시 수정)
      const casualWins = 0;
      const casualLosses = 0;
      const casualDraws = 0;

      // 전체 통계
      const totalWins = user.wins || 0;
      const totalLosses = user.losses || 0;
      const totalDraws = user.draws || 0;

      return {
        strategy: {
          wins: strategyWins,
          losses: strategyLosses,
          draws: strategyDraws
        },
        casual: {
          wins: casualWins,
          losses: casualLosses,
          draws: casualDraws
        },
        total: {
          wins: totalWins,
          losses: totalLosses,
          draws: totalDraws
        }
      };
    } catch (error) {
      console.error('Error in getUserStats:', error);
      throw error;
    }
  }

  async getTopRankings(limit = 100) {
    try {
      console.log('getTopRankings: starting');
      const cacheKey = 'top_rankings';
      const redis = getRedisClient();
      console.log('getTopRankings: Redis client status:', redis ? 'available' : 'not available');
      
      // Try cache first (if Redis is available)
      if (redis) {
        try {
          console.log('getTopRankings: checking cache');
          // Redis 작업에 타임아웃 추가 (2초)
          const cached = await Promise.race([
            redis.get(cacheKey),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Redis timeout')), 2000)
            )
          ]);
          if (cached) {
            console.log('getTopRankings: returning cached data');
            return JSON.parse(cached);
          }
          console.log('getTopRankings: no cached data found');
        } catch (error) {
          console.error('getTopRankings: Redis cache read error:', error.message);
          // Redis 실패 시 데이터베이스에서 직접 가져오기
        }
      }

      console.log('getTopRankings: fetching from database');
      // Ranking 테이블에서 데이터 가져오기
      const rankings = await prisma.ranking.findMany({
        take: limit,
        orderBy: { rating: 'desc' },
      });

      console.log('getTopRankings: found', rankings.length, 'rankings');

      // 각 ranking에 대해 user 정보 가져오기
      const result = await Promise.all(
        rankings.map(async (r, index) => {
          try {
            const user = await prisma.user.findUnique({
              where: { id: r.userId },
              select: {
                id: true,
                nickname: true,
                rating: true,
                wins: true,
                losses: true,
                draws: true,
              },
            });

            return {
              rank: index + 1,
              userId: r.userId,
              nickname: user ? user.nickname : 'Unknown',
              rating: r.rating,
              wins: user ? user.wins : 0,
              losses: user ? user.losses : 0,
              draws: user ? user.draws : 0,
            };
          } catch (error) {
            console.error(`Error fetching user for ranking ${r.userId}:`, error);
            return {
              rank: index + 1,
              userId: r.userId,
              nickname: 'Unknown',
              rating: r.rating,
              wins: 0,
              losses: 0,
              draws: 0,
            };
          }
        })
      );

      console.log('getTopRankings: returning', result.length, 'rankings');

      // Cache for 1 minute (if Redis is available)
      if (redis) {
        try {
          await redis.setEx(cacheKey, 60, JSON.stringify(result));
        } catch (error) {
          console.error('Redis cache write error:', error);
        }
      }

      return result;
    } catch (error) {
      console.error('Error in getTopRankings:', error);
      // 오류 발생 시 빈 배열 반환
      return [];
    }
  }
}

module.exports = new UserService();

