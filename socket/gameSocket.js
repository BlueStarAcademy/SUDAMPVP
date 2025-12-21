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

        // Update user status based on whether they're playing or spectating
        this.updateGameUserStatus(gameId, userId);

        // Get initial game state
        socket.on('get_game_state', async () => {
            try {
                const state = await gameService.getGameState(gameId);
                const game = await gameService.getGame(gameId);
                const timer = await timerService.getTimer(gameId);
                
                socket.emit('game_state', {
                    ...state,
                    capturedBlack: state.capturedBlack || 0,
                    capturedWhite: state.capturedWhite || 0,
                    game: {
                        id: game.id,
                        blackId: game.blackId,
                        whiteId: game.whiteId,
                        isAiGame: game.isAiGame,
                        aiLevel: game.aiLevel,
                        aiColor: game.aiColor,
                        mode: game.mode || 'standard', // 게임 모드 (기본값: standard)
                        endedAt: game.endedAt,
                    },
                    timers: {
                        blackTime: timer.blackTime,
                        whiteTime: timer.whiteTime,
                        currentTurn: timer.currentTurn,
                    }
                });

                // AI 게임이고 AI가 첫 수를 두는 경우 (AI가 흑)
                if (game.isAiGame && game.aiColor === 'black' && state.moveNumber === 0) {
                    // AI가 첫 수를 둡니다
                    const aiService = require('../services/aiService');
                    this.io.to(`game-${gameId}`).emit('ai_thinking');
                    
                    // AI 수를 비동기로 처리 (에러가 나도 게임은 계속 진행)
                    aiService.getAiMove(gameId, game.aiLevel).catch(error => {
                        console.error('AI first move error:', error);
                        this.io.to(`game-${gameId}`).emit('ai_error', { 
                            error: 'AI 수를 두는 중 오류가 발생했습니다. Gnugo가 설치되어 있는지 확인해주세요.' 
                        });
                    });
                }
            } catch (error) {
                console.error('Get game state error:', error);
                socket.emit('game_error', { error: error.message });
            }
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
            // 게임 종료 시 상태를 waiting으로 변경
            this.updateGameUserStatusOnDisconnect(gameId, userId);
        });
    }

    async updateGameUserStatus(gameId, userId) {
        try {
            const game = await gameService.getGame(gameId);
            
            // Check if user is a player or spectator
            const isPlayer = game.blackId === userId || game.whiteId === userId;
            
            if (global.waitingRoomSocket) {
                if (isPlayer) {
                    // Player - set to in-game
                    await global.waitingRoomSocket.setUserInGame(userId);
                } else {
                    // Spectator - set to spectating
                    await global.waitingRoomSocket.setUserSpectating(userId);
                }
            }
        } catch (error) {
            console.error('Error updating game user status:', error);
        }
    }

    async updateGameUserStatusOnDisconnect(gameId, userId) {
        try {
            const game = await gameService.getGame(gameId);
            // Only update if game has ended
            if (game && game.endedAt && global.waitingRoomSocket) {
                await global.waitingRoomSocket.setUserWaiting(userId);
            }
        } catch (error) {
            console.error('Error updating status on disconnect:', error);
        }
    }
}

module.exports = GameSocket;

