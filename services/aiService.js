const aiQueue = require('../queue/aiQueue');
const { spawn } = require('child_process');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const path = require('path');
const gameService = require('./gameService');

class AIService {
    constructor() {
        this.setupQueueProcessor();
    }

    setupQueueProcessor() {
        aiQueue.process('gnugo-move', async (job) => {
            try {
                const { gameId, level, gameState, isCasualMode } = job.data;
                
                // 게임이 끝났는지 확인
                const game = await gameService.getGame(gameId);
                if (game.endedAt) {
                    console.log(`[AIService] Game ${gameId} already ended, skipping AI move`);
                    return { isPass: true, gameEnded: true };
                }
                
                // moveNumber와 autoScoringMove 체크: autoScoringMove를 초과한 경우에만 수를 두지 않음
                // moveNumber <= autoScoringMove이면 수를 둘 수 있음 (마지막 수 포함)
                if (gameState.autoScoringMove && gameState.moveNumber >= gameState.autoScoringMove) {
                    console.log(`[AIService] Move number ${gameState.moveNumber} has reached/exceeded autoScoringMove ${gameState.autoScoringMove} in queue, skipping AI move`);
                    return { isPass: true, gameEnded: true };
                }
                
                // 놀이바둑일 때는 우리가 만든 AI봇 사용 (그누고 사용 안 함)
                if (isCasualMode) {
                    return await this.getCasualAiMove(gameId, level, gameState);
                }
                
                // 개발 환경에서는 'demo', 배포 환경에서는 'gnugo' 사용
                // 환경 변수 AI_MODE로 제어 (기본값: 개발 환경에서는 'demo', 배포 환경에서는 'gnugo')
                const aiMode = process.env.AI_MODE || (process.env.NODE_ENV === 'production' ? 'gnugo' : 'demo');
                console.log(`[AIService] AI Mode: ${aiMode} (NODE_ENV: ${process.env.NODE_ENV})`);
                
                if (aiMode === 'demo') {
                    return await this.getDemoMove(gameId, level, gameState);
                } else {
                    // Gnugo를 사용하려고 시도하지만, 실패하면 데모 모드로 폴백
                    try {
                        return await this.getGnugoMove(gameId, level, gameState);
                    } catch (error) {
                        console.warn('Gnugo failed, falling back to demo mode:', error.message);
                        return await this.getDemoMove(gameId, level, gameState);
                    }
                }
            } catch (error) {
                console.error(`[AIQueue] Queue error in gnugo-move:`, error);
                throw error; // 에러를 다시 던져서 Queue가 재시도하도록 함
            }
        });

        aiQueue.process('katago-score', async (job) => {
            try {
                const { gameId, gameState } = job.data;
                const aiMode = process.env.AI_MODE || 'gnugo';
                
                if (aiMode === 'demo') {
                    return await this.getDemoScore(gameId, gameState);
                } else {
                    try {
                        return await this.getKatagoScore(gameId, gameState);
                    } catch (error) {
                        console.error('Katago scoring failed, using demo fallback:', error);
                        return await this.getDemoScore(gameId, gameState);
                    }
                }
            } catch (error) {
                console.error(`[AIQueue] Queue error in katago-score:`, error);
                throw error; // 에러를 다시 던져서 Queue가 재시도하도록 함
            }
        });
    }

    async getDemoScore(gameId, gameState) {
        // Very simple territory estimation for demo
        let blackPoints = 0;
        let whitePoints = 0;
        
        const boardSize = gameState.boardSize || 19;
        const komi = gameState.komi || 6.5;
        
        const board = Array(boardSize).fill(null).map(() => Array(boardSize).fill(null));
        if (gameState.stones) {
            // gameState.stones가 있으면 직접 사용
            for (let y = 0; y < boardSize && y < gameState.stones.length; y++) {
                for (let x = 0; x < boardSize && x < (gameState.stones[y]?.length || 0); x++) {
                    board[y][x] = gameState.stones[y][x] || null;
                }
            }
        } else {
            // moves에서 재구성
            gameState.moves.forEach(move => {
                if (!move.isPass && move.x !== undefined && move.y !== undefined) {
                    if (move.y < boardSize && move.x < boardSize) {
                        board[move.y][move.x] = move.color;
                    }
                }
            });
        }

        // Basic count: stones on board + captured
        for (let y = 0; y < boardSize; y++) {
            for (let x = 0; x < boardSize; x++) {
                if (board[y][x] === 'black') blackPoints++;
                else if (board[y][x] === 'white') whitePoints++;
            }
        }

        blackPoints += gameState.capturedBlack || 0;
        whitePoints += (gameState.capturedWhite || 0) + komi; // Komi

        return {
            areaScore: {
                black: blackPoints,
                white: whitePoints
            },
            winner: blackPoints > whitePoints ? 'black' : (whitePoints > blackPoints ? 'white' : 'draw')
        };
    }

    async getAiMove(gameId, level) {
        try {
            console.log(`[AIService] getAiMove called for game ${gameId}, level ${level}`);
            const game = await gameService.getGame(gameId);
            
            // 게임이 이미 끝났는지 확인
            if (game.endedAt) {
                console.log(`[AIService] Game ${gameId} already ended at ${game.endedAt}, skipping AI move`);
                return null; // 게임이 끝났으므로 null 반환
            }
            
            const gameState = await gameService.getGameState(gameId);
            
            console.log(`[AIService] Game info:`, {
                isAiGame: game.isAiGame,
                aiColor: game.aiColor,
                mode: game.mode,
                currentColor: gameState.currentColor,
                moveNumber: gameState.moveNumber,
                autoScoringMove: gameState.autoScoringMove
            });
            
            // moveNumber가 autoScoringMove보다 작거나 같으면 수를 둘 수 있음
            // 예: moveNumber = 59, autoScoringMove = 60이면 AI는 60번째 수를 두어야 함 (계가 직전 마지막 수)
            if (gameState.autoScoringMove && gameState.moveNumber >= gameState.autoScoringMove) {
                console.log(`[AIService] Move number ${gameState.moveNumber} has reached/exceeded autoScoringMove ${gameState.autoScoringMove}, should not make move`);
                // 이미 autoScoringMove에 도달했다면 수를 두지 않음
                return null;
            }
            
            // 놀이바둑 모드 확인
            const casualModes = ['DICE', 'COPS', 'OMOK', 'TTAK', 'ALKKAGI', 'CURLING'];
            const isCasualMode = casualModes.includes(game.mode) || gameState.isCasualMode;
            
            // 놀이바둑일 때는 단일 AI봇 사용 (level은 null이거나 기본값 사용)
            // 놀이바둑은 최적 플레이를 하므로 level은 무시
            const finalLevel = isCasualMode ? null : level;

            console.log(`[AIService] Adding job to queue:`, {
                gameId,
                level: finalLevel,
                isCasualMode,
                boardSize: gameState.boardSize
            });

            let result;
            
            // Redis 연결 상태 확인
            const { getRedisClient } = require('../config/redis');
            const redisClient = getRedisClient();
            let useQueue = redisClient !== null;
            
            if (!useQueue) {
                console.log(`[AIService] Redis not available, calling AI directly (bypassing queue)`);
            }
            
            // 큐를 사용하려고 시도하지만, 실패하면 직접 호출
            if (useQueue) {
                try {
                    // Add to queue (casual mode도 queue를 통해 처리)
                    const job = await aiQueue.add('gnugo-move', {
                        gameId,
                        level: finalLevel,
                        gameState,
                        isCasualMode: isCasualMode,
                    }, {
                        priority: 1,
                        timeout: 30000, // 30 second timeout
                    });

                    console.log(`[AIService] Job added, waiting for result...`);

                    // Wait for result with timeout
                    result = await Promise.race([
                        job.finished(),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Queue timeout')), 35000)
                        )
                    ]);
                    
                    console.log(`[AIService] Job finished, result:`, result);
                } catch (queueError) {
                    console.warn(`[AIService] Queue failed, calling AI directly:`, queueError.message);
                    useQueue = false; // 폴백으로 직접 호출
                }
            }
            
            // 큐를 사용하지 않거나 큐가 실패한 경우 직접 AI 호출
            if (!useQueue || !result) {
                const aiMode = process.env.AI_MODE || (process.env.NODE_ENV === 'production' ? 'gnugo' : 'demo');
                
                console.log(`[AIService] Calling AI directly (mode: ${aiMode})`);
                
                if (isCasualMode) {
                    result = await this.getCasualAiMove(gameId, finalLevel, gameState);
                } else if (aiMode === 'demo') {
                    result = await this.getDemoMove(gameId, finalLevel, gameState);
                } else {
                    try {
                        result = await this.getGnugoMove(gameId, finalLevel, gameState);
                        
                        // Validate result coordinates if not a pass
                        if (!result.isPass && result.x !== undefined && result.y !== undefined) {
                            const boardSize = gameState.boardSize || 19;
                            if (result.x < 0 || result.x >= boardSize || result.y < 0 || result.y >= boardSize) {
                                console.warn(`[AIService] GnuGo returned invalid coordinates (${result.x}, ${result.y}) for ${boardSize}x${boardSize} board, falling back to demo mode`);
                                result = await this.getDemoMove(gameId, finalLevel, gameState);
                            }
                        }
                    } catch (error) {
                        // GnuGo 실패 시 (유효하지 않은 좌표 포함) 데모 모드로 폴백
                        console.warn(`[AIService] GnuGo failed (${error.message}), falling back to demo mode`);
                        try {
                            result = await this.getDemoMove(gameId, finalLevel, gameState);
                        } catch (demoError) {
                            console.error(`[AIService] Demo mode also failed: ${demoError.message}`);
                            // 데모 모드도 실패하면 에러를 다시 던짐
                            throw error;
                        }
                    }
                }
            }
            
            if (!result) {
                // 게임이 끝났거나 AI move가 실패한 경우
                const currentGame = await gameService.getGame(gameId);
                if (currentGame.endedAt) {
                    console.log(`[AIService] Game ${gameId} ended, no AI move needed`);
                    return null;
                }
                throw new Error('AI move failed');
            }

            // Make the move (최대 10번 재시도)
            let moveResult = null;
            let attempts = 0;
            const maxAttempts = 10;
            let currentResult = result;
            
            while (!moveResult && attempts < maxAttempts) {
                try {
                    // AI가 두기 직전에 최신 게임 상태 확인 (동시성 문제 방지)
                    const latestGameState = await gameService.getGameState(gameId);
                    
                    // AI가 반환한 좌표가 유효한지 사전 확인
                    if (!currentResult.isPass && currentResult.x !== undefined && currentResult.y !== undefined) {
                        const boardSize = latestGameState.boardSize || 19;
                        if (currentResult.x < 0 || currentResult.x >= boardSize || 
                            currentResult.y < 0 || currentResult.y >= boardSize) {
                            throw new Error(`Invalid coordinates: (${currentResult.x}, ${currentResult.y}) for ${boardSize}x${boardSize} board`);
                        }
                        
                        // 이미 돌이 있는 위치인지 확인
                        if (latestGameState.stones && 
                            latestGameState.stones[currentResult.y] && 
                            latestGameState.stones[currentResult.y][currentResult.x] !== null) {
                            throw new Error('Position already occupied');
                        }
                    }
                    
                    if (currentResult.isPass) {
                        moveResult = await gameService.makeMove(gameId, 'ai', {
                            isPass: true,
                            color: game.aiColor,
                        });
                    } else if (currentResult.x !== undefined && currentResult.y !== undefined) {
                        moveResult = await gameService.makeMove(gameId, 'ai', {
                            x: currentResult.x,
                            y: currentResult.y,
                            color: game.aiColor,
                        });
                    } else {
                        // result에 x, y가 없으면 데모 모드에서 다시 시도
                        const aiMode = process.env.AI_MODE || (process.env.NODE_ENV === 'production' ? 'gnugo' : 'demo');
                        if (aiMode === 'demo') {
                            console.warn('[AIService] Invalid move result, getting new demo move');
                            const newGameState = await gameService.getGameState(gameId);
                            currentResult = await this.getDemoMove(gameId, level, newGameState);
                            attempts++;
                            continue;
                        } else {
                            throw new Error('Invalid AI move result');
                        }
                    }
                } catch (error) {
                    attempts++;
                    console.warn(`[AIService] Move attempt ${attempts} failed:`, error.message);
                    
                    // CAPTURE 모드나 MIX 모드의 CAPTURE가 아닌 경우, 유효한 수가 없으면 통과
                    const latestGameState = await gameService.getGameState(gameId);
                    const gameMode = game?.mode || 'CLASSIC';
                    const isCaptureMode = gameMode === 'CAPTURE';
                    const isMixMode = gameMode === 'MIX';
                    const currentMixMode = latestGameState.currentMixMode || latestGameState.mixModes?.[0] || 'CLASSIC';
                    const isMixCapture = isMixMode && currentMixMode === 'CAPTURE';
                    const shouldAutoPass = !isCaptureMode && !isMixCapture;
                    
                    // 재시도 가능한 오류들: Position already occupied, Suicide move, Ko rule, Invalid coordinates
                    const retryableErrors = [
                        'Position already occupied',
                        'already occupied',
                        'Suicide move is not allowed',
                        'Suicide move',
                        '패 모양',
                        'Ko rule',
                        'forbidden',
                        'Invalid coordinates',
                        'invalid coordinates',
                        'GnuGo returned invalid coordinates'
                    ];
                    
                    const isRetryableError = retryableErrors.some(errMsg => error.message.includes(errMsg));
                    
                    if (isRetryableError) {
                        console.log(`[AIService] ${error.message}, getting fresh game state and retrying...`);
                        const newGameState = await gameService.getGameState(gameId);
                        
                        // 최신 게임 상태로 AI 다시 호출
                        const aiMode = process.env.AI_MODE || (process.env.NODE_ENV === 'production' ? 'gnugo' : 'demo');
                        const casualModes = ['DICE', 'COPS', 'OMOK', 'TTAK', 'ALKKAGI', 'CURLING'];
                        const isCasualMode = casualModes.includes(game.mode) || newGameState.isCasualMode;
                        const finalLevel = isCasualMode ? null : level;
                        
                        try {
                            if (isCasualMode) {
                                currentResult = await this.getCasualAiMove(gameId, finalLevel, newGameState);
                            } else if (aiMode === 'demo') {
                                currentResult = await this.getDemoMove(gameId, finalLevel, newGameState);
                            } else {
                                try {
                                    currentResult = await this.getGnugoMove(gameId, finalLevel, newGameState);
                                    // GnuGo 좌표 검증
                                    if (!currentResult.isPass && currentResult.x !== undefined && currentResult.y !== undefined) {
                                        const boardSize = newGameState.boardSize || 19;
                                        if (currentResult.x < 0 || currentResult.x >= boardSize || 
                                            currentResult.y < 0 || currentResult.y >= boardSize) {
                                            console.warn(`[AIService] GnuGo returned invalid coordinates (${currentResult.x}, ${currentResult.y}), using demo fallback`);
                                            currentResult = await this.getDemoMove(gameId, finalLevel, newGameState);
                                        }
                                    }
                                    
                                    // GnuGo가 패스를 반환하지 않았는데 좌표가 없는 경우 데모 모드로 폴백
                                    if (!currentResult.isPass && (currentResult.x === undefined || currentResult.y === undefined || currentResult.x === null || currentResult.y === null)) {
                                        console.warn(`[AIService] GnuGo returned invalid move result (missing coordinates), using demo fallback`);
                                        currentResult = await this.getDemoMove(gameId, finalLevel, newGameState);
                                    }
                                } catch (gnugoError) {
                                    // GnuGo 실패 시 (유효하지 않은 좌표 포함) 데모 모드로 폴백
                                    console.warn(`[AIService] GnuGo failed during retry (${gnugoError.message}), using demo fallback`);
                                    try {
                                        currentResult = await this.getDemoMove(gameId, finalLevel, newGameState);
                                    } catch (demoError) {
                                        console.error(`[AIService] Demo mode also failed: ${demoError.message}`);
                                        // 데모 모드도 실패하면 에러를 다시 던져서 상위에서 처리하도록 함
                                        throw gnugoError;
                                    }
                                }
                            }
                            
                            // GnuGo나 데모 AI가 패스를 반환한 경우에만 패스
                            // 재시도 횟수로 인한 강제 패스는 제거 (너무 많은 재시도 후에는 데모 모드로 폴백)
                            if (currentResult.isPass) {
                                // 실제로 AI가 패스를 반환한 경우에만 패스 처리
                                // 재시도 루프 안에서는 무조건 패스하지 않고 계속 재시도
                                if (attempts >= maxAttempts - 1) {
                                    // 최대 재시도 직전에만 패스 허용 (진짜 유효한 수가 없을 때만)
                                    console.log('[AIService] AI returned pass after retries');
                                }
                            }
                            
                            continue; // 재시도
                        } catch (retryError) {
                            console.error(`[AIService] Retry failed:`, retryError.message);
                            // 재시도 실패 시 데모 모드로 폴백 시도 (바로 패스하지 않음)
                            const aiMode = process.env.AI_MODE || (process.env.NODE_ENV === 'production' ? 'gnugo' : 'demo');
                            if (aiMode !== 'demo' && attempts < maxAttempts) {
                                console.warn(`[AIService] Retry failed, trying demo mode fallback`);
                                try {
                                    const newGameState = await gameService.getGameState(gameId);
                                    currentResult = await this.getDemoMove(gameId, finalLevel, newGameState);
                                    if (!currentResult.isPass) {
                                        continue; // 데모 모드에서 유효한 수를 얻었으면 재시도
                                    }
                                } catch (demoError) {
                                    // 데모 모드도 실패하면 계속 재시도
                                }
                            }
                            if (attempts >= maxAttempts) {
                                // 최종 실패 시 통과 가능한 모드면 통과
                                if (shouldAutoPass) {
                                    console.log('[AIService] Max attempts reached, auto-passing');
                                    currentResult = { isPass: true };
                                    continue;
                                }
                                throw new Error(`AI move failed after ${maxAttempts} attempts: ${retryError.message}`);
                            }
                            continue;
                        }
                    }
                    
                    if (attempts >= maxAttempts) {
                        // 최종 실패 시 통과 가능한 모드면 통과
                        if (shouldAutoPass) {
                            console.log('[AIService] Max attempts reached, auto-passing');
                            try {
                                moveResult = await gameService.makeMove(gameId, 'ai', {
                                    isPass: true,
                                    color: game.aiColor,
                                });
                                break;
                            } catch (passError) {
                                throw new Error(`AI move failed after ${maxAttempts} attempts: ${error.message}`);
                            }
                        }
                        throw new Error(`AI move failed after ${maxAttempts} attempts: ${error.message}`);
                    }
                    
                    // 기타 오류: GnuGo 실패 시 데모 모드로 폴백
                    const aiMode = process.env.AI_MODE || (process.env.NODE_ENV === 'production' ? 'gnugo' : 'demo');
                    if (aiMode === 'demo') {
                        const newGameState = await gameService.getGameState(gameId);
                        currentResult = await this.getDemoMove(gameId, level, newGameState);
                    } else {
                        // GnuGo 실패 시 데모 모드로 폴백 (바로 패스하지 않음)
                        console.warn(`[AIService] GnuGo error: ${error.message}, falling back to demo mode`);
                        const newGameState = await gameService.getGameState(gameId);
                        try {
                            currentResult = await this.getDemoMove(gameId, finalLevel, newGameState);
                            // 데모 모드가 패스를 반환한 경우에만 패스
                            if (!currentResult.isPass) {
                                continue; // 데모 모드에서 유효한 수를 얻었으면 재시도
                            }
                        } catch (demoError) {
                            // 데모 모드도 실패한 경우에만 최종적으로 패스 고려
                            if (shouldAutoPass && attempts >= maxAttempts - 1) {
                                console.log('[AIService] Both GnuGo and demo failed, auto-passing as last resort');
                                try {
                                    moveResult = await gameService.makeMove(gameId, 'ai', {
                                        isPass: true,
                                        color: game.aiColor,
                                    });
                                    break;
                                } catch (passError) {
                                    throw error;
                                }
                            }
                            throw error;
                        }
                    }
                }
            }
            
            if (!moveResult) {
                throw new Error('AI move failed after all attempts');
            }

            // Switch turn after AI move (same as player moves)
            const timerService = require('../services/timerService');
            const timer = await timerService.switchTurn(gameId, game.mode);
            
            console.log(`[AIService] AI move completed, switched turn. New timer:`, {
                currentTurn: timer.currentTurn,
                blackTime: timer.blackTime,
                whiteTime: timer.whiteTime
            });

            // Notify via socket
            const io = require('../server').io;
            if (io && moveResult) {
                // Get updated game state for client
                const updatedGame = await gameService.getGame(gameId);
                const gameState = await gameService.getGameState(gameId);
                const updatedTimer = await timerService.getTimer(gameId);
                
                // AI 착수 후 게임 상태도 함께 전송
                const gameStateAfterMove = await gameService.getGameState(gameId);
                
                // move_made 이벤트도 emit하여 클라이언트가 동일한 방식으로 처리할 수 있도록 함
                const moveMadePayload = {
                    move: moveResult,
                    currentColor: updatedTimer ? updatedTimer.currentTurn : (moveResult.color === 'black' ? 'white' : 'black'),
                    capturedStones: moveResult.capturedStones || [],
                    capturedBlack: gameStateAfterMove.capturedBlack || 0,
                    capturedWhite: gameStateAfterMove.capturedWhite || 0,
                    maintainTurn: false,
                    mixModeSwitched: false,
                    currentMixMode: null,
                    isGameOver: moveResult.isGameOver || false,
                    isDoublePass: moveResult.isDoublePass || false,
                    autoScoring: moveResult.autoScoring || false,
                    game: {
                        id: updatedGame.id,
                        blackId: updatedGame.blackId,
                        whiteId: updatedGame.whiteId,
                        isAiGame: updatedGame.isAiGame,
                        aiLevel: updatedGame.aiLevel,
                        aiColor: updatedGame.aiColor,
                        mode: updatedGame.mode,
                        endedAt: updatedGame.endedAt
                    },
                    timers: updatedTimer ? {
                        blackTime: updatedTimer.blackTime,
                        whiteTime: updatedTimer.whiteTime,
                        currentTurn: updatedTimer.currentTurn,
                        blackInByoyomi: updatedTimer.blackInByoyomi,
                        whiteInByoyomi: updatedTimer.whiteInByoyomi,
                        blackByoyomiPeriods: updatedTimer.blackByoyomiPeriods,
                        whiteByoyomiPeriods: updatedTimer.whiteByoyomiPeriods,
                        byoyomiSeconds: updatedTimer.byoyomiSeconds
                    } : null
                };
                
                const gameRoom = `game-${gameId}`;
                const roomSockets = await io.in(gameRoom).fetchSockets();
                console.log(`[AIService] Emitting move_made event for AI move to ${gameRoom}:`, {
                    move: moveMadePayload.move ? { x: moveMadePayload.move.x, y: moveMadePayload.move.y, color: moveMadePayload.move.color } : null,
                    currentColor: moveMadePayload.currentColor,
                    gameMode: moveMadePayload.game.mode,
                    capturedStones: moveMadePayload.capturedStones.length,
                    roomSize: roomSockets.length,
                    socketIds: roomSockets.map(s => s.id)
                });
                
                // move_made 이벤트 emit (클라이언트에서 동일한 방식으로 처리)
                io.to(gameRoom).emit('move_made', moveMadePayload);

                // Pass Notification for AI
                if (moveResult.isPass) {
                    const passColor = moveResult.color === 'black' ? '흑' : '백';
                    let passMessage = `${passColor}이(가) 통과했습니다.`;
                    
                    if (moveResult.isDoublePass) {
                         passMessage += ' 서로 통과하여 계가(집계산)가 진행됩니다.';
                    } else {
                         passMessage += ' 서로 통과하면 계가(집계산)이 진행됩니다.';
                    }
                    
                    io.to(gameRoom).emit('chat_message', {
                        user: 'System',
                        message: passMessage,
                        timestamp: Date.now(),
                        isSystem: true
                    });
                }
                
                console.log(`[AIService] move_made event emitted successfully to ${roomSockets.length} socket(s) in room ${gameRoom}`);
                
                // ai_move 이벤트도 emit (기존 호환성 유지)
                io.to(gameRoom).emit('ai_move', {
                    move: {
                        ...moveResult,
                        capturedStones: moveResult.capturedStones || []
                    },
                    capturedStones: moveResult.capturedStones || [],
                    capturedBlack: gameStateAfterMove.capturedBlack || 0,
                    capturedWhite: gameStateAfterMove.capturedWhite || 0,
                    game: {
                        id: updatedGame.id,
                        blackId: updatedGame.blackId,
                        whiteId: updatedGame.whiteId,
                        isAiGame: updatedGame.isAiGame,
                        aiLevel: updatedGame.aiLevel,
                        aiColor: updatedGame.aiColor,
                        mode: updatedGame.mode,
                        endedAt: updatedGame.endedAt
                    },
                    currentColor: updatedTimer ? updatedTimer.currentTurn : (moveResult.color === 'black' ? 'white' : 'black'),
                    timers: updatedTimer ? {
                        blackTime: updatedTimer.blackTime,
                        whiteTime: updatedTimer.whiteTime,
                        currentTurn: updatedTimer.currentTurn,
                        blackInByoyomi: updatedTimer.blackInByoyomi,
                        whiteInByoyomi: updatedTimer.whiteInByoyomi,
                        blackByoyomiPeriods: updatedTimer.blackByoyomiPeriods,
                        whiteByoyomiPeriods: updatedTimer.whiteByoyomiPeriods,
                        byoyomiSeconds: updatedTimer.byoyomiSeconds
                    } : null,
                    gameState: {
                        stones: gameStateAfterMove.stones,
                        currentColor: updatedTimer ? updatedTimer.currentTurn : gameStateAfterMove.currentColor,
                        moveNumber: gameStateAfterMove.moveNumber,
                        capturedBlack: gameStateAfterMove.capturedBlack,
                        capturedWhite: gameStateAfterMove.capturedWhite,
                        boardSize: gameStateAfterMove.boardSize
                    }
                });
                
                // Check if game ended
                if (moveResult.isGameOver) {
                    // 자동 계가인 경우 지연 처리
                    if (moveResult.autoScoring) {
                        console.log('[AIService] Game ended by auto scoring, delaying game_ended event');
                        setTimeout(async () => {
                            try {
                                // 게임이 이미 종료되었는지 확인
                                const currentGame = await gameService.getGame(gameId);
                                if (!currentGame.endedAt) {
                                    console.log('[AIService] Game not yet ended, emitting scoring_started');
                                    io.to(`game-${gameId}`).emit('scoring_started', { message: '계가를 진행하고 있습니다...' });
                                } else {
                                    console.log('[AIService] Game already ended, skipping scoring_started');
                                }
                                
                                const { result, score, rewards, game: endGameData } = await gameService.endGame(gameId, gameState);
                                
                                console.log('[AIService] endGame completed, emitting game_ended event:', {
                                    result,
                                    hasScore: !!score,
                                    hasRewards: !!rewards,
                                    hasGame: !!endGameData
                                });
                                
                                // Determine win reason based on score
                                let winReason = '자동 계가';
                                if (score && score.areaScore) {
                                    const blackScore = score.areaScore.black || 0;
                                    const whiteScore = score.areaScore.white || 0;
                                    const scoreDiff = Math.abs(blackScore - whiteScore);
                                    if (result === 'black_win') {
                                        winReason = `자동 계가 (흑 +${scoreDiff.toFixed(1)}집 승)`;
                                    } else if (result === 'white_win') {
                                        winReason = `자동 계가 (백 +${scoreDiff.toFixed(1)}집 승)`;
                                    } else {
                                        winReason = '자동 계가 (무승부)';
                                    }
                                }
                                
                                console.log('[AIService] Emitting game_ended event to game room:', {
                                    gameId,
                                    result,
                                    winReason,
                                    room: `game-${gameId}`
                                });
                                
                                io.to(`game-${gameId}`).emit('game_ended', { 
                                    result, 
                                    score, 
                                    rewards: {
                                        black: {
                                            ...rewards.black,
                                            currentRating: rewards.black?.currentRating || endGameData.blackRating
                                        },
                                        white: {
                                            ...rewards.white,
                                            currentRating: rewards.white?.currentRating || endGameData.whiteRating
                                        }
                                    },
                                    reason: winReason,
                                    game: endGameData
                                });
                                
                                console.log('[AIService] game_ended event emitted successfully');
                            } catch (error) {
                                console.error('[AIService] Error in delayed game_ended event handler:', error);
                                console.error('[AIService] Error stack:', error.stack);
                                
                                // 에러가 발생해도 게임 정보를 가져와서 최소한의 정보라도 전송
                                try {
                                    const errorGame = await gameService.getGame(gameId);
                                    io.to(`game-${gameId}`).emit('game_ended', {
                                        result: errorGame.result || 'draw',
                                        score: null,
                                        rewards: { black: {}, white: {} },
                                        reason: '자동 계가 (에러 발생)',
                                        game: errorGame
                                    });
                                } catch (fallbackError) {
                                    console.error('[AIService] Fallback game_ended emit also failed:', fallbackError);
                                }
                            }
                        }, 1500); // 1.5초 지연
                    } else if (moveResult.isDoublePass) {
                        // 더블 패스인 경우에도 지연 처리 (클라이언트가 마지막 패스를 표시할 시간 확보)
                         console.log('[AIService] Game ended by double pass, delaying scoring');
                         setTimeout(async () => {
                            io.to(`game-${gameId}`).emit('scoring_started', { message: '계가를 진행하고 있습니다...' });
                            
                            const { result, score, rewards, game: endGameData } = await gameService.endGame(gameId, gameState);
                            
                            // Determine win reason based on score
                            let winReason = 'score';
                            if (score && score.areaScore) {
                                const blackScore = score.areaScore.black || 0;
                                const whiteScore = score.areaScore.white || 0;
                                const scoreDiff = Math.abs(blackScore - whiteScore);
                                if (result === 'black_win') {
                                    winReason = `score_black_${scoreDiff.toFixed(1)}`;
                                } else if (result === 'white_win') {
                                    winReason = `score_white_${scoreDiff.toFixed(1)}`;
                                }
                            }
                            
                            io.to(`game-${gameId}`).emit('game_ended', { 
                                result, 
                                score, 
                                rewards: {
                                    black: {
                                        ...rewards.black,
                                        currentRating: rewards.black.currentRating || endGameData.blackRating
                                    },
                                    white: {
                                        ...rewards.white,
                                        currentRating: rewards.white.currentRating || endGameData.whiteRating
                                    }
                                },
                                reason: winReason,
                                game: endGameData
                            });
                         }, 500); // 0.5초 지연
                    } else {
                        // 즉시 종료 (기타 사유)
                        const { result, score, rewards, game: endGameData } = await gameService.endGame(gameId, gameState);
                        
                        // Determine win reason based on score
                        let winReason = 'score';
                        if (score && score.areaScore) {
                            const blackScore = score.areaScore.black || 0;
                            const whiteScore = score.areaScore.white || 0;
                            const scoreDiff = Math.abs(blackScore - whiteScore);
                            if (result === 'black_win') {
                                winReason = `score_black_${scoreDiff.toFixed(1)}`;
                            } else if (result === 'white_win') {
                                winReason = `score_white_${scoreDiff.toFixed(1)}`;
                            }
                        }
                        
                        io.to(`game-${gameId}`).emit('game_ended', { 
                            result, 
                            score, 
                            rewards: {
                                black: {
                                    ...rewards.black,
                                    currentRating: rewards.black.currentRating || endGameData.blackRating
                                },
                                white: {
                                    ...rewards.white,
                                    currentRating: rewards.white.currentRating || endGameData.whiteRating
                                }
                            },
                            reason: winReason,
                            game: endGameData
                        });
                    }
                    
                    return moveResult;
                }
                
                // move_made 후 game_state 전송하여 클라이언트가 턴과 타이머를 업데이트할 수 있도록 함
                // gameSocket 인스턴스를 전역에서 가져오거나 require로 가져오기
                const gameSocketInstance = global.gameSocket || require('../socket/gameSocket');
                if (gameSocketInstance && typeof gameSocketInstance.sendGameState === 'function') {
                    for (const s of roomSockets) {
                        if (s.userId) {
                            try {
                                await gameSocketInstance.sendGameState(s, gameId, s.userId);
                            } catch (error) {
                                console.error(`[AIService] Error sending game_state to socket ${s.id}:`, error);
                            }
                        }
                    }
                    console.log(`[AIService] game_state events sent to all sockets after AI move`);
                } else {
                    console.warn(`[AIService] gameSocket.sendGameState not available, skipping game_state update`);
                }
            }

            return moveResult;
        } catch (error) {
            console.error('AI move error:', error);
            const io = require('../server').io;
            if (io) {
                io.to(`game-${gameId}`).emit('ai_error', { error: error.message });
            }
            throw error;
        }
    }

    // 데모 모드: 간단한 휴리스틱 기반 AI (테스트용 - 시간 소모 및 초읽기 테스트 가능)
    async getDemoMove(gameId, level, gameState) {
        return new Promise(async (resolve) => {
            // 테스트를 위해 더 긴 지연 시간 설정 (0.5~1.5초)
            const delay = 500 + Math.random() * 1000; // 0.5~1.5초 지연
            
            setTimeout(async () => {
                try {
                    const game = await gameService.getGame(gameId);
                    const aiColor = game?.aiColor || 'white';
                    
                    // boardSize를 gameState에서 가져오기 (없으면 19)
                    const boardSize = gameState.boardSize || 19;
                    
                    // 현재 보드 상태 재구성
                    const board = Array(boardSize).fill(null).map(() => Array(boardSize).fill(null));
                    if (gameState.stones) {
                        // gameState.stones가 있으면 직접 사용
                        for (let y = 0; y < boardSize && y < gameState.stones.length; y++) {
                            for (let x = 0; x < boardSize && x < (gameState.stones[y]?.length || 0); x++) {
                                board[y][x] = gameState.stones[y][x] || null;
                            }
                        }
                    } else {
                        // moves에서 재구성
                        gameState.moves.forEach(move => {
                            if (!move.isPass && move.x !== undefined && move.y !== undefined) {
                                if (move.y < boardSize && move.x < boardSize) {
                                    board[move.y][move.x] = move.color;
                                }
                            }
                        });
                    }
                    
                    // 클래식 모드 및 일반 모드: 유효한 수가 없으면 통과 허용
                    // CAPTURE 모드나 MIX 모드의 CAPTURE는 통과 불가
                    // game 변수는 위에서 이미 선언됨
                    const gameMode = game?.mode || 'CLASSIC';
                    const isCaptureMode = gameMode === 'CAPTURE';
                    const isMixMode = gameMode === 'MIX';
                    const currentMixMode = gameState.currentMixMode || gameState.mixModes?.[0] || 'CLASSIC';
                    const isMixCapture = isMixMode && currentMixMode === 'CAPTURE';
                    const shouldAutoPass = !isCaptureMode && !isMixCapture; // CLASSIC 모드에서는 true
                    
                    // 유효한 착수만 찾기 (자살 수, 코 규칙 제외)
                    const validMoves = [];
                    const opponentColor = aiColor === 'black' ? 'white' : 'black';
                    
                    for (let y = 0; y < boardSize; y++) {
                        for (let x = 0; x < boardSize; x++) {
                            if (board[y][x] !== null) continue; // 이미 돌이 있는 자리는 제외
                            
                            // 착수 후 보드 상태 시뮬레이션
                            const boardAfterMove = JSON.parse(JSON.stringify(board));
                            boardAfterMove[y][x] = aiColor;
                            
                            // 상대 돌 따내기 확인
                            const capturedStones = this.findCapturedStones(boardAfterMove, x, y, opponentColor);
                            
                            // 따낸 돌 제거 (자살수 체크를 위해)
                            if (capturedStones.length > 0) {
                                capturedStones.forEach(s => {
                                    boardAfterMove[s.y][s.x] = null;
                                });
                            }
                            
                            // 따낸 후에도 자신의 돌이 자유도를 가져야 함 (자살 수 방지)
                            // gameService와 동일한 로직: 따낸 돌이 있어도 자유도 확인 필요
                                if (this.hasLiberties(boardAfterMove, x, y, aiColor)) {
                                    // 코 규칙 확인 (간단한 버전 - 마지막 수와 동일한 위치인지 확인)
                                    const lastMove = gameState.moves && gameState.moves.length > 0 
                                        ? gameState.moves[gameState.moves.length - 1] 
                                        : null;
                                    
                                    // 코 규칙: 마지막에 따낸 돌의 위치에 바로 다시 두는 것 방지
                                    let isKo = false;
                                    if (lastMove && !lastMove.isPass && lastMove.capturedStones && lastMove.capturedStones.length === 1) {
                                        const lastCaptured = lastMove.capturedStones[0];
                                        if (x === lastCaptured.x && y === lastCaptured.y) {
                                            isKo = true; // 간단한 코 체크
                                        }
                                    }
                                    
                                    if (!isKo) {
                                        validMoves.push({ x, y });
                                }
                            }
                        }
                    }
                    
                    // CAPTURE 모드나 MIX 모드의 CAPTURE가 아닌 경우에만 유효한 수가 없으면 통과
                    if (validMoves.length === 0) {
                        if (shouldAutoPass) {
                            console.log('[AIService] No valid moves found, auto-passing (not CAPTURE mode)');
                            resolve({ isPass: true });
                            return;
                        } else {
                            console.log('[AIService] No valid moves found but in CAPTURE mode, cannot pass');
                            // CAPTURE 모드에서는 통과할 수 없으므로 에러 발생
                            resolve({ isPass: false, error: 'No valid moves in CAPTURE mode' });
                            return;
                        }
                    }
                    
                    // 완전 랜덤 선택 (유효한 착수 중에서)
                    const selectedMove = validMoves[Math.floor(Math.random() * validMoves.length)];
                    
                    console.log(`[AIService] Demo AI move selected: ${selectedMove.x}, ${selectedMove.y} on ${boardSize}x${boardSize} board (${validMoves.length} valid moves)`);
                    resolve({ x: selectedMove.x, y: selectedMove.y });
                } catch (error) {
                    console.error('Demo AI move error:', error);
                    // 에러 발생 시 패스
                    resolve({ isPass: true });
                }
            }, delay);
        });
    }
    
    // 유틸리티 함수: 따낸 돌 찾기
    findCapturedStones(board, x, y, opponentColor) {
        const captured = [];
        const boardSize = board.length;
        const checked = Array(boardSize).fill(null).map(() => Array(boardSize).fill(false));
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];

        directions.forEach(([dx, dy]) => {
            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize && 
                board[ny][nx] === opponentColor && !checked[ny][nx]) {
                const group = [];
                if (!this.hasLibertiesRecursive(board, nx, ny, opponentColor, checked, group)) {
                    captured.push(...group);
                }
            }
        });

        return captured;
    }
    
    // 유틸리티 함수: 자유도 확인
    hasLiberties(board, x, y, color) {
        const boardSize = board.length;
        const checked = Array(boardSize).fill(null).map(() => Array(boardSize).fill(false));
        return this.hasLibertiesRecursive(board, x, y, color, checked, []);
    }
    
    // 유틸리티 함수: 재귀적으로 자유도 확인
    hasLibertiesRecursive(board, x, y, color, checked, group) {
        const boardSize = board.length;
        if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) return false;
        if (checked[y][x]) return false;
        if (board[y][x] !== color) return false;
        
        checked[y][x] = true;
        group.push({ x, y });
        
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize) {
                if (board[ny][nx] === null) {
                    return true; // 자유도 발견
                }
                if (board[ny][nx] === color && this.hasLibertiesRecursive(board, nx, ny, color, checked, group)) {
                    return true;
                }
            }
        }
        
        return false;
    }

    // 놀이바둑 전용 AI (그누고 사용 안 함)
    async getCasualAiMove(gameId, level, gameState) {
        return new Promise(async (resolve) => {
            // 테스트를 위해 더 긴 지연 시간 설정 (1~5초)
            // 초읽기 모드 테스트를 위해 시간이 소모되도록 함
            const delay = 1000 + Math.random() * 4000; // 1~5초 지연
            
            setTimeout(async () => {
                try {
                    const game = await gameService.getGame(gameId);
                    const aiColor = game?.aiColor || 'white';
                    const gameMode = game?.mode || 'DICE';
                    
                    // 현재 보드 상태 재구성
                    const board = Array(19).fill(null).map(() => Array(19).fill(null));
                    if (gameState.stones) {
                        // gameState.stones가 있으면 직접 사용
                        for (let y = 0; y < 19; y++) {
                            for (let x = 0; x < 19; x++) {
                                board[y][x] = gameState.stones[y][x] || null;
                            }
                        }
                    } else {
                        // moves에서 재구성
                        gameState.moves.forEach(move => {
                            if (!move.isPass && move.x !== undefined && move.y !== undefined) {
                                board[move.y][move.x] = move.color;
                            }
                        });
                    }
                    
                    // 게임 모드별로 다른 AI 로직 적용
                    let move;
                    switch(gameMode) {
                        case 'DICE': // 주사위바둑
                        case 'COPS': // 경찰과도둑
                        case 'OMOK': // 오목
                        case 'TTAK': // 따목
                        case 'ALKKAGI': // 알까기
                        case 'CURLING': // 바둑컬링
                        default:
                            // 기본적으로 데모 AI와 유사한 로직 사용
                            // 추후 각 게임 모드별로 특화된 AI 로직 추가 가능
                            move = await this.getCasualDefaultMove(board, aiColor);
                            break;
                    }
                    
                    if (!move) {
                        resolve({ isPass: true });
                        return;
                    }
                    
                    resolve(move);
                } catch (error) {
                    console.error('Casual AI move error:', error);
                    // 에러 발생 시 랜덤 위치 선택
                    const randomX = Math.floor(Math.random() * 19);
                    const randomY = Math.floor(Math.random() * 19);
                    resolve({ x: randomX, y: randomY });
                }
            }, delay);
        });
    }

    // 놀이바둑 기본 AI 로직 (테스트용 - 간단한 랜덤 선택)
    async getCasualDefaultMove(board, aiColor) {
        const validMoves = [];
        for (let y = 0; y < 19; y++) {
            for (let x = 0; x < 19; x++) {
                if (board[y][x] === null) {
                    // 테스트를 위해 간단하게 모든 빈 위치를 수집
                    validMoves.push({ x, y });
                }
            }
        }
        
        if (validMoves.length === 0) {
            return null;
        }
        
        // 테스트용: 완전 랜덤 선택 (어떤 위치든 선택 가능)
        const selectedMove = validMoves[Math.floor(Math.random() * validMoves.length)];
        
        return { x: selectedMove.x, y: selectedMove.y };
    }

    async getGnugoMove(gameId, level, gameState) {
        return new Promise(async (resolve, reject) => {
            const gnugoPath = process.env.GNUGO_PATH || 'gnugo';
            
            console.log(`[AIService] getGnugoMove called with path: ${gnugoPath}, level: ${level}`);
            
            // Gnugo 실행 시도
            let gnugo;
            try {
                // GNU Go 레벨은 0~10 범위를 지원합니다
                // 사용자가 선택한 1~10단계를 GNU Go의 0~9 레벨로 매핑
                // 또는 1~10을 그대로 사용 (GNU Go는 0~10을 지원)
                // 여기서는 사용자가 선택한 1~10단계를 GNU Go의 1~10 레벨로 사용
                // (GNU Go의 최대 레벨은 10이므로, 사용자 선택값을 그대로 사용)
                const gnugoLevel = Math.max(0, Math.min(10, parseInt(level) || 1));
                
                console.log(`[AIService] Spawning GnuGo with level ${gnugoLevel}`);
                
                // Windows에서 경로에 공백이 있을 수 있으므로 shell 옵션 사용
                const isWindows = process.platform === 'win32';
                gnugo = spawn(gnugoPath, [
                    '--level', gnugoLevel.toString(),
                    '--mode', 'gtp'
                ], {
                    shell: isWindows,
                    stdio: ['pipe', 'pipe', 'pipe']
                });
                
                console.log(`[AIService] GnuGo process spawned, PID: ${gnugo.pid}`);
            } catch (error) {
                console.error(`[AIService] Failed to spawn GnuGo:`, error);
                reject(new Error(`Gnugo를 실행할 수 없습니다: ${error.message}. Gnugo가 설치되어 있는지 확인해주세요.`));
                return;
            }

            let output = '';
            let errorOutput = '';

            // Get board size from game state
            const boardSize = gameState.boardSize || 19;
            console.log(`[AIService] Using board size: ${boardSize} for GnuGo`);

            // 이벤트 리스너를 먼저 등록 (stdin.write 전에)
            gnugo.stdout.on('data', (data) => {
                output += data.toString();
            });

            gnugo.stderr.on('data', (data) => {
                errorOutput += data.toString();
                console.error(`Gnugo stderr: ${data}`);
            });

            // Get AI color from game (이동: stdin.write 전에 실행)
            const game = await gameService.getGame(gameId);
            const aiColor = game.aiColor || 'white';
            const aiColorLetter = aiColor === 'black' ? 'B' : 'W';

            // Send game state to Gnugo
            gnugo.stdin.write(`boardsize ${boardSize}\n`);
            gnugo.stdin.write('clear_board\n');

            // 게임 상태 전달 확인 로그
            console.log(`[AIService] Replaying ${gameState.moves?.length || 0} moves to GnuGo for ${boardSize}x${boardSize} board`);

            // Replay moves - 좌표 변환 검증 및 로깅 추가
            let validMovesSent = 0;
            let skippedMoves = 0;
            gameState.moves.forEach((move, index) => {
                if (!move.isPass && move.x !== undefined && move.y !== undefined) {
                    // 좌표 유효성 검증
                    if (move.x < 0 || move.x >= boardSize || move.y < 0 || move.y >= boardSize) {
                        console.warn(`[AIService] Skipping invalid move ${index}: (${move.x}, ${move.y}) for ${boardSize}x${boardSize} board`);
                        skippedMoves++;
                        return;
                    }
                    
                    // GTP 좌표 변환: A=0, B=1, ..., I=8 (9줄), J=9, ..., T=19 (19줄)
                    // 9줄 바둑판: A1~I9, 19줄 바둑판: A1~T19
                    // 주의: 표준 GTP 표기법에서는 I를 건너뛰고 J를 사용합니다 (A, B, C, D, E, F, G, H, J, K...)
                    // 따라서 index 8은 J가 되어야 합니다.
                    const colChar = String.fromCharCode(65 + move.x + (move.x >= 8 ? 1 : 0));
                    const y = (move.y + 1).toString(); // 1-based (1~9 for 9줄)
                    
                    const gtpCommand = `play ${move.color === 'black' ? 'B' : 'W'} ${colChar}${y}\n`;
                    gnugo.stdin.write(gtpCommand);
                    validMovesSent++;
                } else if (move.isPass) {
                    gnugo.stdin.write(`play ${move.color === 'black' ? 'B' : 'W'} pass\n`);
                    validMovesSent++;
                }
            });
            
            if (skippedMoves > 0) {
                console.warn(`[AIService] Skipped ${skippedMoves} invalid moves when sending to GnuGo`);
            }
            console.log(`[AIService] Sent ${validMovesSent} valid moves to GnuGo`);

            // Request move
            gnugo.stdin.write(`genmove ${aiColorLetter}\n`);
            gnugo.stdin.end();

            // Timeout 설정
            let timeoutId = setTimeout(() => {
                console.error(`[AIService] GnuGo timeout after 30 seconds`);
                console.error(`[AIService] Output so far: ${output.substring(0, 500)}`);
                console.error(`[AIService] Error output: ${errorOutput.substring(0, 500)}`);
                if (gnugo && !gnugo.killed) {
                    gnugo.kill();
                }
                reject(new Error('Gnugo timeout'));
            }, 30000);

            gnugo.on('close', (code) => {
                clearTimeout(timeoutId);
                
                console.log(`[AIService] GnuGo process closed with code: ${code}`);
                console.log(`[AIService] GnuGo output length: ${output.length}, error length: ${errorOutput.length}`);
                
                if (code !== 0) {
                    const errorMsg = errorOutput || `Gnugo가 종료 코드 ${code}로 종료되었습니다.`;
                    console.error(`[AIService] GnuGo error output:`, errorOutput);
                    console.error(`[AIService] GnuGo stdout:`, output);
                    reject(new Error(`Gnugo 오류: ${errorMsg}. Gnugo가 올바르게 설치되어 있는지 확인해주세요.`));
                    return;
                }

                // Parse output - 여러 줄에서 패턴 찾기
                const lines = output.split('\n');
                let moveMatch = null;
                
                console.log(`[AIService] Parsing GnuGo output, ${lines.length} lines`);
                
                for (const line of lines) {
                    // GTP 형식: "= A1" 또는 "= pass"
                    const match = line.match(/^=\s*([A-T])(\d+)|^=\s*pass/i);
                    if (match) {
                        moveMatch = match;
                        console.log(`[AIService] Found move match: ${match[0]}`);
                        break;
                    }
                }

                if (!moveMatch) {
                    console.error(`[AIService] GnuGo output parsing failed. Full output:`, output);
                    console.error(`[AIService] Error output:`, errorOutput);
                    reject(new Error(`Gnugo 출력을 파싱할 수 없습니다. 출력: ${output.substring(0, 200)}`));
                    return;
                }

                if (moveMatch[0].toLowerCase().includes('pass')) {
                    console.log(`[AIService] GnuGo returned pass`);
                    resolve({ isPass: true });
                } else {
                    let x = moveMatch[1].toUpperCase().charCodeAt(0) - 65;
                    if (x >= 9) x--; // I(8) is skipped in GTP. J(9) becomes 8.
                    
                    const y = parseInt(moveMatch[2]) - 1;
                    const gtpCoord = `${moveMatch[1]}${moveMatch[2]}`;
                    console.log(`[AIService] GnuGo returned move: ${gtpCoord} (parsed: x=${x}, y=${y}) for board size ${boardSize}`);
                    
                    // Validate coordinates against board size
                    if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) {
                        console.error(`[AIService] GnuGo returned invalid coordinates: ${gtpCoord} -> (${x}, ${y}) for board size ${boardSize}x${boardSize}`);
                        console.error(`[AIService] GTP letter: ${moveMatch[1]} (charCode: ${moveMatch[1].charCodeAt(0)}), number: ${moveMatch[2]}`);
                        // reject 대신 특별한 에러를 던져서 상위에서 데모 모드로 폴백할 수 있도록 함
                        reject(new Error(`GnuGo returned invalid coordinates ${gtpCoord} -> (${x}, ${y}) for ${boardSize}x${boardSize} board`));
                        return;
                    }
                    
                    // 좌표 변환 검증 로그
                    console.log(`[AIService] Valid move coordinates: (${x}, ${y}) for ${boardSize}x${boardSize} board (GTP: ${gtpCoord})`);
                    resolve({ x, y });
                }
            });

            gnugo.on('error', (error) => {
                clearTimeout(timeoutId);
                console.error(`[AIService] GnuGo process error:`, error);
                reject(new Error(`Failed to start Gnugo: ${error.message}`));
            });
        });
    }

    async calculateScore(gameId) {
        const gameState = await gameService.getGameState(gameId);
        const game = await gameService.getGame(gameId);
        
        // komi 정보를 게임 상태에 추가
        if (game && game.komi !== undefined) {
            gameState.komi = game.komi;
        }

        // Redis 연결 상태 확인
        const { getRedisClient } = require('../config/redis');
        const redisClient = getRedisClient();
        let useQueue = redisClient !== null;
        
        let result;
        
        if (useQueue) {
            try {
                // Add to queue
                const job = await aiQueue.add('katago-score', {
                    gameId,
                    gameState,
                }, {
                    priority: 2,
                    timeout: 30000, // 30 second timeout (더 짧게 설정)
                });

                // 타임아웃과 함께 대기
                result = await Promise.race([
                    job.finished(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Score calculation timeout')), 35000)
                    )
                ]);
            } catch (queueError) {
                console.warn('[AIService] Queue failed, calling score calculation directly:', queueError.message);
                useQueue = false; // 폴백으로 직접 호출
            }
        }
        
        // 큐를 사용하지 않거나 큐가 실패한 경우 직접 호출
        if (!useQueue || !result) {
            const aiMode = process.env.AI_MODE || (process.env.NODE_ENV === 'production' ? 'gnugo' : 'demo');
            
            try {
                if (aiMode === 'demo') {
                    result = await this.getDemoScore(gameId, gameState);
                } else {
                    // 카타고 시도, 실패하면 데모로 폴백
                    try {
                        result = await Promise.race([
                            this.getKatagoScore(gameId, gameState),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Katago timeout')), 30000)
                            )
                        ]);
                    } catch (katagoError) {
                        console.warn('[AIService] Katago failed, using demo fallback:', katagoError.message);
                        result = await this.getDemoScore(gameId, gameState);
                    }
                }
            } catch (error) {
                console.error('[AIService] Score calculation failed, using demo fallback:', error.message);
                result = await this.getDemoScore(gameId, gameState);
            }
        }
        
        return result;
    }

    async getKatagoScore(gameId, gameState) {
        const isProduction = process.env.NODE_ENV === 'production';
        const katagoServerUrl = process.env.KATAGO_SERVER_URL;
        
        // 배포 환경(production)인 경우: 서버를 우선 시도하고, 실패하면 로컬로 fallback
        // 개발 환경(development)인 경우: 로컬을 우선 사용하고, 실패하면 서버로 fallback
        if (isProduction && katagoServerUrl) {
            // Production: Try server first, fallback to local
            try {
                console.log('[AIService] Production mode: Trying Katago server first');
                return await this.getKatagoScoreFromServer(gameId, gameState, katagoServerUrl);
            } catch (serverError) {
                console.warn('[AIService] Katago server failed, falling back to local:', serverError.message);
                return await this.getKatagoScoreLocal(gameId, gameState);
            }
        } else {
            // Development: Try local first, fallback to server (if available)
            try {
                console.log('[AIService] Development mode: Trying local Katago first');
                return await this.getKatagoScoreLocal(gameId, gameState);
            } catch (localError) {
                if (katagoServerUrl) {
                    console.warn('[AIService] Local Katago failed, falling back to server:', localError.message);
                    try {
                        return await this.getKatagoScoreFromServer(gameId, gameState, katagoServerUrl);
                    } catch (serverError) {
                        throw new Error(`Both local and server Katago failed. Local: ${localError.message}, Server: ${serverError.message}`);
                    }
                } else {
                    throw localError;
                }
            }
        }
    }

    async getKatagoScoreFromServer(gameId, gameState, serverUrl) {
        return new Promise((resolve, reject) => {
            try {
                // Convert game state to SGF
                const sgf = this.gameStateToSGF(gameState);
                
                const url = new URL(serverUrl);
                const isHttps = url.protocol === 'https:';
                const httpModule = isHttps ? https : http;
                
                const postData = JSON.stringify({
                    sgf: sgf,
                    boardSize: gameState.boardSize || 19,
                    komi: gameState.komi || 6.5
                });

                const options = {
                    hostname: url.hostname,
                    port: url.port || (isHttps ? 443 : 80),
                    path: url.pathname || '/api/score',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    },
                    timeout: 60000 // 60초 타임아웃
                };

                console.log(`[AIService] Requesting score from Katago server: ${serverUrl}`);

                const req = httpModule.request(options, (res) => {
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        try {
                            if (res.statusCode !== 200) {
                                reject(new Error(`Katago server returned status ${res.statusCode}: ${data}`));
                                return;
                            }

                            const response = JSON.parse(data);
                            
                            // 카타고 서버 응답 형식에 따라 파싱
                            // 일반적인 형식: { score: number, winner: 'black'|'white', blackScore: number, whiteScore: number }
                            // 또는: { areaScore: { black: number, white: number }, winner: 'black'|'white' }
                            
                            let blackScore = 0;
                            let whiteScore = 0;
                            let winner = 'black';

                            if (response.areaScore) {
                                blackScore = response.areaScore.black || 0;
                                whiteScore = response.areaScore.white || 0;
                                winner = blackScore > whiteScore ? 'black' : (whiteScore > blackScore ? 'white' : 'draw');
                            } else if (response.blackScore !== undefined && response.whiteScore !== undefined) {
                                blackScore = response.blackScore;
                                whiteScore = response.whiteScore;
                                winner = response.winner || (blackScore > whiteScore ? 'black' : (whiteScore > blackScore ? 'white' : 'draw'));
                            } else if (response.score !== undefined) {
                                // 상대 점수 형식 (흑 기준, 양수면 흑 승, 음수면 백 승)
                                const score = parseFloat(response.score);
                                if (score > 0) {
                                    blackScore = score;
                                    whiteScore = 0;
                                    winner = 'black';
                                } else {
                                    blackScore = 0;
                                    whiteScore = Math.abs(score);
                                    winner = 'white';
                                }
                            } else {
                                reject(new Error('Invalid Katago server response format'));
                                return;
                            }

                            console.log(`[AIService] Katago server score: black=${blackScore}, white=${whiteScore}, winner=${winner}`);

                            resolve({
                                areaScore: {
                                    black: blackScore,
                                    white: whiteScore
                                },
                                winner: winner,
                                scoreDetails: response.scoreDetails || {}
                            });
                        } catch (error) {
                            reject(new Error(`Failed to parse Katago server response: ${error.message}`));
                        }
                    });
                });

                req.on('error', (error) => {
                    reject(new Error(`Katago server request failed: ${error.message}`));
                });

                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Katago server request timeout'));
                });

                req.write(postData);
                req.end();
            } catch (error) {
                reject(new Error(`Failed to connect to Katago server: ${error.message}`));
            }
        });
    }

    async getKatagoScoreLocal(gameId, gameState) {
        return new Promise((resolve, reject) => {
            // 로컬 Katago 경로 설정 (프로젝트 내 katago 폴더 사용)
            const isWindows = process.platform === 'win32';
            const katagoDir = path.join(__dirname, '..', 'katago');
            const katagoExecutable = isWindows ? 'katago.exe' : 'katago';
            const katagoPath = process.env.KATAGO_PATH || path.join(katagoDir, katagoExecutable);
            
            // 모델 파일 경로
            const modelPath = process.env.KATAGO_MODEL || path.join(katagoDir, 'kata1-b28c512nbt-s9853922560-d5031756885.bin.gz');
            
            // 설정 파일 경로 (default_gtp.cfg 사용 권장)
            const configPath = process.env.KATAGO_CONFIG || path.join(katagoDir, 'default_gtp.cfg');
            
            console.log(`[AIService] Using local Katago: ${katagoPath}`);
            console.log(`[AIService] Model: ${modelPath}`);
            console.log(`[AIService] Config: ${configPath}`);
            
            // GTP 모드로 실행
            const katago = spawn(katagoPath, [
                'gtp',
                '-model', modelPath,
                '-config', configPath
            ], {
                cwd: katagoDir,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            let errorOutput = '';

            katago.stdout.on('data', (data) => {
                const chunk = data.toString();
                output += chunk;
                checkOutput();
            });

            katago.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            // Send GTP commands
            const boardSize = gameState.boardSize || 19;
            const komi = gameState.komi || 6.5;

            try {
                katago.stdin.write(`boardsize ${boardSize}\n`);
                katago.stdin.write(`komi ${komi}\n`);
                katago.stdin.write('clear_board\n');

                // Replay moves
                gameState.moves.forEach(move => {
                    if (move.isPass) {
                        katago.stdin.write(`play ${move.color === 'black' ? 'B' : 'W'} pass\n`);
                    } else if (move.x !== undefined && move.y !== undefined) {
                        // GTP 좌표 변환: A-T (I 제외)
                        const colChar = String.fromCharCode(65 + move.x + (move.x >= 8 ? 1 : 0));
                        // Y 좌표: 1이 아래쪽 (GTP 표준), move.y는 0이 위쪽 -> 변환
                        const rowNum = boardSize - move.y;
                        
                        katago.stdin.write(`play ${move.color === 'black' ? 'B' : 'W'} ${colChar}${rowNum}\n`);
                    }
                });

                // 점수 계산 요청
                katago.stdin.write('final_score\n');
            } catch (err) {
                if (!katago.killed) katago.kill();
                reject(new Error(`Failed to write to KataGo: ${err.message}`));
                return;
            }

            // Simple parser for GTP response
            // We look for the response to final_score
            // Response format: "= B+10.5" or "= W+5.5" or "= 0"
            // We need to handle the stream properly.
            
            let isResultFound = false;

            // 출력 처리 함수
            const checkOutput = () => {
                if (isResultFound) return;

                const lines = output.split('\n');
                for (let i = lines.length - 1; i >= 0; i--) {
                    const line = lines[i].trim();
                    if (line.startsWith('=')) {
                        const match = line.match(/^=\s*([BW]\+[\d.]+|0|Draw)/i);
                        if (match) {
                            const scoreStr = match[1].toUpperCase();
                            let blackScore = 0;
                            let whiteScore = 0;
                            let winner = 'draw';
                            let scoreDiff = 0;

                            if (scoreStr === '0' || scoreStr === 'DRAW') {
                                winner = 'draw';
                            } else if (scoreStr.startsWith('B+')) {
                                scoreDiff = parseFloat(scoreStr.substring(2));
                                winner = 'black';
                                blackScore = scoreDiff;
                                whiteScore = 0;
                            } else if (scoreStr.startsWith('W+')) {
                                scoreDiff = parseFloat(scoreStr.substring(2));
                                winner = 'white';
                                blackScore = 0;
                                whiteScore = scoreDiff;
                            }

                            console.log(`[AIService] Local KataGo score result: ${scoreStr}`);
                            
                            isResultFound = true;
                            if (!katago.killed) katago.kill();
                            
                            resolve({
                                areaScore: {
                                    black: blackScore,
                                    white: whiteScore
                                },
                                score: winner === 'black' ? scoreDiff : -scoreDiff,
                                winner: winner,
                                method: 'local_katago'
                            });
                            return;
                        }
                    } else if (line.startsWith('?')) {
                        console.error(`[AIService] KataGo returned error: ${line}`);
                    }
                }
            };

            katago.on('close', (code) => {
                if (!isResultFound) {
                    // Try checking output one last time
                    if (!checkOutput()) {
                        console.error('[AIService] Katago closed without score. Output:', output);
                        console.error('[AIService] Katago Stderr:', errorOutput);
                        reject(new Error(`Katago exited with code ${code} without returning score`));
                    }
                }
            });

            // Polling for result (since stream might come in chunks)
            const interval = setInterval(() => {
                if (checkOutput()) {
                    clearInterval(interval);
                }
            }, 100);

            // Timeout (120초)
            setTimeout(() => {
                clearInterval(interval);
                if (!isResultFound) {
                    if (!katago.killed) katago.kill();
                    reject(new Error('Katago scoring timeout (120s)'));
                }
            }, 120000);
        });
    }

    gameStateToSGF(gameState) {
        const boardSize = gameState.boardSize || 19;
        const komi = gameState.komi || 6.5;
        let sgf = `(;FF[4]SZ[${boardSize}]KM[${komi}]`;
        
        gameState.moves.forEach(move => {
            if (move.isPass) {
                sgf += `;${move.color === 'black' ? 'B' : 'W'}[]`;
            } else {
                const x = String.fromCharCode(97 + move.x);
                const y = String.fromCharCode(97 + move.y);
                sgf += `;${move.color === 'black' ? 'B' : 'W'}[${x}${y}]`;
            }
        });

        sgf += ')';
        return sgf;
    }
}

module.exports = new AIService();

