const prisma = require('../config/database');
const { getRedisClient } = require('../config/redis');
const timerService = require('./timerService');

class GameService {
    async createGame(blackId, whiteId, blackRating, whiteRating) {
        const game = await prisma.game.create({
            data: {
                blackId,
                whiteId,
                blackRating,
                whiteRating,
            },
        });

        // Initialize timer
        await timerService.initializeTimer(game.id);

        // Cache game state
        await this.cacheGameState(game.id, {
            stones: Array(19).fill(null).map(() => Array(19).fill(null)),
            currentColor: 'black',
            moveNumber: 0,
            moves: [],
            capturedBlack: 0,
            capturedWhite: 0,
        });

        return game;
    }

    async createAiGame(userId, aiLevel) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const aiColor = 'white'; // User plays black, AI plays white

        const game = await prisma.game.create({
            data: {
                blackId: userId,
                whiteId: 'ai', // Special AI user ID
                blackRating: user.rating,
                whiteRating: 1500 + (aiLevel * 100), // AI rating based on level
                isAiGame: true,
                aiLevel: aiLevel,
                aiColor: aiColor,
            },
        });

        // Cache game info
        const redis = getRedisClient();
        await redis.setEx(`game:${game.id}`, 3600, JSON.stringify({
            id: game.id,
            blackId: game.blackId,
            whiteId: game.whiteId,
            blackRating: game.blackRating,
            whiteRating: game.whiteRating,
            isAiGame: game.isAiGame,
            aiLevel: game.aiLevel,
            aiColor: game.aiColor,
        }));

        // Initialize timer
        await timerService.initializeTimer(game.id);

        // Cache game state
        await this.cacheGameState(game.id, {
            stones: Array(19).fill(null).map(() => Array(19).fill(null)),
            currentColor: 'black',
            moveNumber: 0,
            moves: [],
            capturedBlack: 0,
            capturedWhite: 0,
            isAiGame: true,
            aiLevel: aiLevel,
            aiColor: aiColor,
        });

        return game;
    }

    async getGame(gameId) {
        const cacheKey = `game:${gameId}`;
        const redis = getRedisClient();
        
        const cached = await redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

        const game = await prisma.game.findUnique({
            where: { id: gameId },
            include: {
                blackPlayer: {
                    select: { id: true, nickname: true, rating: true },
                },
                whitePlayer: {
                    select: { id: true, nickname: true, rating: true },
                },
            },
        });

        if (game) {
            await redis.setEx(cacheKey, 3600, JSON.stringify(game));
        }

        return game;
    }

    async getGameState(gameId) {
        const redis = getRedisClient();
        const state = await redis.get(`game:state:${gameId}`);
        
        if (state) {
            return JSON.parse(state);
        }

        // Load from database if not in cache
        const game = await this.getGame(gameId);
        const moves = await prisma.gameMove.findMany({
            where: { gameId },
            orderBy: { moveNumber: 'asc' },
        });

        const gameState = {
            stones: Array(19).fill(null).map(() => Array(19).fill(null)),
            currentColor: 'black',
            moveNumber: moves.length,
            moves: moves.map(m => ({
                x: m.x,
                y: m.y,
                color: m.color,
                isPass: m.isPass,
                moveNumber: m.moveNumber,
            })),
            capturedBlack: 0,
            capturedWhite: 0,
        };

        // Reconstruct board from moves
        moves.forEach(move => {
            if (!move.isPass && move.x !== null && move.y !== null) {
                gameState.stones[move.y][move.x] = move.color;
            }
            gameState.currentColor = move.color === 'black' ? 'white' : 'black';
        });

        await this.cacheGameState(gameId, gameState);
        return gameState;
    }

    async cacheGameState(gameId, state) {
        const redis = getRedisClient();
        await redis.setEx(`game:state:${gameId}`, 3600, JSON.stringify(state));
    }

    async makeMove(gameId, userId, move) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        // Verify it's the player's turn
        const state = await this.getGameState(gameId);
        const expectedColor = state.currentColor;
        
        if (expectedColor === 'black' && game.blackId !== userId) {
            throw new Error('Not your turn');
        }
        if (expectedColor === 'white' && game.whiteId !== userId && game.whiteId !== 'ai') {
            throw new Error('Not your turn');
        }

        // Validate move
        if (!move.isPass && (move.x < 0 || move.x >= 19 || move.y < 0 || move.y >= 19)) {
            throw new Error('Invalid move coordinates');
        }

        // Save move to database
        const gameMove = await prisma.gameMove.create({
            data: {
                gameId,
                userId: game.whiteId === 'ai' ? null : userId,
                moveNumber: state.moveNumber + 1,
                color: expectedColor,
                x: move.x,
                y: move.y,
                isPass: move.isPass || false,
            },
        });

        // Update game state
        if (!move.isPass) {
            state.stones[move.y][move.x] = expectedColor;
        }
        state.currentColor = expectedColor === 'black' ? 'white' : 'black';
        state.moveNumber = gameMove.moveNumber;
        state.moves.push({
            x: move.x,
            y: move.y,
            color: expectedColor,
            isPass: move.isPass,
            moveNumber: gameMove.moveNumber,
        });

        await this.cacheGameState(gameId, state);

        return {
            x: move.x,
            y: move.y,
            color: expectedColor,
            isPass: move.isPass,
            moveNumber: gameMove.moveNumber,
        };
    }

    async resign(gameId, userId) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        const result = game.blackId === userId ? 'white_win' : 'black_win';

        await prisma.game.update({
            where: { id: gameId },
            data: {
                result,
                endedAt: new Date(),
            },
        });

        // Update ratings
        if (!game.isAiGame) {
            const rankingService = require('./rankingService');
            await rankingService.updateRatings(gameId, result);
        }

        // Stop timer
        await timerService.stopTimer(gameId);

        return result;
    }

    async handleTimeExpired(gameId, expiredColor) {
        const game = await this.getGame(gameId);
        const result = expiredColor === 'black' ? 'white_win' : 'black_win';

        await prisma.game.update({
            where: { id: gameId },
            data: {
                result,
                endedAt: new Date(),
            },
        });

        // Update ratings
        if (!game.isAiGame) {
            const rankingService = require('./rankingService');
            await rankingService.updateRatings(gameId, result);
        }

        await timerService.stopTimer(gameId);

        return result;
    }
}

module.exports = new GameService();

