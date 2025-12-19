const prisma = require('../config/database');
const bcrypt = require('bcrypt');
const { getRedisClient } = require('../config/redis');

class UserService {
  async createUser(email, nickname, password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
      data: {
        email,
        nickname,
        password: hashedPassword,
        rating: 1500,
      },
    });

    // Create ranking entry
    await prisma.ranking.create({
      data: {
        userId: user.id,
        rating: 1500,
      },
    });

    return user;
  }

  async findUserByEmail(email) {
    return await prisma.user.findUnique({
      where: { email },
    });
  }

  async findUserByNickname(nickname) {
    return await prisma.user.findUnique({
      where: { nickname },
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
    const cacheKey = `user:${userId}`;
    const redis = getRedisClient();
    
    // Try cache first (if Redis is available)
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (error) {
        console.error('Redis cache read error:', error);
      }
    }

    const user = await this.findUserById(userId);
    if (!user) return null;

    const profile = {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      rating: user.rating,
      wins: user.wins,
      losses: user.losses,
      draws: user.draws,
      totalGames: user._count.gamesAsBlack + user._count.gamesAsWhite,
    };

    // Cache for 5 minutes (if Redis is available)
    if (redis) {
      try {
        await redis.setEx(cacheKey, 300, JSON.stringify(profile));
      } catch (error) {
        console.error('Redis cache write error:', error);
      }
    }

    return profile;
  }

  async getTopRankings(limit = 100) {
    const cacheKey = 'top_rankings';
    const redis = getRedisClient();
    
    // Try cache first (if Redis is available)
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (error) {
        console.error('Redis cache read error:', error);
      }
    }

    const rankings = await prisma.ranking.findMany({
      take: limit,
      orderBy: { rating: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            rating: true,
            wins: true,
            losses: true,
            draws: true,
          },
        },
      },
    });

    const result = rankings.map((r, index) => ({
      rank: index + 1,
      userId: r.userId,
      nickname: r.user.nickname,
      rating: r.rating,
      wins: r.user.wins,
      losses: r.user.losses,
      draws: r.user.draws,
    }));

    // Cache for 1 minute (if Redis is available)
    if (redis) {
      try {
        await redis.setEx(cacheKey, 60, JSON.stringify(result));
      } catch (error) {
        console.error('Redis cache write error:', error);
      }
    }

    return result;
  }
}

module.exports = new UserService();

