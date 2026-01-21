const { getRedisClient } = require('../config/redis');
const prisma = require('../config/database');
const userService = require('./userService');
const gameService = require('./gameService');

class RankingService {
    constructor() {
        this.matchingQueue = new Set();
        this.userRoomTypes = new Map(); // userId -> roomType
        this.matchingInterval = null;
        this.startMatchingLoop();
    }

    startMatchingLoop() {
        // Run matching algorithm every second
        this.matchingInterval = setInterval(() => {
            this.processMatching();
        }, 1000);
    }

    async addToMatchingQueue(userId, roomType = 'strategy') {
        // Check user status before adding to queue
        const redis = getRedisClient();
        let userStatus = 'waiting';
        if (redis) {
            try {
                userStatus = await redis.get(`user:status:${userId}`) || 'waiting';
            } catch (error) {
                console.error('Error checking user status:', error);
            }
        }

        // Don't add to queue if user is in-game, resting, or spectating
        if (userStatus === 'in-game' || userStatus === 'resting' || userStatus === 'spectating') {
            throw new Error('대국 중이거나 휴식 중일 때는 매칭을 시작할 수 없습니다.');
        }

        const user = await userService.findUserById(userId);
        
        if (!user) return;

        // Store room type
        this.userRoomTypes.set(userId, roomType);

        // Add to Redis Sorted Set (sorted by rating)
        const matchingStartTime = Date.now();
        if (redis) {
            try {
                await redis.zAdd('matching:queue', {
                    score: user.rating,
                    value: userId.toString()
                });
                // Store room type in Redis
                await redis.setEx(`matching:roomtype:${userId}`, 300, roomType);
                // Store matching start time for progressive matching
                await redis.setEx(`matching:starttime:${userId}`, 300, matchingStartTime.toString());
            } catch (error) {
                console.error('Redis queue add error:', error);
            }
        }

        this.matchingQueue.add(userId);
    }

    async removeFromMatchingQueue(userId) {
        const redis = getRedisClient();
        if (redis) {
            try {
                await redis.zRem('matching:queue', userId.toString());
                await redis.del(`matching:roomtype:${userId}`);
                await redis.del(`matching:starttime:${userId}`);
            } catch (error) {
                console.error('Redis queue remove error:', error);
            }
        }
        this.matchingQueue.delete(userId);
        this.userRoomTypes.delete(userId);
    }

    async processMatching() {
        const redis = getRedisClient();
        
        // Handle both Redis and in-memory queue
        let queueSize = 0;
        let queue = [];
        
        if (redis) {
            try {
                queueSize = await redis.zCard('matching:queue');
                if (queueSize < 2) {
                    // Fallback to in-memory queue
                    queueSize = this.matchingQueue.size;
                    if (queueSize < 2) return;
                    
                    // Build queue from in-memory set
                    const users = Array.from(this.matchingQueue);
                    for (const userId of users) {
                        try {
                            const user = await userService.findUserById(userId);
                            if (user) {
                                queue.push({ value: userId, score: user.rating });
                            }
                        } catch (error) {
                            console.error(`Error getting user ${userId}:`, error);
                        }
                    }
                } else {
                    // Get all users in queue with scores from Redis
                    const queueData = await redis.zRangeWithScores('matching:queue', 0, -1, {
                        REV: false
                    });
                    
                    queue = queueData.map(item => ({
                        value: item.value,
                        score: item.score
                    }));
                }
            } catch (error) {
                console.error('Redis queue error:', error);
                // Fallback to in-memory queue
                queueSize = this.matchingQueue.size;
                if (queueSize < 2) return;
                
                const users = Array.from(this.matchingQueue);
                for (const userId of users) {
                    try {
                        const user = await userService.findUserById(userId);
                        if (user) {
                            queue.push({ value: userId, score: user.rating });
                        }
                    } catch (error) {
                        console.error(`Error getting user ${userId}:`, error);
                    }
                }
            }
        } else {
            // No Redis - use in-memory queue
            queueSize = this.matchingQueue.size;
            if (queueSize < 2) return;
            
            const users = Array.from(this.matchingQueue);
            for (const userId of users) {
                try {
                    const user = await userService.findUserById(userId);
                    if (user) {
                        queue.push({ value: userId, score: user.rating });
                    }
                } catch (error) {
                    console.error(`Error getting user ${userId}:`, error);
                }
            }
        }

        if (queue.length < 2) return;

        // Try to match users - check all pairs
        const matched = new Set();
        
        for (let i = 0; i < queue.length; i++) {
            if (matched.has(queue[i].value)) continue;
            
            // Check user status before matching
            let status1 = 'waiting';
            if (redis) {
                try {
                    status1 = await redis.get(`user:status:${queue[i].value}`) || 'waiting';
                } catch (error) {
                    // Ignore error
                }
            }
            
            // Skip if user is not available for matching
            if (status1 !== 'matching' && status1 !== 'waiting') continue;
            
            for (let j = i + 1; j < queue.length; j++) {
                if (matched.has(queue[j].value)) continue;
                
                // Check user status before matching
                let status2 = 'waiting';
                if (redis) {
                    try {
                        status2 = await redis.get(`user:status:${queue[j].value}`) || 'waiting';
                    } catch (error) {
                        // Ignore error
                    }
                }
                
                // Skip if user is not available for matching
                if (status2 !== 'matching' && status2 !== 'waiting') continue;
                
                const userId1 = queue[i].value;
                const rating1 = queue[i].score;
                const userId2 = queue[j].value;
                const rating2 = queue[j].score;

                // Check if rating difference is acceptable (점진적 확장 방식)
                const ratingDiff = Math.abs(rating1 - rating2);
                
                // 매칭 시작 시간 가져오기
                let maxDiff = 200; // 초기 범위
                const redis = getRedisClient();
                
                if (redis) {
                    try {
                        const startTime1 = await redis.get(`matching:starttime:${userId1}`);
                        const startTime2 = await redis.get(`matching:starttime:${userId2}`);
                        
                        if (startTime1 && startTime2) {
                            const waitTime1 = (Date.now() - parseInt(startTime1)) / 1000; // 초 단위
                            const waitTime2 = (Date.now() - parseInt(startTime2)) / 1000;
                            const maxWaitTime = Math.max(waitTime1, waitTime2);
                            
                            // 대기 시간에 따라 허용 범위 확장 (최대 10초 대기 시 ±500까지 확장)
                            if (maxWaitTime >= 10) {
                                maxDiff = 500;
                            } else if (maxWaitTime >= 7) {
                                maxDiff = 400;
                            } else if (maxWaitTime >= 5) {
                                maxDiff = 300;
                            } else if (maxWaitTime >= 3) {
                                maxDiff = 250;
                            }
                        }
                    } catch (error) {
                        // Ignore error, use default
                    }
                }
                
                // 레이팅이 높을수록 더 넓은 범위 허용
                const avgRating = (rating1 + rating2) / 2;
                if (avgRating >= 2000) {
                    maxDiff = Math.max(maxDiff, 300); // 고수는 더 넓은 범위
                } else if (avgRating >= 1500) {
                    maxDiff = Math.max(maxDiff, 250); // 중수는 중간 범위
                }

                if (ratingDiff <= maxDiff) {
                    // Match found! Get room type for both users
                    const redis = getRedisClient();
                    let roomType1 = this.userRoomTypes.get(userId1) || 'strategy';
                    let roomType2 = this.userRoomTypes.get(userId2) || 'strategy';
                    
                    // Try to get from Redis if available
                    if (redis) {
                        try {
                            const rt1 = await redis.get(`matching:roomtype:${userId1}`);
                            const rt2 = await redis.get(`matching:roomtype:${userId2}`);
                            if (rt1) roomType1 = rt1;
                            if (rt2) roomType2 = rt2;
                        } catch (error) {
                            // Ignore error
                        }
                    }
                    
                    // Use the room type (both should be same, but use first user's type)
                    const roomType = roomType1;
                    
                    matched.add(userId1);
                    matched.add(userId2);
                    await this.createMatch(userId1, userId2, rating1, rating2, roomType);
                    break; // Move to next user
                }
            }
        }
    }

    async createMatch(userId1, userId2, rating1, rating2, roomType = 'strategy') {
        // Remove from queue
        await this.removeFromMatchingQueue(userId1);
        await this.removeFromMatchingQueue(userId2);

        // Create game (Default to CLASSIC for ranked matching)
        const game = await gameService.createGame(userId1, userId2, rating1, rating2, {
            matchType: 'RANKED',
            mode: 'CLASSIC'
        });

        // Update user statuses to in-game
        if (global.waitingRoomSocket) {
            await global.waitingRoomSocket.setUserInGame(userId1);
            await global.waitingRoomSocket.setUserInGame(userId2);
        }

        // Notify users via Socket.io
        const { io } = require('../server');
        if (io) {
            io.emit('match_found', { 
                gameId: game.id,
                userIds: [userId1, userId2]
            });
        }

        return game;
    }

    // 티어 계산 함수 (참고 저장소 기준)
    getTierFromRating(rating) {
        if (rating < 1300) return 1; // 새싹
        if (rating < 1400) return 2; // 루키
        if (rating < 1500) return 3; // 브론즈
        if (rating < 1700) return 4; // 실버
        if (rating < 2000) return 5; // 골드
        if (rating < 2400) return 6; // 플래티넘
        if (rating < 3000) return 7; // 다이아
        if (rating < 3500) return 8; // 마스터
        return 9; // 챌린저
    }

    getTierName(rating) {
        const tier = this.getTierFromRating(rating);
        const tierNames = {
            1: '새싹',
            2: '루키',
            3: '브론즈',
            4: '실버',
            5: '골드',
            6: '플래티넘',
            7: '다이아',
            8: '마스터',
            9: '챌린저'
        };
        return tierNames[tier] || '새싹';
    }

    async updateRatings(gameId, result) {
        const game = await gameService.getGame(gameId);
        if (!game) return;

        // 중복 업데이트 방지: 게임이 이미 종료되었고 result가 이미 설정되어 있으면
        // 이 함수가 이미 호출되었을 가능성이 높으므로 로그만 남기고 진행
        // (단, result가 null이면 아직 설정되지 않은 것이므로 정상 진행)
        if (game.endedAt && game.result && game.result !== result) {
            console.warn(`[updateRatings] 게임 ${gameId}의 결과가 이미 ${game.result}로 설정되어 있는데, ${result}로 업데이트하려고 시도했습니다. 중복 업데이트를 방지합니다.`);
            return rewards;
        }

        const isRanked = game.matchType === 'RANKED';
        const blackUser = game.blackId ? await userService.findUserById(game.blackId) : null;
        const whiteUser = game.whiteId ? await userService.findUserById(game.whiteId) : null;

        const rewards = {
            black: { gold: 0, ratingChange: 0 },
            white: { gold: 0, ratingChange: 0 }
        };

        // 1. Calculate Ratings (only for ranked)
        if (isRanked && blackUser && whiteUser && !game.isAiGame) {
            const blackRating = blackUser.rating;
            const whiteRating = whiteUser.rating;

            const expectedBlack = 1 / (1 + Math.pow(10, (whiteRating - blackRating) / 400));
            const expectedWhite = 1 - expectedBlack;

            let actualBlack, actualWhite;
            if (result === 'black_win') {
                actualBlack = 1;
                actualWhite = 0;
            } else if (result === 'white_win') {
                actualBlack = 0;
                actualWhite = 1;
            } else {
                actualBlack = 0.5;
                actualWhite = 0.5;
            }

            const blackK = blackUser.wins + blackUser.losses < 30 ? 32 : 24;
            const whiteK = whiteUser.wins + whiteUser.losses < 30 ? 32 : 24;

            rewards.black.ratingChange = Math.round(blackK * (actualBlack - expectedBlack));
            rewards.white.ratingChange = Math.round(whiteK * (actualWhite - expectedWhite));

            // 현재 레이팅 저장 (모달 표시용)
            rewards.black.currentRating = blackRating;
            rewards.white.currentRating = whiteRating;

            await userService.updateRating(game.blackId, blackRating + rewards.black.ratingChange);
            await userService.updateRating(game.whiteId, whiteRating + rewards.white.ratingChange);
        }

        // 2. Gold Rewards (매너 점수에 따른 보상 조정)
        const WIN_GOLD = isRanked ? 100 : 50;
        const LOSE_GOLD = isRanked ? 20 : 10;
        const DRAW_GOLD = isRanked ? 40 : 20;

        // 매너 점수에 따른 보상 배율 계산
        const getMannerBonus = (mannerScore) => {
            if (mannerScore >= 2000) return 1.2; // +20%
            if (mannerScore >= 1500) return 1.0; // 기본
            if (mannerScore >= 1000) return 0.9;  // -10%
            return 0.8; // -20%
        };

        const blackMannerScore = blackUser?.mannerScore || 1500;
        const whiteMannerScore = whiteUser?.mannerScore || 1500;
        const blackMannerBonus = getMannerBonus(blackMannerScore);
        const whiteMannerBonus = getMannerBonus(whiteMannerScore);

        if (result === 'black_win') {
            rewards.black.gold = Math.round(WIN_GOLD * blackMannerBonus);
            rewards.white.gold = LOSE_GOLD;
            rewards.black.mannerBonus = blackMannerBonus;
        } else if (result === 'white_win') {
            rewards.black.gold = LOSE_GOLD;
            rewards.white.gold = Math.round(WIN_GOLD * whiteMannerBonus);
            rewards.white.mannerBonus = whiteMannerBonus;
        } else {
            rewards.black.gold = Math.round(DRAW_GOLD * blackMannerBonus);
            rewards.white.gold = Math.round(DRAW_GOLD * whiteMannerBonus);
            rewards.black.mannerBonus = blackMannerBonus;
            rewards.white.mannerBonus = whiteMannerBonus;
        }

        // Apply gold and win/loss records (AI 게임은 전적에 포함하지 않음)
        if (blackUser && !game.isAiGame) {
            await prisma.user.update({
                where: { id: game.blackId },
                data: {
                    gold: { increment: rewards.black.gold },
                    wins: result === 'black_win' ? { increment: 1 } : undefined,
                    losses: result === 'white_win' ? { increment: 1 } : undefined,
                    draws: result === 'draw' ? { increment: 1 } : undefined
                }
            });
        } else if (blackUser && game.isAiGame) {
            // AI 게임은 골드만 지급, 전적은 업데이트하지 않음
            await prisma.user.update({
                where: { id: game.blackId },
                data: {
                    gold: { increment: rewards.black.gold }
                }
            });
        }

        if (whiteUser && !game.isAiGame) {
            await prisma.user.update({
                where: { id: game.whiteId },
                data: {
                    gold: { increment: rewards.white.gold },
                    wins: result === 'white_win' ? { increment: 1 } : undefined,
                    losses: result === 'black_win' ? { increment: 1 } : undefined,
                    draws: result === 'draw' ? { increment: 1 } : undefined
                }
            });
        } else if (whiteUser && game.isAiGame) {
            // AI 게임은 골드만 지급, 전적은 업데이트하지 않음
            await prisma.user.update({
                where: { id: game.whiteId },
                data: {
                    gold: { increment: rewards.white.gold }
                }
            });
        }

        return rewards;
    }
}

module.exports = new RankingService();

