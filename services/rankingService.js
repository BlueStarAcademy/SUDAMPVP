const { getRedisClient } = require('../config/redis');
const prisma = require('../config/database');
const userService = require('./userService');
const gameService = require('./gameService');

class RankingService {
    constructor() {
        this.matchingQueue = new Set();
        this.matchingInterval = null;
        this.startMatchingLoop();
    }

    startMatchingLoop() {
        // Run matching algorithm every second
        this.matchingInterval = setInterval(() => {
            this.processMatching();
        }, 1000);
    }

    async addToMatchingQueue(userId) {
        const redis = getRedisClient();
        const user = await userService.findUserById(userId);
        
        if (!user) return;

        // Add to Redis Sorted Set (sorted by rating)
        await redis.zAdd('matching:queue', {
            score: user.rating,
            value: userId.toString()
        });

        this.matchingQueue.add(userId);
    }

    async removeFromMatchingQueue(userId) {
        const redis = getRedisClient();
        await redis.zRem('matching:queue', userId.toString());
        this.matchingQueue.delete(userId);
    }

    async processMatching() {
        const redis = getRedisClient();
        const queueSize = await redis.zCard('matching:queue');

        if (queueSize < 2) return;

        // Get all users in queue with scores
        const queueData = await redis.zRangeWithScores('matching:queue', 0, -1, {
            REV: false
        });
        
        // Convert to array of {value, score}
        const queue = queueData.map(item => ({
            value: item.value,
            score: item.score
        }));

        // Try to match users - check all pairs
        const matched = new Set();
        
        for (let i = 0; i < queue.length; i++) {
            if (matched.has(queue[i].value)) continue;
            
            for (let j = i + 1; j < queue.length; j++) {
                if (matched.has(queue[j].value)) continue;
                
                const userId1 = queue[i].value;
                const rating1 = queue[i].score;
                const userId2 = queue[j].value;
                const rating2 = queue[j].score;

                // Check if rating difference is acceptable
                const ratingDiff = Math.abs(rating1 - rating2);
                const maxDiff = 200; // Start with ±200 range

                if (ratingDiff <= maxDiff) {
                    // Match found!
                    matched.add(userId1);
                    matched.add(userId2);
                    await this.createMatch(userId1, userId2, rating1, rating2);
                    break; // Move to next user
                }
            }
        }
    }

    async createMatch(userId1, userId2, rating1, rating2) {
        // Remove from queue
        await this.removeFromMatchingQueue(userId1);
        await this.removeFromMatchingQueue(userId2);

        // Create game
        const game = await gameService.createGame(userId1, userId2, rating1, rating2);

        // Update user statuses
        const redis = getRedisClient();
        await redis.setEx(`user:status:${userId1}`, 3600, 'in-game');
        await redis.setEx(`user:status:${userId2}`, 3600, 'in-game');

        // Notify users via Socket.io
        const io = require('../server').io;
        if (io) {
            // Emit to main namespace - clients will handle it
            io.emit('match_found', { 
                gameId: game.id,
                userIds: [userId1, userId2]
            });
        }

        return game;
    }

    async updateRatings(gameId, result) {
        const game = await gameService.getGame(gameId);
        if (!game || game.isAiGame) return;

        const blackUser = await userService.findUserById(game.blackId);
        const whiteUser = await userService.findUserById(game.whiteId);

        if (!blackUser || !whiteUser) return;

        const blackRating = blackUser.rating;
        const whiteRating = whiteUser.rating;

        // Calculate expected scores
        const expectedBlack = 1 / (1 + Math.pow(10, (whiteRating - blackRating) / 400));
        const expectedWhite = 1 - expectedBlack;

        // Determine actual scores
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

        // Calculate new ratings (K-factor = 32 for new players, 24 for others)
        const blackK = blackUser.wins + blackUser.losses < 30 ? 32 : 24;
        const whiteK = whiteUser.wins + whiteUser.losses < 30 ? 32 : 24;

        const newBlackRating = Math.round(blackRating + blackK * (actualBlack - expectedBlack));
        const newWhiteRating = Math.round(whiteRating + whiteK * (actualWhite - expectedWhite));

        // Update ratings
        await userService.updateRating(game.blackId, newBlackRating);
        await userService.updateRating(game.whiteId, newWhiteRating);

        // Update win/loss records
        if (result === 'black_win') {
            await prisma.user.update({
                where: { id: game.blackId },
                data: { wins: { increment: 1 } }
            });
            await prisma.user.update({
                where: { id: game.whiteId },
                data: { losses: { increment: 1 } }
            });
        } else if (result === 'white_win') {
            await prisma.user.update({
                where: { id: game.whiteId },
                data: { wins: { increment: 1 } }
            });
            await prisma.user.update({
                where: { id: game.blackId },
                data: { losses: { increment: 1 } }
            });
        } else {
            await prisma.user.update({
                where: { id: game.blackId },
                data: { draws: { increment: 1 } }
            });
            await prisma.user.update({
                where: { id: game.whiteId },
                data: { draws: { increment: 1 } }
            });
        }
    }
}

module.exports = new RankingService();

