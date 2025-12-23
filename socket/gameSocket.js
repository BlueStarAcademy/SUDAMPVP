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

        // Handle manner score update
        socket.on('update_manner_score', async (data) => {
            try {
                const { targetUserId, delta } = data;
                const game = await gameService.getGame(gameId);
                
                // PVP 게임에서만 매너점수 업데이트 가능
                if (game.isAiGame) {
                    return socket.emit('manner_error', { error: 'AI 게임에서는 매너점수를 평가할 수 없습니다.' });
                }

                // 게임에 참여한 플레이어인지 확인
                if (game.blackId !== userId && game.whiteId !== userId) {
                    return socket.emit('manner_error', { error: '게임에 참여한 플레이어만 매너점수를 평가할 수 있습니다.' });
                }

                // 상대방인지 확인
                if (targetUserId !== game.blackId && targetUserId !== game.whiteId) {
                    return socket.emit('manner_error', { error: '상대방만 매너점수를 평가할 수 있습니다.' });
                }

                // 자신에게는 평가 불가
                if (targetUserId === userId) {
                    return socket.emit('manner_error', { error: '자신에게는 매너점수를 평가할 수 없습니다.' });
                }

                const userService = require('../services/userService');
                const newMannerScore = await userService.updateMannerScore(targetUserId, delta);

                // 모든 클라이언트에 업데이트 전송
                this.io.to(`game-${gameId}`).emit('manner_score_updated', {
                    userId: targetUserId,
                    newMannerScore: newMannerScore
                });
            } catch (error) {
                console.error('Update manner score error:', error);
                socket.emit('manner_error', { error: error.message });
            }
        });

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

        // Base stone placement
        socket.on('place_base_stone', async (data) => {
            try {
                const { x, y } = data;
                const result = await gameService.placeBaseStone(gameId, userId, x, y);
                
                // Broadcast to all in room
                this.io.to(`game-${gameId}`).emit('base_stone_placed', result);
                
                // 베이스돌 배치 완료 후 입찰 단계로
                if (!result.basePlacementPhase && result.komiBiddingPhase) {
                    const state = await gameService.getGameState(gameId);
                    this.io.to(`game-${gameId}`).emit('game_state', {
                        ...state,
                        game: {
                            id: gameId,
                            mode: state.mode
                        }
                    });
                }
            } catch (error) {
                console.error('Place base stone error:', error);
                socket.emit('base_stone_error', { error: error.message });
            }
        });

        // Komi bidding
        socket.on('submit_komi_bid', async (data) => {
            try {
                const { color, komi } = data;
                const result = await gameService.submitKomiBid(gameId, userId, color, komi);
                
                // Broadcast to all in room
                this.io.to(`game-${gameId}`).emit('komi_bid_update', result);
                
                // 입찰 완료 후 게임 시작
                if (!result.komiBiddingPhase && result.finalKomi) {
                    const state = await gameService.getGameState(gameId);
                    const game = await gameService.getGame(gameId);
                    this.io.to(`game-${gameId}`).emit('game_state', {
                        ...state,
                        game: {
                            id: game.id,
                            blackId: game.blackId,
                            whiteId: game.whiteId,
                            isAiGame: game.isAiGame,
                            aiLevel: game.aiLevel,
                            aiColor: game.aiColor,
                            mode: game.mode,
                            komi: game.komi,
                            endedAt: game.endedAt,
                        }
                    });
                }
            } catch (error) {
                console.error('Submit komi bid error:', error);
                socket.emit('komi_bid_error', { error: error.message });
            }
        });

        // Capture bidding
        socket.on('submit_capture_bid', async (data) => {
            try {
                const { bid } = data;
                const result = await gameService.submitCaptureBid(gameId, userId, bid);
                
                // Broadcast to all in room
                this.io.to(`game-${gameId}`).emit('capture_bid_update', result);
                
                // 입찰이 완료되고 게임이 시작되면 게임 상태 전송
                if (!result.biddingPhase && result.finalTarget) {
                    const state = await gameService.getGameState(gameId);
                    const game = await gameService.getGame(gameId);
                    this.io.to(`game-${gameId}`).emit('game_state', {
                        ...state,
                        game: {
                            id: game.id,
                            blackId: game.blackId,
                            whiteId: game.whiteId,
                            isAiGame: game.isAiGame,
                            aiLevel: game.aiLevel,
                            aiColor: game.aiColor,
                            mode: game.mode,
                            endedAt: game.endedAt,
                        }
                    });
                }
            } catch (error) {
                console.error('Submit capture bid error:', error);
                socket.emit('bid_error', { error: error.message });
            }
        });

        // Dice Go - Roll dice
        socket.on('roll_dice', async () => {
            try {
                const result = await gameService.rollDice(gameId, userId);
                this.io.to(`game-${gameId}`).emit('dice_rolled', result);
                
                const state = await gameService.getGameState(gameId);
                const game = await gameService.getGame(gameId);
                this.io.to(`game-${gameId}`).emit('game_state', {
                    ...state,
                    game: {
                        id: game.id,
                        blackId: game.blackId,
                        whiteId: game.whiteId,
                        isAiGame: game.isAiGame,
                        aiLevel: game.aiLevel,
                        aiColor: game.aiColor,
                        mode: game.mode,
                        endedAt: game.endedAt,
                    }
                });
            } catch (error) {
                console.error('Roll dice error:', error);
                socket.emit('dice_error', { error: error.message });
            }
        });

        // Cops and Robbers - Roll dice
        socket.on('roll_cops_dice', async () => {
            try {
                const result = await gameService.rollCopsDice(gameId, userId);
                this.io.to(`game-${gameId}`).emit('cops_dice_rolled', result);
                
                const state = await gameService.getGameState(gameId);
                const game = await gameService.getGame(gameId);
                this.io.to(`game-${gameId}`).emit('game_state', {
                    ...state,
                    game: {
                        id: game.id,
                        blackId: game.blackId,
                        whiteId: game.whiteId,
                        isAiGame: game.isAiGame,
                        aiLevel: game.aiLevel,
                        aiColor: game.aiColor,
                        mode: game.mode,
                        endedAt: game.endedAt,
                    }
                });
            } catch (error) {
                console.error('Roll cops dice error:', error);
                socket.emit('cops_dice_error', { error: error.message });
            }
        });

        // Cops and Robbers - End round
        socket.on('end_cops_round', async () => {
            try {
                const result = await gameService.endCopsRound(gameId, userId);
                this.io.to(`game-${gameId}`).emit('cops_round_ended', result);
                
                if (result.gameEnded) {
                    const state = await gameService.getGameState(gameId);
                    const game = await gameService.getGame(gameId);
                    this.io.to(`game-${gameId}`).emit('game_ended', {
                        winner: result.winner,
                        roundScores: result.roundScores
                    });
                } else {
                    const state = await gameService.getGameState(gameId);
                    const game = await gameService.getGame(gameId);
                    this.io.to(`game-${gameId}`).emit('game_state', {
                        ...state,
                        game: {
                            id: game.id,
                            blackId: game.blackId,
                            whiteId: game.whiteId,
                            isAiGame: game.isAiGame,
                            aiLevel: game.aiLevel,
                            aiColor: game.aiColor,
                            mode: game.mode,
                            endedAt: game.endedAt,
                        }
                    });
                }
            } catch (error) {
                console.error('End cops round error:', error);
                socket.emit('cops_dice_error', { error: error.message });
            }
        });

        // Dice Go - End round
        socket.on('end_dice_round', async () => {
            try {
                const result = await gameService.endDiceRound(gameId, userId);
                this.io.to(`game-${gameId}`).emit('dice_round_ended', result);
                
                if (result.gameEnded) {
                    // 게임 종료 처리
                    const state = await gameService.getGameState(gameId);
                    const game = await gameService.getGame(gameId);
                    this.io.to(`game-${gameId}`).emit('game_ended', {
                        winner: result.winner,
                        roundScores: result.roundScores
                    });
                } else {
                    const state = await gameService.getGameState(gameId);
                    const game = await gameService.getGame(gameId);
                    this.io.to(`game-${gameId}`).emit('game_state', {
                        ...state,
                        game: {
                            id: game.id,
                            blackId: game.blackId,
                            whiteId: game.whiteId,
                            isAiGame: game.isAiGame,
                            aiLevel: game.aiLevel,
                            aiColor: game.aiColor,
                            mode: game.mode,
                            endedAt: game.endedAt,
                        }
                    });
                }
            } catch (error) {
                console.error('End dice round error:', error);
                socket.emit('dice_error', { error: error.message });
            }
        });

        // Make move
        socket.on('make_move', async (data) => {
            try {
                const moveResult = await gameService.makeMove(gameId, userId, data.move);
                if (moveResult) {
                    // Broadcast to all in room
                    this.io.to(`game-${gameId}`).emit('move_made', { move: moveResult });
                    
                    if (moveResult.isGameOver) {
                        const { result, score, rewards } = await gameService.endGame(gameId, await gameService.getGameState(gameId));
                        this.io.to(`game-${gameId}`).emit('game_ended', { 
                            result, 
                            score, 
                            rewards: {
                                black: rewards.black,
                                white: rewards.white
                            }
                        });
                        return;
                    }

                    // Update timer (스피드바둑일 때는 피셔 방식 적용, 그 외는 초읽기 모드)
                    const game = await gameService.getGame(gameId);
                    await timerService.switchTurn(gameId, game.mode);
                    
                    // Check if AI turn
                    if (game.isAiGame && game.aiColor !== moveResult.color) {
                        const aiService = require('../services/aiService');
                        this.io.to(`game-${gameId}`).emit('ai_thinking');
                        aiService.getAiMove(gameId, game.aiLevel);
                    }
                }
            } catch (error) {
                console.error('Make move error:', error);
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
            const { result, rewards } = await gameService.resign(gameId, userId);
            const game = await gameService.getGame(gameId);
            
            this.io.to(`game-${gameId}`).emit('game_ended', { result, rewards: {
                black: rewards.black,
                white: rewards.white
            }});
        });

        // Time sync
        socket.on('time_sync_request', (data) => {
            socket.emit('time_sync', { serverTime: Date.now() });
        });

        // Timer expired
        socket.on('timer_expired', async (data) => {
            const { result, rewards } = await gameService.handleTimeExpired(gameId, data.color);
            this.io.to(`game-${gameId}`).emit('game_ended', { result, rewards: {
                black: rewards.black,
                white: rewards.white
            }});
        });

        // Handle game room chat messages
        socket.on('game_chat_message', async (data) => {
            try {
                if (!data || !data.message || typeof data.message !== 'string') {
                    socket.emit('chat_error', { error: 'Invalid message format' });
                    return;
                }

                const message = data.message.trim();
                if (message.length === 0 || message.length > 200) {
                    socket.emit('chat_error', { error: 'Message must be between 1 and 200 characters' });
                    return;
                }

                // Get user profile
                const profile = await userService.getUserProfile(userId);
                const nickname = profile ? profile.nickname : 'Unknown';

                // Broadcast to all users in this game room only
                this.io.to(`game-${gameId}`).emit('game_chat_message', {
                    user: nickname,
                    message: message,
                    timestamp: Date.now()
                });
            } catch (error) {
                console.error('Error handling game chat message:', error);
                socket.emit('chat_error', { error: 'Failed to send message' });
            }
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

