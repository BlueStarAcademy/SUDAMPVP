const gameService = require('../services/gameService');
const timerService = require('../services/timerService');

class GameSocket {
    constructor(io) {
        this.io = io;
        // 게임별로 처리 중인 요청 추적 (중복 요청 방지)
        this.pendingMoves = new Map(); // gameId:userId -> true
    }

    async sendGameState(socket, gameId, userId) {
        try {
            const state = await gameService.getGameState(gameId);
            const game = await gameService.getGame(gameId);
            const timer = await timerService.getTimer(gameId);
            
            const currentTurn = timer.currentTurn || 'black';
            
            // Calculate isMyTurn
            let isMyTurn = false;
            if (game && game.isAiGame) {
                const aiColor = game.aiColor || 'white';
                console.log(`[GameSocket] isMyTurn calculation for AI game:`, {
                    userId,
                    currentTurn,
                    aiColor,
                    gameBlackId: game.blackId,
                    gameWhiteId: game.whiteId,
                    isUserBlack: game.blackId === userId,
                    isUserWhite: game.whiteId === userId
                });
                if (currentTurn === 'black' && aiColor !== 'black' && game.blackId === userId) {
                    isMyTurn = true;
                } else if (currentTurn === 'white' && aiColor !== 'white' && game.whiteId === userId) {
                    isMyTurn = true;
                }
            } else if (game) {
                isMyTurn = (currentTurn === 'black' && game.blackId === userId) ||
                           (currentTurn === 'white' && game.whiteId === userId);
            }
            console.log(`[GameSocket] Final isMyTurn: ${isMyTurn} for user ${userId}`);
            
            console.log(`[GameSocket] Sending game_state:`, {
                boardSize: state.boardSize,
                timeLimit: state.timeLimit,
                byoyomiSeconds: state.byoyomiSeconds,
                byoyomiPeriods: state.byoyomiPeriods,
                isMyTurn: isMyTurn,
                currentTurn: currentTurn
            });
            
            // gameReady는 game.startedAt을 단일 소스로 사용
            const isGameReady = game && game.startedAt !== null;
            
            // 플레이어 정보 가져오기 (게임 시작 후 플레이어 패널에 표시하기 위해)
            let blackPlayer = null;
            let whitePlayer = null;
            
            if (game) {
                const userService = require('../services/userService');
                
                // 흑 플레이어 정보
                if (game.blackId) {
                    try {
                        const blackProfile = await userService.getUserProfile(game.blackId);
                        if (blackProfile) {
                            blackPlayer = {
                                ...blackProfile,
                                avatar: blackProfile.avatar || 1
                            };
                        }
                    } catch (error) {
                        console.error('[GameSocket] Error getting black player profile:', error);
                    }
                } else if (game.isAiGame && game.aiColor === 'black') {
                    // AI가 흑인 경우
                    blackPlayer = {
                        id: null,
                        nickname: `AI (${game.aiLevel || 1}단계)`,
                        rating: game.blackRating || 1500,
                        mannerScore: 1500,
                        avatar: 1
                    };
                }
                
                // 백 플레이어 정보
                if (game.whiteId) {
                    try {
                        const whiteProfile = await userService.getUserProfile(game.whiteId);
                        if (whiteProfile) {
                            whitePlayer = {
                                ...whiteProfile,
                                avatar: whiteProfile.avatar || 1
                            };
                        }
                    } catch (error) {
                        console.error('[GameSocket] Error getting white player profile:', error);
                    }
                } else if (game.isAiGame && game.aiColor === 'white') {
                    // AI가 백인 경우
                    whitePlayer = {
                        id: null,
                        nickname: `AI (${game.aiLevel || 1}단계)`,
                        rating: game.whiteRating || 1500,
                        mannerScore: 1500,
                        avatar: 1
                    };
                }
            }
            
            // 클래식 모드에서는 특별 모드 관련 필드 제외
            const isClassicMode = game && game.mode === 'CLASSIC';
            
            // 기본 게임 상태 (모든 모드 공통)
            const gameStatePayload = {
                ...state,
                currentColor: currentTurn,
                isMyTurn: isMyTurn,
                boardSize: state.boardSize !== undefined && state.boardSize !== null ? parseInt(state.boardSize) : 19,
                timeLimit: state.timeLimit,
                timeIncrement: state.timeIncrement,
                byoyomiSeconds: state.byoyomiSeconds,
                byoyomiPeriods: state.byoyomiPeriods,
                maxMoves: state.maxMoves !== undefined && state.maxMoves !== null ? parseInt(state.maxMoves) : null,
                gameReady: isGameReady,
                readyStatus: state.readyStatus || { black: false, white: false },
                readyDeadline: state.readyDeadline || null,
                // 따낸 돌 수
                capturedBlack: state.capturedBlack || 0,
                capturedWhite: state.capturedWhite || 0,
                game: {
                    id: game.id,
                    blackId: game.blackId,
                    whiteId: game.whiteId,
                    isAiGame: game.isAiGame,
                    aiLevel: game.aiLevel,
                    aiColor: game.aiColor,
                    mode: game.mode,
                    endedAt: game.endedAt,
                    startedAt: game.startedAt // 클라이언트에서 gameReady 확인용
                },
                timers: {
                    blackTime: timer.blackTime,
                    whiteTime: timer.whiteTime,
                    currentTurn: timer.currentTurn,
                    blackInByoyomi: timer.blackInByoyomi,
                    whiteInByoyomi: timer.whiteInByoyomi,
                    blackByoyomiPeriods: timer.blackByoyomiPeriods,
                    whiteByoyomiPeriods: timer.whiteByoyomiPeriods,
                    byoyomiSeconds: timer.byoyomiSeconds
                },
                // AI 게임 자동 계가 수순
                autoScoringMove: state.autoScoringMove || undefined,
                // 플레이어 정보 (게임 시작 후 플레이어 패널에 표시하기 위해)
                blackPlayer: blackPlayer,
                whitePlayer: whitePlayer
            };
            
            // 클래식 모드가 아닐 때만 특별 모드 관련 필드 추가
            if (!isClassicMode) {
                // CAPTURE 모드 관련 정보
                if (state.mode === 'CAPTURE' || state.mode === 'MIX') {
                    gameStatePayload.biddingPhase = state.biddingPhase || false;
                    gameStatePayload.biddingRound = state.biddingRound || 1;
                    gameStatePayload.bids = state.bids || {};
                    gameStatePayload.captureTarget = state.captureTarget || null;
                    gameStatePayload.finalCaptureTarget = state.finalCaptureTarget || null;
                    gameStatePayload.blackCaptureTarget = state.blackCaptureTarget || null;
                    gameStatePayload.whiteCaptureTarget = state.whiteCaptureTarget || null;
                }
                
                // SPEED 모드 돌가리기 관련 정보
                if (state.mode === 'SPEED') {
                    gameStatePayload.stonePickingPhase = state.stonePickingPhase || false;
                    gameStatePayload.stonePickingRole = state.stonePickingRoles && (state.stonePickingRoles.black === userId ? 'black' : (state.stonePickingRoles.white === userId ? 'white' : null));
                    gameStatePayload.stonePickingDeadline = state.stonePickingDeadline || null;
                }
                
                // HIDDEN 모드 관련 정보
                if (state.mode === 'HIDDEN') {
                    gameStatePayload.hiddenItemActive = state.hiddenItemActive || { black: false, white: false };
                    gameStatePayload.hiddenItemDeadline = state.hiddenItemDeadline || { black: null, white: null };
                    gameStatePayload.scanItemActive = state.scanItemActive || { black: false, white: false };
                    gameStatePayload.scanItemDeadline = state.scanItemDeadline || { black: null, white: null };
                    gameStatePayload.hiddenStonesUsed = state.hiddenStonesUsed || { black: 0, white: 0 };
                    gameStatePayload.hiddenStoneCount = state.hiddenStoneCount || 10;
                    gameStatePayload.scanUsed = state.scanUsed || { black: 0, white: 0 };
                    gameStatePayload.scanCount = state.scanCount || { black: 3, white: 3 };
                    gameStatePayload.hiddenStones = state.hiddenStones ? (() => {
                        // 각 유저별로 자신의 히든 돌과 스캔으로 발견한 상대방 히든 돌만 전송
                        const playerKey = game.blackId === userId ? 'black' : 'white';
                        const opponentKey = playerKey === 'black' ? 'white' : 'black';
                        const myHiddenStones = state.hiddenStones[playerKey] || [];
                        const opponentHiddenStones = (state.hiddenStones[opponentKey] || []).filter(hs => {
                            // 스캔으로 발견했거나 전체 공개된 히든 돌만 전송
                            return hs.scannedBy && hs.scannedBy.includes(userId) || 
                                   (state.revealedStones && state.revealedStones.some(rs => rs.x === hs.x && rs.y === hs.y));
                        });
                        return {
                            [playerKey]: myHiddenStones,
                            [opponentKey]: opponentHiddenStones
                        };
                    })() : null;
                    gameStatePayload.scannedStones = state.scannedStones ? (state.scannedStones[game.blackId === userId ? 'black' : 'white'] || []) : [];
                    gameStatePayload.revealedStones = state.revealedStones || [];
                }
                
                // MISSILE 모드 관련 정보
                if (state.mode === 'MISSILE') {
                    gameStatePayload.missileItemActive = state.missileItemActive || { black: false, white: false };
                    gameStatePayload.missileMovesUsed = state.missileMovesUsed || { black: 0, white: 0 };
                    gameStatePayload.missileMoveLimit = state.missileMoveLimit || 10;
                }
                
                // MIX 모드 관련 정보
                if (state.mode === 'MIX') {
                    gameStatePayload.mixModes = state.mixModes || [];
                    gameStatePayload.currentMixMode = state.currentMixMode || null;
                    gameStatePayload.mixModeIndex = state.mixModeIndex || 0;
                    gameStatePayload.mixModeSwitchCount = state.mixModeSwitchCount || 50;
                }
                
                // BASE 모드 관련 정보
                if (state.mode === 'BASE') {
                    gameStatePayload.baseStones = state.baseStones || null;
                    gameStatePayload.baseStoneCount = state.baseStoneCount || 4;
                    gameStatePayload.basePlacementPhase = state.basePlacementPhase || false;
                    gameStatePayload.baseStonesRevealed = state.baseStonesRevealed || false;
                    gameStatePayload.colorSelectionPhase = state.colorSelectionPhase || false;
                    gameStatePayload.colorSelections = state.colorSelections || {};
                    gameStatePayload.colorSelectionDeadline = state.colorSelectionDeadline || null;
                    gameStatePayload.komiBiddingPhase = state.komiBiddingPhase || false;
                    gameStatePayload.komiBiddingRound = state.komiBiddingRound || 1;
                    gameStatePayload.komiBids = state.komiBids || {};
                    gameStatePayload.komiBiddingDeadline = state.komiBiddingDeadline || null;
                    gameStatePayload.finalKomi = state.finalKomi || 0.5;
                }
            }
            
            socket.emit('game_state', gameStatePayload);

            // AI가 첫 수를 두는 경우 (베이스바둑은 gameReady가 true일 때만)
            if (game.isAiGame && game.aiColor === 'black' && state.moveNumber === 0) {
                // 베이스바둑은 색상 선택 및 덤 설정이 완료되어야 게임 시작
                // game.startedAt을 단일 소스로 사용
                if (game.mode === 'BASE' && !isGameReady) {
                    // 베이스바둑이고 아직 준비되지 않았으면 AI가 수를 두지 않음
                    return;
                }
                const aiService = require('../services/aiService');
                this.io.to(`game-${gameId}`).emit('ai_thinking');
                aiService.getAiMove(gameId, game.aiLevel).catch(error => {
                    console.error('AI first move error:', error);
                    this.io.to(`game-${gameId}`).emit('ai_error', { error: error.message });
                });
            }
        } catch (error) {
            console.error('Get game state error:', error);
            socket.emit('game_error', { error: error.message });
        }
    }

    handleConnection(socket, gameId, userId) {
        console.log(`[GameSocket] User ${userId} connected to game ${gameId}`);
        
        // gameId 유효성 검사
        if (!gameId || gameId === '' || gameId === 'undefined' || gameId === 'null') {
            console.error(`[GameSocket] Invalid gameId: ${gameId}`);
            socket.emit('game_error', { error: 'Invalid game ID' });
            return;
        }
        
        // 게임 room에 join (중요: move_made 이벤트를 받기 위해 필수)
        const gameRoom = `game-${gameId}`;
        socket.join(gameRoom);
        console.log(`[GameSocket] Socket ${socket.id} joined room ${gameRoom} for user ${userId}`);

        // Throttle for get_game_state requests
        let lastRequestTime = 0;
        const REQUEST_THROTTLE = 5000; // 5초

        // Timer update interval (1초마다, 하지만 게임 상태 확인은 5초마다)
        // 게임 종료 여부를 캐시하여 불필요한 DB 쿼리 방지
        let gameEnded = false;
        let gameReadyCached = false; // 게임 준비 상태 캐시
        let lastGameCheckTime = 0;
        const GAME_CHECK_INTERVAL = 5000; // 5초마다 게임 상태 확인 (무한루프 방지)
        
        const timerUpdateInterval = setInterval(async () => {
            try {
                // gameId 유효성 재확인
                if (!gameId || gameId === '' || gameId === 'undefined' || gameId === 'null') {
                    clearInterval(timerUpdateInterval);
                    return;
                }
                
                // 게임이 종료되었으면 더 이상 업데이트하지 않음
                if (gameEnded) {
                    clearInterval(timerUpdateInterval);
                    return;
                }
                
                const now = Date.now();
                
                // 게임 상태 확인은 5초마다만 수행 (무한루프 방지)
                if (!gameReadyCached || now - lastGameCheckTime >= GAME_CHECK_INTERVAL) {
                    lastGameCheckTime = now;
                    
                    // 게임 상태 확인 (게임이 실제로 시작되었는지 확인)
                    // 무한루프 방지: getGameState 대신 getGame만 호출하여 gameReady 확인
                    const game = await gameService.getGame(gameId);
                    if (!game) {
                        return; // 게임이 없으면 건너뜀
                    }
                    
                    // 게임이 종료되었는지 확인
                    if (game.endedAt) {
                        gameEnded = true;
                        clearInterval(timerUpdateInterval);
                        return;
                    }
                    
                    // 게임 준비 상태는 타이머 서비스에서 확인 (getGameState 호출 없이)
                    const isGameReady = game.startedAt !== null;
                    
                    // gameReady 상태가 변경되었으면 캐시 업데이트 및 게임 상태 전송
                    if (isGameReady !== gameReadyCached) {
                        gameReadyCached = isGameReady;
                        console.log(`[GameSocket] Game ${gameId} ready status changed: ${isGameReady}`);
                        
                        // 게임 상태 변경 시 클라이언트에 알림
                        await this.sendGameState(socket, gameId, userId);
                    }
                    
                    // 게임이 준비되지 않았으면 타이머 관련 작업 완전 차단
                    if (!isGameReady) {
                        // 일반 게임인 경우에만 자동 시작 체크 (AI 게임 제외)
                        if (game && !game.isAiGame) {
                            const started = await gameService.checkAndStartGame(gameId);
                            if (started) {
                                // 게임 정보 다시 가져오기 (startedAt 확인용)
                                const updatedGame = await gameService.getGame(gameId);
                                if (updatedGame && updatedGame.startedAt !== null) {
                                    // 타이머 시작 (startedAt 설정 후 즉시)
                                    await timerService.startTimer(gameId);
                                    
                                    // 모든 클라이언트에 게임 상태 전송
                                    const allSockets = await this.io.in(`game-${gameId}`).fetchSockets();
                                    for (const s of allSockets) {
                                        if (s.userId) {
                                            await this.sendGameState(s, gameId, s.userId);
                                        }
                                    }
                                    
                                    this.io.to(`game-${gameId}`).emit('game_started', {
                                        immediate: false,
                                        autoStart: true
                                    });
                                }
                            }
                        }
                        // 게임이 준비되지 않았으면 타이머 관련 작업 완전 차단
                        return;
                    }
                }
                
                // 게임이 준비된 경우에만 타이머 확인 및 업데이트
                if (!gameReadyCached) {
                    return; // 게임이 준비되지 않았으면 타이머 업데이트 안 함
                }
                
                // 게임이 준비된 경우에만 타이머 확인 및 업데이트
                // 타이머가 일시정지 상태인지 먼저 확인
                const timer = await timerService.getTimer(gameId);
                if (!timer) {
                    return; // 타이머가 없으면 건너뜀
                }
                
                // 일시정지 상태가 아니면 업데이트 (gameReady === true이고 isPaused === false일 때만)
                if (timer.isPaused === false) {
                    const updatedTimer = await timerService.updateTimer(gameId);
                    if (updatedTimer) {
                        // 시간 초과 확인
                        if (updatedTimer.timeExpired) {
                            console.log(`[GameSocket] Time expired for ${updatedTimer.expiredColor} in game ${gameId}`);
                            gameEnded = true;
                            clearInterval(timerUpdateInterval);
                            
                            // 시간패 처리
                            const { result, rewards } = await gameService.handleTimeExpired(gameId, updatedTimer.expiredColor);
                            const endedGame = await gameService.getGame(gameId);
                            
                            // 종료 이유 설정 (시간패)
                            const reason = updatedTimer.expiredColor === 'black' ? 'time_loss_black' : 'time_loss_white';
                            
                            // 게임 종료 이벤트 전송
                            this.io.to(`game-${gameId}`).emit('game_ended', {
                                result,
                                rewards,
                                game: endedGame,
                                reason: reason
                            });
                            return;
                        }

                        this.io.to(`game-${gameId}`).emit('timer_update', {
                            blackTime: updatedTimer.blackTime,
                            whiteTime: updatedTimer.whiteTime,
                            currentTurn: updatedTimer.currentTurn,
                            blackInByoyomi: updatedTimer.blackInByoyomi,
                            whiteInByoyomi: updatedTimer.whiteInByoyomi,
                            blackByoyomiTime: updatedTimer.blackByoyomiTime,
                            whiteByoyomiTime: updatedTimer.whiteByoyomiTime,
                            blackByoyomiPeriods: updatedTimer.blackByoyomiPeriods,
                            whiteByoyomiPeriods: updatedTimer.whiteByoyomiPeriods,
                            byoyomiSeconds: updatedTimer.byoyomiSeconds
                        });
                    } else {
                        // 타이머가 없으면 게임이 종료된 것으로 간주
                        gameEnded = true;
                        clearInterval(timerUpdateInterval);
                    }
                }
            } catch (error) {
                // 에러 발생 시 로그를 최소화 (무한 로그 방지)
                if (error.message && !error.message.includes('ECONNREFUSED')) {
                    console.error(`[GameSocket] Timer update error for game ${gameId}:`, error.message);
                }
            }
        }, 1000); // 1초마다 업데이트

        // Clean up interval when socket disconnects
        socket.on('disconnect', () => {
            clearInterval(timerUpdateInterval);
            // 연결 종료 시 해당 사용자의 모든 대기 중인 요청 제거
            const moveKey = `${gameId}:${userId}`;
            this.pendingMoves.delete(moveKey);
        });

        // handleConnection이 호출될 때 이미 join_game이 처리되었으므로 바로 초기 상태 전송
        let initialStateSent = false;
        let initialSendPromise = this.sendGameState(socket, gameId, userId).then(() => {
            initialStateSent = true;
            console.log('[GameSocket] Initial game state sent');
        }).catch(err => {
            console.error('Error sending initial game state:', err);
        });

        // Get game state (throttled, 최소 10초 간격)
        let gameStateSentCount = 0;
        socket.on('get_game_state', async () => {
            const now = Date.now();
            
            // 초기 상태 전송이 완료될 때까지 대기
            if (!initialStateSent) {
                try {
                    await initialSendPromise;
                } catch (err) {
                    // 에러는 이미 로그됨
                }
            }
            
            // 초기 상태를 보낸 직후에는 요청 무시 (10초)
            if (initialStateSent && now - lastRequestTime < 10000) {
                console.log(`[GameSocket] get_game_state ignored (initial state sent ${now - lastRequestTime}ms ago)`);
                return;
            }
            
            if (now - lastRequestTime < REQUEST_THROTTLE) {
                console.log(`[GameSocket] get_game_state throttled (last request: ${now - lastRequestTime}ms ago)`);
                return;
            }
            
            lastRequestTime = now;
            gameStateSentCount++;
            console.log(`[GameSocket] get_game_state request #${gameStateSentCount}`);
            await this.sendGameState(socket, gameId, userId);
        });

        // Color selection (베이스바둑 색상 선택)
        socket.on('select_color', async (data) => {
            try {
                const { color } = data;
                const result = await gameService.selectColor(gameId, userId, color);
                
                // 색상 선택 결과 브로드캐스트
                this.io.to(`game-${gameId}`).emit('color_selection_update', {
                    colorSelections: result.colorSelections,
                    colorSelectionPhase: result.colorSelectionPhase,
                    komiBiddingPhase: result.komiBiddingPhase,
                    needKomiBidding: result.needKomiBidding
                });
                
                // 색상 선택이 완료되었고 덤 입찰이 필요한 경우
                if (!result.colorSelectionPhase && result.needKomiBidding) {
                    // 게임 상태 업데이트
                    await this.sendGameState(socket, gameId, userId);
                } else if (!result.colorSelectionPhase && !result.needKomiBidding) {
                    // 덤 입찰이 필요 없는 경우 (다른 색상 선택) 게임 시작
                    await timerService.startTimer(gameId);
                    await this.sendGameState(socket, gameId, userId);
                    this.io.to(`game-${gameId}`).emit('color_selection_complete', {
                        colorSelections: result.colorSelections,
                        finalKomi: 0.5
                    });
                }
            } catch (error) {
                console.error('Color selection error:', error);
                socket.emit('color_selection_error', { error: error.message });
            }
        });

        // Komi bid (베이스바둑 덤 입찰)
        socket.on('submit_komi_bid', async (data) => {
            try {
                const { komi } = data;
                const result = await gameService.submitKomiBid(gameId, userId, komi);
                
                // 덤 입찰 결과 브로드캐스트
                this.io.to(`game-${gameId}`).emit('komi_bid_update', {
                    komiBids: result.komiBids,
                    komiBiddingRound: result.komiBiddingRound,
                    komiBiddingPhase: result.komiBiddingPhase,
                    needRebid: result.needRebid
                });
                
                // 입찰이 완료되었고 재입찰이 필요 없는 경우
                if (!result.needRebid && result.komiBiddingPhase === false) {
                    // 게임 시작을 위해 타이머 시작
                    await timerService.startTimer(gameId);
                    
                    // 게임 상태 업데이트 및 게임 시작
                    await this.sendGameState(socket, gameId, userId);
                    // 모든 클라이언트에게 게임 상태 전송
                    this.io.to(`game-${gameId}`).emit('komi_bid_complete', {
                        winnerId: result.winnerId,
                        finalKomi: result.finalKomi,
                        komiBiddingRound: result.komiBiddingRound
                    });
                    
                    // 게임 시작 이벤트 전송
                    this.io.to(`game-${gameId}`).emit('game_started', {
                        gameId: gameId,
                        finalKomi: result.finalKomi
                    });
                }
            } catch (error) {
                console.error('Komi bid error:', error);
                socket.emit('komi_bid_error', { error: error.message });
            }
        });

        // Stone picking choice (돌가리기)
        socket.on('stone_picking_choice', async (data) => {
            try {
                const { choice } = data;
                const result = await gameService.submitStonePickingChoice(gameId, userId, choice);
                
                // 돌가리기 결과 브로드캐스트
                this.io.to(`game-${gameId}`).emit('stone_picking_update', {
                    choice: result.choice,
                    stonePickingPhase: result.stonePickingPhase,
                    needProcessing: result.needProcessing
                });
                
                // 돌가리기가 완료되었고 처리할 필요가 있는 경우
                if (!result.stonePickingPhase && result.needProcessing) {
                    // 게임 상태 업데이트 및 게임 시작
                    await timerService.startTimer(gameId);
                    
                    // 모든 클라이언트에게 게임 상태 전송
                    const game = await gameService.getGame(gameId);
                    const allUsers = [game.blackId, game.whiteId].filter(Boolean);
                    for (const uid of allUsers) {
                        const userSocket = Array.from(this.io.sockets.sockets.values())
                            .find(s => s.userId === uid);
                        if (userSocket) {
                            await this.sendGameState(userSocket, gameId, uid);
                        }
                    }
                    
                    // 돌가리기 완료 이벤트 브로드캐스트
                    this.io.to(`game-${gameId}`).emit('stone_picking_complete', {
                        result: result.result,
                        winnerRole: result.winnerRole,
                        finalBlackId: result.finalBlackId,
                        finalWhiteId: result.finalWhiteId,
                        stoneCount: result.stoneCount,
                        isCorrect: result.isCorrect
                    });
                }
            } catch (error) {
                console.error('Stone picking choice error:', error);
                socket.emit('stone_picking_error', { error: error.message });
            }
        });

        // Capture bid (덤 설정)
        socket.on('capture_bid', async (data) => {
            try {
                const { bid } = data;
                const result = await gameService.submitCaptureBid(gameId, userId, bid);
                
                // 입찰 결과 브로드캐스트
                this.io.to(`game-${gameId}`).emit('capture_bid_update', {
                    bids: result.bids,
                    biddingRound: result.biddingRound,
                    biddingPhase: result.biddingPhase,
                    needRebid: result.needRebid,
                    winnerId: result.winnerId,
                    winnerBid: result.winnerBid,
                    finalTarget: result.finalTarget
                });
                
                // 입찰이 완료되었고 재입찰이 필요 없는 경우
                if (!result.needRebid && result.biddingPhase === false) {
                    // 게임 시작을 위해 타이머 시작
                    await timerService.startTimer(gameId);
                    
                    // 게임 상태 업데이트 및 게임 시작
                    await this.sendGameState(socket, gameId, userId);
                    // 모든 클라이언트에게 게임 상태 전송
                    this.io.to(`game-${gameId}`).emit('capture_bid_complete', {
                        winnerId: result.winnerId,
                        winnerBid: result.winnerBid,
                        finalTarget: result.finalTarget,
                        biddingRound: result.biddingRound
                    });
                }
            } catch (error) {
                console.error('Capture bid error:', error);
                socket.emit('capture_bid_error', { error: error.message });
            }
        });

        // Make move
        socket.on('make_move', async (data) => {
            console.log(`[GameSocket] make_move received:`, { gameId, userId, move: data.move });
            
            // 중복 요청 방지: 같은 게임에서 같은 사용자의 요청이 처리 중이면 무시
            const moveKey = `${gameId}:${userId}`;
            if (this.pendingMoves.has(moveKey)) {
                console.log(`[GameSocket] Duplicate move request ignored for ${moveKey}`);
                return;
            }
            
            // 요청 처리 중 플래그 설정
            this.pendingMoves.set(moveKey, true);
            
            try {
                console.log(`[GameSocket] Calling gameService.makeMove:`, { gameId, userId, move: data.move });
                const moveResult = await gameService.makeMove(gameId, userId, data.move);
                console.log(`[GameSocket] gameService.makeMove result:`, { 
                    hasResult: !!moveResult, 
                    moveResult: moveResult ? { 
                        x: moveResult.x, 
                        y: moveResult.y, 
                        color: moveResult.color,
                        isPass: moveResult.isPass 
                    } : null 
                });
                
                // 요청 처리 완료 후 플래그 제거
                this.pendingMoves.delete(moveKey);
                
                if (!moveResult) {
                    console.log(`[GameSocket] moveResult is null, emitting move_error`);
                    socket.emit('move_error', { error: 'Invalid move' });
                    return;
                }

                const updatedGame = await gameService.getGame(gameId);
                
                // 히든바둑: 차례 유지가 필요한 경우 switchTurn 호출 안 함
                let timer;
                if (moveResult.maintainTurn) {
                    timer = await timerService.getTimer(gameId);
                } else {
                    timer = await timerService.switchTurn(gameId, updatedGame.mode);
                }
                
                // Get updated game state for captured stones count
                const gameState = await gameService.getGameState(gameId);
                
                // 히든바둑: 히든 돌 공개 처리
                if (moveResult.hiddenStonesRevealed && moveResult.hiddenStonesRevealed.length > 0) {
                    this.io.to(`game-${gameId}`).emit('hidden_stones_revealed', {
                        positions: moveResult.hiddenStonesRevealed,
                        maintainTurn: moveResult.maintainTurn || false
                    });
                }
                
                // Broadcast move
                const moveMadePayload = {
                    move: moveResult,
                    currentColor: timer.currentTurn,
                    capturedStones: moveResult.capturedStones || [],
                    capturedBlack: gameState.capturedBlack || 0,
                    capturedWhite: gameState.capturedWhite || 0,
                    maintainTurn: moveResult.maintainTurn || false,
                    mixModeSwitched: moveResult.mixModeSwitched || false,
                    currentMixMode: moveResult.currentMixMode || null,
                    isGameOver: moveResult.isGameOver || false,
                    isDoublePass: moveResult.isDoublePass || false,
                    autoScoring: moveResult.autoScoring || false,
                    // CAPTURE 모드 관련 정보
                    captureTarget: gameState.captureTarget || null,
                    finalCaptureTarget: gameState.finalCaptureTarget || null,
                    blackCaptureTarget: gameState.blackCaptureTarget || null,
                    whiteCaptureTarget: gameState.whiteCaptureTarget || null,
                    // BASE 모드 관련 정보
                    baseStones: gameState.baseStones || null,
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
                    timers: {
                        blackTime: timer.blackTime,
                        whiteTime: timer.whiteTime,
                        currentTurn: timer.currentTurn,
                        blackInByoyomi: timer.blackInByoyomi,
                        whiteInByoyomi: timer.whiteInByoyomi,
                        blackByoyomiPeriods: timer.blackByoyomiPeriods,
                        whiteByoyomiPeriods: timer.whiteByoyomiPeriods,
                        byoyomiSeconds: timer.byoyomiSeconds
                    }
                };
                
                const gameRoom = `game-${gameId}`;
                const roomSockets = await this.io.in(gameRoom).fetchSockets();
                console.log(`[GameSocket] Emitting move_made event to ${gameRoom}:`, {
                    move: moveMadePayload.move ? { x: moveMadePayload.move.x, y: moveMadePayload.move.y, color: moveMadePayload.move.color } : null,
                    currentColor: moveMadePayload.currentColor,
                    gameMode: moveMadePayload.game.mode,
                    capturedStones: moveMadePayload.capturedStones.length,
                    roomSize: roomSockets.length,
                    socketIds: roomSockets.map(s => s.id)
                });
                
                this.io.to(gameRoom).emit('move_made', moveMadePayload);
                
                // Pass Notification
                if (moveResult.isPass) {
                    const passColor = moveResult.color === 'black' ? '흑' : '백';
                    let passMessage = `${passColor}이(가) 통과했습니다.`;
                    
                    if (moveResult.isDoublePass) {
                         passMessage += ' 서로 통과하여 계가(집계산)가 진행됩니다.';
                    } else {
                         passMessage += ' 서로 통과하면 계가(집계산)이 진행됩니다.';
                    }
                    
                    this.io.to(gameRoom).emit('chat_message', {
                        user: 'System',
                        message: passMessage,
                        timestamp: Date.now(),
                        isSystem: true
                    });
                }
                
                console.log(`[GameSocket] move_made event emitted successfully to ${roomSockets.length} socket(s) in room ${gameRoom}`);
                
                // move_made 후 game_state 전송하여 클라이언트가 턴과 타이머를 업데이트할 수 있도록 함
                // 각 socket에 대해 sendGameState 호출 (fetchSockets()로 가져온 socket 객체 사용)
                for (const s of roomSockets) {
                    if (s.userId) {
                        try {
                            // fetchSockets()로 가져온 socket 객체는 실제 socket이므로 직접 사용 가능
                            await this.sendGameState(s, gameId, s.userId);
                        } catch (error) {
                            console.error(`[GameSocket] Error sending game_state to socket ${s.id}:`, error);
                        }
                    }
                }
                
                console.log(`[GameSocket] game_state events sent to all sockets after move_made`);
                
                // 믹스바둑: 모드 전환 알림
                if (moveResult.mixModeSwitched && moveResult.currentMixMode) {
                    this.io.to(`game-${gameId}`).emit('mix_mode_switched', {
                        currentMixMode: moveResult.currentMixMode,
                        moveNumber: moveResult.moveNumber
                    });
                }
                
                // Check if game ended
                if (moveResult.isGameOver) {
                    const gameState = await gameService.getGameState(gameId);
                    
                    // CAPTURE 모드나 MIX 모드의 CAPTURE인 경우 계가 없이 바로 종료
                    const isCaptureMode = updatedGame.mode === 'CAPTURE' || gameState.mode === 'CAPTURE';
                    const isMixMode = updatedGame.mode === 'MIX' || gameState.mode === 'MIX';
                    const currentMixMode = gameState.currentMixMode || gameState.mixModes?.[0] || 'CLASSIC';
                    const isMixCapture = isMixMode && currentMixMode === 'CAPTURE';
                    const shouldSkipScoring = isCaptureMode || isMixCapture;
                    
                    if (shouldSkipScoring) {
                        console.log('[GameSocket] CAPTURE game ended by target score reached');
                        
                        // 게임 결과 결정 (finishGame에서 이미 result가 설정됨)
                        const endedGame = await gameService.getGame(gameId);
                        const result = endedGame.result || (gameState.capturedBlack >= (gameState.blackCaptureTarget || gameState.captureTarget || 20) ? 'black_win' : 'white_win');
                        
                        // 보상 처리 (endGame 호출하여 레이팅 업데이트)
                        const { rewards, game: endGameData } = await gameService.endGame(gameId, gameState);
                        
                        // 게임 종료 이벤트 전송 (계가 없이)
                        this.io.to(`game-${gameId}`).emit('game_ended', {
                            result,
                            score: null, // CAPTURE 모드에서는 계가 없음
                            rewards,
                            game: endGameData,
                            reason: '목표 따내기 점수 달성'
                        });
                        return;
                    } else if (moveResult.autoScoring) {
                        // AI 대국 자동 계가: 설정된 수순에 도달하여 자동 계가 진행
                        console.log('[GameSocket] Game ended by auto scoring at move', moveResult.moveNumber);
                        
                        // 마지막 수가 두어지는 것을 보여주기 위해 약간의 지연 후 계가 진행
                        setTimeout(async () => {
                            this.io.to(`game-${gameId}`).emit('scoring_started', { message: '계가를 진행하고 있습니다...' });
                            
                            const { result, score, rewards, game: endGameData } = await gameService.endGame(gameId, gameState);
                            
                            // 계가 결과 전송
                            this.io.to(`game-${gameId}`).emit('game_ended', {
                                result,
                                score,
                                rewards,
                                game: endGameData,
                                reason: `자동 계가 (${moveResult.moveNumber}수)`
                            });
                        }, 1500); // 1.5초 지연
                        return;
                    } else if (moveResult.isDoublePass) {
                        // 일반 게임: 양쪽 통과 시 계가 진행
                        // move_made 이벤트는 이미 위에서 emit되었으므로, 바로 계가 시작
                        console.log('[GameSocket] Game ended by double pass, starting scoring');
                        
                        // 잠시 대기 후 계가 시작 (클라이언트가 패스를 표시할 시간을 줌)
                        setTimeout(async () => {
                            this.io.to(`game-${gameId}`).emit('scoring_started', { message: '계가를 진행하고 있습니다...' });
                            
                            const { result, score, rewards, game: endGameData } = await gameService.endGame(gameId, gameState);
                            
                            // 계가 결과 전송
                            this.io.to(`game-${gameId}`).emit('game_ended', {
                                result,
                                score,
                                rewards,
                                game: endGameData
                            });
                        }, 500);
                        return;
                    } else if (moveResult.isMaxMovesReached) {
                        // 클래식 바둑: 제한 턴수 도달 시 계가 진행
                        console.log('[GameSocket] Game ended by max moves reached, starting scoring');
                        this.io.to(`game-${gameId}`).emit('scoring_started', { message: '계가를 진행하고 있습니다...' });
                        
                        const { result, score, rewards, game: endGameData } = await gameService.endGame(gameId, gameState);
                        
                        // 계가 결과 전송
                        this.io.to(`game-${gameId}`).emit('game_ended', {
                            result,
                            score,
                            rewards,
                            game: endGameData,
                            reason: `제한 턴수 도달 (${moveResult.moveNumber}수)`
                        });
                        return;
                    } else {
                        // 기타 게임 종료 (예: 시간 초과 등)
                        console.log('[GameSocket] Game ended (other reason), starting scoring');
                        this.io.to(`game-${gameId}`).emit('scoring_started', { message: '계가를 진행하고 있습니다...' });
                        
                        const { result, score, rewards, game: endGameData } = await gameService.endGame(gameId, gameState);
                        
                        // 계가 결과 전송
                        this.io.to(`game-${gameId}`).emit('game_ended', {
                            result,
                            score,
                            rewards,
                            game: endGameData
                        });
                        return;
                    }
                }
                
                // Check if AI turn (베이스바둑은 gameReady가 true일 때만)
                if (updatedGame.isAiGame && updatedGame.aiColor !== moveResult.color) {
                    // 베이스바둑은 색상 선택 및 덤 설정이 완료되어야 AI가 수를 둠
                    if (updatedGame.mode === 'BASE') {
                        const currentState = await gameService.getGameState(gameId);
                        if (!currentState.gameReady) {
                            // 베이스바둑이고 아직 준비되지 않았으면 AI가 수를 두지 않음
                            return;
                        }
                    }
                    const aiService = require('../services/aiService');
                    this.io.to(`game-${gameId}`).emit('ai_thinking');
                    aiService.getAiMove(gameId, updatedGame.aiLevel).catch(error => {
                        console.error('AI move error:', error);
                        this.io.to(`game-${gameId}`).emit('ai_error', { error: error.message });
                    });
                }
            } catch (error) {
                // 에러 발생 시에도 플래그 제거
                this.pendingMoves.delete(moveKey);
                console.error('Make move error:', error);
                console.error('[GameSocket] Emitting move_error to socket:', socket.id, 'error:', error.message);
                
                // move_error 이벤트를 해당 socket에만 전송
                socket.emit('move_error', { error: error.message });
                
                // 디버깅: emit 후 확인
                console.log('[GameSocket] move_error emitted to socket:', socket.id);
            }
        });

        // Resign
        socket.on('resign', async () => {
            try {
                const { result, rewards } = await gameService.resign(gameId, userId);
                const game = await gameService.getGame(gameId);
                // 기권 이유 추가
                const reason = result === 'black_win' ? 'resign_white' : 'resign_black';
                this.io.to(`game-${gameId}`).emit('game_ended', {
                    result,
                    rewards,
                    game: game,
                    reason: reason
                });
            } catch (error) {
                console.error('Resign error:', error);
                socket.emit('resign_error', { error: error.message });
            }
        });

        // Player ready
        socket.on('player_ready', async () => {
            try {
                const result = await gameService.setPlayerReady(gameId, userId);
                
                // 게임 정보 가져오기 (startedAt 확인용)
                const game = await gameService.getGame(gameId);
                
                // 준비 상태 업데이트를 모든 클라이언트에 브로드캐스트
                this.io.to(`game-${gameId}`).emit('ready_status_update', {
                    readyStatus: result.readyStatus,
                    gameReady: result.gameReady,
                    game: game ? {
                        id: game.id,
                        startedAt: game.startedAt
                    } : null
                });

                // 게임이 시작되었으면 game_started 이벤트 emit 및 타이머 시작
                if (result.started && game && game.startedAt !== null) {
                    const isAiGame = game.isAiGame;
                    
                    // 타이머 시작 (startedAt 설정 후 즉시)
                    await timerService.startTimer(gameId);
                    
                    // 모든 클라이언트에 게임 상태 전송
                    const allSockets = await this.io.in(`game-${gameId}`).fetchSockets();
                    for (const s of allSockets) {
                        if (s.userId) {
                            await this.sendGameState(s, gameId, s.userId);
                        }
                    }
                    
                    this.io.to(`game-${gameId}`).emit('game_started', {
                        immediate: !isAiGame && result.readyStatus.black && result.readyStatus.white,
                        autoStart: false
                    });
                }
            } catch (error) {
                console.error('Player ready error:', error);
                socket.emit('ready_error', { error: error.message });
            }
        });
        
        // 베이스바둑 AI 게임 색상 및 덤 설정
        socket.on('set_base_game_settings', async (data) => {
            try {
                const { color, komi } = data;
                const result = await gameService.setBaseGameSettings(gameId, userId, color, komi);
                
                // 게임 정보 가져오기 (startedAt 확인용)
                const game = await gameService.getGame(gameId);
                
                // 게임이 시작되었으면 타이머 시작 (startedAt 설정 후 즉시)
                if (result.gameReady && game && game.startedAt !== null) {
                    await timerService.startTimer(gameId);
                }
                
                // 게임 상태 업데이트 전송
                await this.sendGameState(socket, gameId, userId);
                
                // 모든 클라이언트에 설정 완료 알림 (game 객체 포함)
                this.io.to(`game-${gameId}`).emit('base_game_settings_set', {
                    color: result.color,
                    komi: result.komi,
                    gameReady: result.gameReady,
                    game: game ? {
                        id: game.id,
                        startedAt: game.startedAt
                    } : null
                });
                
                // 게임 시작 이벤트 전송
                if (result.gameReady && game && game.startedAt !== null) {
                    this.io.to(`game-${gameId}`).emit('game_started', {
                        immediate: true,
                        autoStart: false
                    });
                }
            } catch (error) {
                console.error('Set base game settings error:', error);
                socket.emit('base_game_settings_error', { error: error.message });
            }
        });

        // 히든 아이템 사용 시작
        socket.on('start_hidden_item', async () => {
            try {
                const result = await gameService.startHiddenItem(gameId, userId);
                
                // 히든 아이템 시작 브로드캐스트
                this.io.to(`game-${gameId}`).emit('hidden_item_started', {
                    hiddenItemActive: result.hiddenItemActive,
                    hiddenItemDeadline: result.hiddenItemDeadline
                });
                
                // 게임 상태 업데이트
                await this.sendGameState(socket, gameId, userId);
            } catch (error) {
                console.error('Start hidden item error:', error);
                socket.emit('hidden_item_error', { error: error.message });
            }
        });

        // 히든 돌 배치
        socket.on('place_hidden_stone', async (data) => {
            try {
                const { x, y } = data;
                const result = await gameService.placeHiddenStone(gameId, userId, x, y);
                
                // 히든 돌 배치 브로드캐스트
                this.io.to(`game-${gameId}`).emit('hidden_stone_placed', {
                    x,
                    y,
                    hiddenStones: result.hiddenStones,
                    hiddenStonesUsed: result.hiddenStonesUsed,
                    hiddenItemActive: result.hiddenItemActive,
                    scanItemActive: result.scanItemActive,
                    scanItemDeadline: result.scanItemDeadline
                });
                
                // 스캔 아이템이 활성화된 경우
                if (result.scanItemActive) {
                    this.io.to(`game-${gameId}`).emit('scan_item_activated', {
                        scanItemActive: result.scanItemActive,
                        scanItemDeadline: result.scanItemDeadline
                    });
                }
                
                // 게임 상태 업데이트
                await this.sendGameState(socket, gameId, userId);
            } catch (error) {
                console.error('Place hidden stone error:', error);
                socket.emit('hidden_stone_error', { error: error.message });
            }
        });

        // 스캔 아이템 사용
        socket.on('scan_hidden_stones', async (data) => {
            try {
                const { x, y } = data;
                const result = await gameService.scanHiddenStones(gameId, userId, x, y);
                
                // 스캔 결과 브로드캐스트 (각 유저별로 다른 결과 전송)
                socket.emit('scan_result', {
                    found: result.found,
                    x,
                    y,
                    scanUsed: result.scanUsed,
                    scannedStones: result.scannedStones,
                    scanItemActive: result.scanItemActive
                });
                
                // 게임 상태 업데이트 (스캔 결과는 각 유저별로 다르므로 개별 전송)
                await this.sendGameState(socket, gameId, userId);
            } catch (error) {
                console.error('Scan hidden stones error:', error);
                socket.emit('scan_error', { error: error.message });
            }
        });

        // 히든 아이템 타임아웃 체크 (클라이언트에서 주기적으로 호출)
        socket.on('check_hidden_item_timeout', async () => {
            try {
                const updated = await gameService.checkHiddenItemTimeout(gameId);
                if (updated) {
                    // 타임아웃 발생 시 게임 상태 업데이트
                    await this.sendGameState(socket, gameId, userId);
                    this.io.to(`game-${gameId}`).emit('hidden_item_timeout', {
                        message: 'Hidden item usage time has expired'
                    });
                }
            } catch (error) {
                console.error('Check hidden item timeout error:', error);
            }
        });

        // 미사일 아이템 사용 시작
        socket.on('start_missile_item', async () => {
            try {
                const result = await gameService.startMissileItem(gameId, userId);
                
                // 미사일 아이템 시작 브로드캐스트
                this.io.to(`game-${gameId}`).emit('missile_item_started', {
                    missileItemActive: result.missileItemActive
                });
                
                // 게임 상태 업데이트
                await this.sendGameState(socket, gameId, userId);
            } catch (error) {
                console.error('Start missile item error:', error);
                socket.emit('missile_item_error', { error: error.message });
            }
        });

        // 미사일 이동
        socket.on('move_missile', async (data) => {
            try {
                const { fromX, fromY, direction } = data;
                const result = await gameService.moveMissile(gameId, userId, fromX, fromY, direction);
                
                // 미사일 이동 브로드캐스트
                this.io.to(`game-${gameId}`).emit('missile_moved', {
                    fromX: result.fromX,
                    fromY: result.fromY,
                    toX: result.toX,
                    toY: result.toY,
                    direction: result.direction,
                    path: result.path,
                    capturedStones: result.capturedStones,
                    missileMovesUsed: result.missileMovesUsed,
                    missileItemActive: result.missileItemActive
                });
                
                // 게임 상태 업데이트
                await this.sendGameState(socket, gameId, userId);
            } catch (error) {
                console.error('Move missile error:', error);
                socket.emit('missile_move_error', { error: error.message });
            }
        });

        // 미사일 애니메이션 완료
        socket.on('missile_animation_complete', async () => {
            try {
                await gameService.completeMissileAnimation(gameId);
                
                // 애니메이션 완료 브로드캐스트
                this.io.to(`game-${gameId}`).emit('missile_animation_completed', {
                    message: 'Missile animation completed'
                });
                
                // 게임 상태 업데이트
                await this.sendGameState(socket, gameId, userId);
            } catch (error) {
                console.error('Complete missile animation error:', error);
            }
        });
    }
}

module.exports = GameSocket;
