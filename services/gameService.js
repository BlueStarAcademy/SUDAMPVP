const prisma = require('../config/database');
const { getRedisClient } = require('../config/redis');
const timerService = require('./timerService');

class GameService {
    async createGame(blackId, whiteId, blackRating, whiteRating, options = {}) {
        const game = await prisma.game.create({
            data: {
                blackId,
                whiteId,
                blackRating,
                whiteRating,
                matchType: options.matchType || 'RANKED',
                mode: options.mode || 'CLASSIC',
                komi: options.komi || 6.5,
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
            lastPass: false,
            ended: false,
            mode: game.mode,
            matchType: game.matchType
        });

        return game;
    }

    async createAiGame(userId, aiLevel, userColor = 'black', options = {}) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new Error('User not found');
        }
        
        // Determine which color the user plays
        const isUserBlack = userColor === 'black' || (userColor === 'random' && Math.random() < 0.5);
        const aiColor = isUserBlack ? 'white' : 'black';

        const game = await prisma.game.create({
            data: {
                blackId: isUserBlack ? userId : null,
                whiteId: isUserBlack ? null : userId,
                blackRating: isUserBlack ? user.rating : (1500 + (aiLevel * 100)),
                whiteRating: isUserBlack ? (1500 + (aiLevel * 100)) : user.rating,
                isAiGame: true,
                aiLevel: aiLevel,
                aiColor: aiColor,
                matchType: 'FRIENDLY', // AI games are always friendly
                mode: options.mode || 'CLASSIC',
                komi: options.komi || 6.5,
            },
        });

        // Cache game info
        const redis = getRedisClient();
        if (redis) {
            try {
                await redis.setEx(`game:${game.id}`, 3600, JSON.stringify({
                    id: game.id,
                    blackId: game.blackId,
                    whiteId: game.whiteId,
                    blackRating: game.blackRating,
                    whiteRating: game.whiteRating,
                    isAiGame: game.isAiGame,
                    aiLevel: game.aiLevel,
                    aiColor: game.aiColor,
                    mode: game.mode,
                    matchType: game.matchType
                }));
            } catch (error) {
                console.error('Redis cache error:', error);
            }
        }

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
            lastPass: false,
            ended: false,
            mode: game.mode,
            matchType: game.matchType
        });

        return game;
    }

    async getGame(gameId) {
        const cacheKey = `game:${gameId}`;
        const redis = getRedisClient();
        
        if (redis) {
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            } catch (error) {
                console.error('Redis get error:', error);
            }
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

        if (game && redis) {
            try {
                await redis.setEx(cacheKey, 3600, JSON.stringify(game));
            } catch (error) {
                console.error('Redis cache error:', error);
            }
        }

        return game;
    }

    async getGameState(gameId) {
        const redis = getRedisClient();
        if (redis) {
            try {
                const state = await redis.get(`game:state:${gameId}`);
                if (state) {
                    return JSON.parse(state);
                }
            } catch (error) {
                console.error('Redis get error:', error);
            }
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
        if (redis) {
            try {
                await redis.setEx(`game:state:${gameId}`, 3600, JSON.stringify(state));
            } catch (error) {
                console.error('Redis cache error:', error);
            }
        }
    }

    async makeMove(gameId, userId, move) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        // Verify it's the player's turn
        const state = await this.getGameState(gameId);
        if (state.ended) {
            throw new Error('Game already ended');
        }

        const expectedColor = state.currentColor;
        
        if (userId !== 'ai') {
            if (expectedColor === 'black' && game.blackId !== userId) {
                throw new Error('Not your turn');
            }
            if (expectedColor === 'white' && game.whiteId !== userId) {
                throw new Error('Not your turn');
            }
        }

        // Handle Pass
        if (move.isPass) {
            return await this.handlePass(gameId, expectedColor, state);
        }

        // Validate move
        if (move.x < 0 || move.x >= 19 || move.y < 0 || move.y >= 19) {
            throw new Error('Invalid move coordinates');
        }

        if (state.stones[move.y][move.x] !== null) {
            throw new Error('Position already occupied');
        }

        // Check for Suicide and Capture
        const boardAfterMove = JSON.parse(JSON.stringify(state.stones));
        boardAfterMove[move.y][move.x] = expectedColor;
        
        const opponentColor = expectedColor === 'black' ? 'white' : 'black';
        const capturedStones = this.findCapturedStones(boardAfterMove, move.x, move.y, opponentColor);
        
        if (capturedStones.length > 0) {
            // Remove captured stones
            capturedStones.forEach(s => {
                boardAfterMove[s.y][s.x] = null;
            });
        } else {
            // Check for suicide (if no captures, check if the placed stone has liberties)
            if (!this.hasLiberties(boardAfterMove, move.x, move.y, expectedColor)) {
                throw new Error('Suicide move is not allowed');
            }
        }

        // Check for Ko rule
        if (this.isKo(state.moves, move.x, move.y, expectedColor, capturedStones)) {
            throw new Error('Ko rule violation');
        }

        // Save move to database
        const gameMove = await prisma.gameMove.create({
            data: {
                gameId,
                userId: userId === 'ai' ? null : userId,
                moveNumber: state.moveNumber + 1,
                color: expectedColor,
                x: move.x,
                y: move.y,
                isPass: false,
            },
        });

        // Update game state
        state.stones = boardAfterMove;
        state.currentColor = opponentColor;
        state.moveNumber = gameMove.moveNumber;
        if (expectedColor === 'black') {
            state.capturedBlack += capturedStones.length;
        } else {
            state.capturedWhite += capturedStones.length;
        }
        state.moves.push({
            x: move.x,
            y: move.y,
            color: expectedColor,
            isPass: false,
            moveNumber: gameMove.moveNumber,
            capturedCount: capturedStones.length
        });
        state.lastPass = false;

        // Check for mode-specific win conditions
        if (state.mode === 'CAPTURE') {
            const WIN_CAPTURE_COUNT = 10; // 10개 먼저 따내면 승리 (조정 가능)
            if (expectedColor === 'black' && state.capturedBlack >= WIN_CAPTURE_COUNT) {
                state.ended = true;
                await this.finishGame(gameId, 'black_win', state);
            } else if (expectedColor === 'white' && state.capturedWhite >= WIN_CAPTURE_COUNT) {
                state.ended = true;
                await this.finishGame(gameId, 'white_win', state);
            }
        } else if (state.mode === 'OMOK') {
            if (this.checkOmokWin(state.stones, move.x, move.y, expectedColor)) {
                state.ended = true;
                await this.finishGame(gameId, expectedColor === 'black' ? 'black_win' : 'white_win', state);
            }
        }

        await this.cacheGameState(gameId, state);

        return {
            x: move.x,
            y: move.y,
            color: expectedColor,
            isPass: false,
            moveNumber: gameMove.moveNumber,
            capturedStones: capturedStones,
            isGameOver: state.ended
        };
    }

    async finishGame(gameId, result, state) {
        await prisma.game.update({
            where: { id: gameId },
            data: {
                result,
                endedAt: new Date(),
                capturedBlack: state.capturedBlack,
                capturedWhite: state.capturedWhite
            },
        });
        // Rewards and rating updates are handled in resign/endGame logic
        // We'll centralize this in reward-and-ranking task
    }

    checkOmokWin(board, x, y, color) {
        const directions = [
            [[0, 1], [0, -1]], // Vertical
            [[1, 0], [-1, 0]], // Horizontal
            [[1, 1], [-1, -1]], // Diagonal \
            [[1, -1], [-1, 1]]  // Diagonal /
        ];

        for (const dirPair of directions) {
            let count = 1;
            for (const [dx, dy] of dirPair) {
                let nx = x + dx;
                let ny = y + dy;
                while (nx >= 0 && nx < 19 && ny >= 0 && ny < 19 && board[ny][nx] === color) {
                    count++;
                    nx += dx;
                    ny += dy;
                }
            }
            if (count >= 5) return true;
        }
        return false;
    }

    async handlePass(gameId, color, state) {
        const opponentColor = color === 'black' ? 'white' : 'black';
        const isDoublePass = state.lastPass === true;

        const gameMove = await prisma.gameMove.create({
            data: {
                gameId,
                moveNumber: state.moveNumber + 1,
                color: color,
                isPass: true,
            },
        });

        state.currentColor = opponentColor;
        state.moveNumber = gameMove.moveNumber;
        state.moves.push({
            color: color,
            isPass: true,
            moveNumber: gameMove.moveNumber,
        });
        state.lastPass = true;

        if (isDoublePass) {
            state.ended = true;
            await this.endGame(gameId, state);
        }

        await this.cacheGameState(gameId, state);

        return {
            isPass: true,
            color: color,
            moveNumber: gameMove.moveNumber,
            isGameOver: isDoublePass
        };
    }

    async endGame(gameId, state) {
        // Simple territory calculation or call AI service for accurate scoring
        const aiService = require('./aiService');
        const score = await aiService.calculateScore(gameId);
        
        const result = score.winner === 'black' ? 'black_win' : 'white_win';
        
        await prisma.game.update({
            where: { id: gameId },
            data: {
                result,
                endedAt: new Date(),
                capturedBlack: state.capturedBlack,
                capturedWhite: state.capturedWhite
            },
        });

        // Update ratings and get rewards
        const rankingService = require('./rankingService');
        const rewards = await rankingService.updateRatings(gameId, result);

        // Update user statuses to waiting
        const game = await this.getGame(gameId);
        if (global.waitingRoomSocket) {
            if (game.blackId) await global.waitingRoomSocket.setUserWaiting(game.blackId);
            if (game.whiteId) await global.waitingRoomSocket.setUserWaiting(game.whiteId);
        }

        return { result, score, rewards };
    }

    findCapturedStones(board, lastX, lastY, opponentColor) {
        const captured = [];
        const checked = Array(19).fill(null).map(() => Array(19).fill(false));
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];

        directions.forEach(([dx, dy]) => {
            const nx = lastX + dx;
            const ny = lastY + dy;

            if (nx >= 0 && nx < 19 && ny >= 0 && ny < 19 && board[ny][nx] === opponentColor && !checked[ny][nx]) {
                const group = [];
                if (!this.hasLibertiesRecursive(board, nx, ny, opponentColor, checked, group)) {
                    captured.push(...group);
                }
            }
        });

        return captured;
    }

    hasLiberties(board, x, y, color) {
        const checked = Array(19).fill(null).map(() => Array(19).fill(false));
        return this.hasLibertiesRecursive(board, x, y, color, checked, []);
    }

    hasLibertiesRecursive(board, x, y, color, checked, group) {
        if (x < 0 || x >= 19 || y < 0 || y >= 19) return false;
        if (checked[y][x]) return false;
        
        checked[y][x] = true;
        group.push({ x, y });

        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        let hasLib = false;

        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 0 && nx < 19 && ny >= 0 && ny < 19) {
                if (board[ny][nx] === null) {
                    hasLib = true;
                } else if (board[ny][nx] === color) {
                    if (this.hasLibertiesRecursive(board, nx, ny, color, checked, group)) {
                        hasLib = true;
                    }
                }
            }
        }

        return hasLib;
    }

    isKo(moves, x, y, color, capturedCount) {
        if (capturedCount !== 1) return false;
        if (moves.length < 2) return false;

        const lastMove = moves[moves.length - 1];
        const prevMove = moves[moves.length - 2];

        // Ko occurs when:
        // 1. Current move captures exactly 1 stone
        // 2. Last move captured exactly 1 stone
        // 3. Current move is at the position of the stone captured by the last move
        // 4. Last move was at the position of the stone captured by the current move
        
        if (lastMove.capturedCount === 1 && prevMove.x === x && prevMove.y === y) {
            // This is a simplified Ko check, for full accuracy we'd compare full board states
            // but for Go it's usually enough.
            return true;
        }
        return false;
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

        // Update ratings and get rewards
        const rankingService = require('./rankingService');
        const rewards = await rankingService.updateRatings(gameId, result);

        // Stop timer
        await timerService.stopTimer(gameId);

        // Update user statuses to waiting
        if (global.waitingRoomSocket) {
            if (game.blackId !== null) {
                await global.waitingRoomSocket.setUserWaiting(game.blackId);
            }
            if (game.whiteId !== null) {
                await global.waitingRoomSocket.setUserWaiting(game.whiteId);
            }
        }

        return { result, rewards };
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

        // Update ratings and get rewards
        const rankingService = require('./rankingService');
        const rewards = await rankingService.updateRatings(gameId, result);

        await timerService.stopTimer(gameId);

        // Update user statuses to waiting
        if (global.waitingRoomSocket) {
            if (game.blackId !== null) {
                await global.waitingRoomSocket.setUserWaiting(game.blackId);
            }
            if (game.whiteId !== null) {
                await global.waitingRoomSocket.setUserWaiting(game.whiteId);
            }
        }

        return { result, rewards };
    }
}

module.exports = new GameService();

