const { getRedisClient } = require('../config/redis');
const gameService = require('../services/gameService');
const timerService = require('../services/timerService');

class GameSocket {
    constructor(io) {
        this.io = io;
        this.gameRooms = new Map(); // gameId -> Set of socketIds
    }

    handleConnection(socket, gameId, userId) {
        // Join game room (already joined in server.js)
        if (!this.gameRooms.has(gameId)) {
            this.gameRooms.set(gameId, new Set());
        }
        this.gameRooms.get(gameId).add(socket.id);

        // Get initial game state
        socket.on('get_game_state', async () => {
            const state = await gameService.getGameState(gameId);
            const game = await gameService.getGame(gameId);
            const timer = await timerService.getTimer(gameId);
            
            socket.emit('game_state', {
                ...state,
                game: {
                    id: game.id,
                    blackId: game.blackId,
                    whiteId: game.whiteId,
                    isAiGame: game.isAiGame,
                    aiLevel: game.aiLevel,
                },
                timers: {
                    blackTime: timer.blackTime,
                    whiteTime: timer.whiteTime,
                    currentTurn: timer.currentTurn,
                }
            });
        });

        // Make move
        socket.on('make_move', async (data) => {
            try {
                const move = await gameService.makeMove(gameId, userId, data.move);
                if (move) {
                    // Broadcast to all in room
                    this.io.to(`game-${gameId}`).emit('move_made', { move });
                    
                    // Update timer
                    timerService.switchTurn(gameId);
                    
                    // Check if AI turn
                    const game = await gameService.getGame(gameId);
                    if (game.isAiGame && game.aiColor !== move.color) {
                        // Request AI move (AI plays after user)
                        const aiService = require('../services/aiService');
                        this.io.to(`game-${gameId}`).emit('ai_thinking');
                        aiService.getAiMove(gameId, game.aiLevel);
                    }
                }
            } catch (error) {
                socket.emit('move_error', { error: error.message });
            }
        });

        // Request score
        socket.on('request_score', async () => {
            const aiService = require('../services/aiService');
            const score = await aiService.calculateScore(gameId);
            this.io.to(`game-${gameId}`).emit('score_result', score);
        });

        // Resign
        socket.on('resign', async () => {
            const result = await gameService.resign(gameId, userId);
            this.io.to(`game-${gameId}`).emit('game_ended', { result });
        });

        // Time sync
        socket.on('time_sync_request', (data) => {
            socket.emit('time_sync', { serverTime: Date.now() });
        });

        // Timer expired
        socket.on('timer_expired', async (data) => {
            const result = await gameService.handleTimeExpired(gameId, data.color);
            this.io.to(`game-${gameId}`).emit('game_ended', { result });
        });

        // Disconnect
        socket.on('disconnect', () => {
            const room = this.gameRooms.get(gameId);
            if (room) {
                room.delete(socket.id);
                if (room.size === 0) {
                    this.gameRooms.delete(gameId);
                }
            }
        });
    }
}

module.exports = GameSocket;

