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
        if (redis) {
            try {
                await redis.zAdd('matching:queue', {
                    score: user.rating,
                    value: userId.toString()
                });
                // Store room type in Redis
                await redis.setEx(`matching:roomtype:${userId}`, 300, roomType);
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

                // Check if rating difference is acceptable
                const ratingDiff = Math.abs(rating1 - rating2);
                const maxDiff = 200; // Start with ±200 range

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

        // Consume tickets before creating game
        const ticketService = require('./ticketService');
        const ticketType = roomType === 'casual' ? 'casual' : 'strategy';
        
        // Check and consume tickets for both players
        const user1HasTicket = await ticketService.consumeTicket(userId1, ticketType);
        const user2HasTicket = await ticketService.consumeTicket(userId2, ticketType);

        if (!user1HasTicket || !user2HasTicket) {
            // Return tickets if one player doesn't have enough
            if (user1HasTicket) {
                // Refund ticket (add back)
                const prisma = require('../config/database');
                await prisma.user.update({
                    where: { id: userId1 },
                    data: ticketType === 'strategy' 
                        ? { strategyTickets: { increment: 1 } }
                        : { casualTickets: { increment: 1 } }
                });
            }
            if (user2HasTicket) {
                const prisma = require('../config/database');
                await prisma.user.update({
                    where: { id: userId2 },
                    data: ticketType === 'strategy' 
                        ? { strategyTickets: { increment: 1 } }
                        : { casualTickets: { increment: 1 } }
                });
            }
            throw new Error('Not enough tickets');
        }

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

    async updateRatings(gameId, result) {
        const game = await gameService.getGame(gameId);
        if (!game) return;

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

            await userService.updateRating(game.blackId, blackRating + rewards.black.ratingChange);
            await userService.updateRating(game.whiteId, whiteRating + rewards.white.ratingChange);
        }

        // 2. Gold Rewards
        const WIN_GOLD = isRanked ? 100 : 50;
        const LOSE_GOLD = isRanked ? 20 : 10;
        const DRAW_GOLD = isRanked ? 40 : 20;

        if (result === 'black_win') {
            rewards.black.gold = WIN_GOLD;
            rewards.white.gold = LOSE_GOLD;
        } else if (result === 'white_win') {
            rewards.black.gold = LOSE_GOLD;
            rewards.white.gold = WIN_GOLD;
        } else {
            rewards.black.gold = DRAW_GOLD;
            rewards.white.gold = DRAW_GOLD;
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

