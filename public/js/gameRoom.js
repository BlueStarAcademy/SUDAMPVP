// Get configuration from window.gameRoomConfig
(function() {
    'use strict';
    
    const config = window.gameRoomConfig || {};
    
    // gameId를 여러 소스에서 가져오기 시도
    let gameId = config.gameId || (config.game && config.game.id) || '';
    
    // gameId가 여전히 없으면 URL에서 추출 시도
    if (!gameId || gameId === '' || gameId === 'undefined' || gameId === 'null') {
        const urlMatch = window.location.pathname.match(/\/api\/game\/([^\/]+)/);
        if (urlMatch && urlMatch[1]) {
            gameId = urlMatch[1];
            console.log('[Client] Extracted gameId from URL:', gameId);
        }
    }
    
    // currentUser가 제대로 전달되지 않았을 경우 처리
    let currentUser = config.currentUser || window.currentUser || {};
    if (!currentUser || !currentUser.id) {
        // config에서 직접 가져오기 시도
        if (config.currentUser) {
            currentUser = config.currentUser;
        } else if (window.currentUser) {
            currentUser = window.currentUser;
        } else {
            console.warn('[Client] currentUser not found in config, using empty object');
            console.warn('[Client] config:', config);
            console.warn('[Client] window.currentUser:', window.currentUser);
            currentUser = { id: '', nickname: '' };
        }
    }
    
    const isAiGame = config.isAiGame || false;
    const blackPlayerId = config.blackPlayerId || '';
    const whitePlayerId = config.whitePlayerId || '';
    const currentUserId = currentUser.id || '';
    const initialGameMode = config.initialGameMode || 'strategic';
    const initialBoardSize = config.initialBoardSize || 19;
    
    // gameId 유효성 검사
    if (!gameId || gameId === '' || gameId === 'undefined' || gameId === 'null') {
        console.error('[Client] gameId is missing or invalid from config:', config);
        console.error('[Client] Current URL:', window.location.pathname);
        showAlertModal('게임 ID가 없습니다. 대기실로 돌아갑니다.', '오류', 'error');
        window.location.href = '/waiting-room';
        return;
    }
    
    // Socket.IO 연결 (네트워크 IP 자동 감지)
    const socket = io({
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5
    });
    
    // Socket 연결 후 join_game 이벤트 전송
    socket.on('connect', () => {
        console.log('[Client] Socket connected, joining game:', gameId, 'socket.id:', socket.id);
        if (gameId) {
            socket.emit('join_game', gameId);
            // 디버깅: join_game 이벤트 전송 확인
            console.log('[Client] join_game event emitted, waiting for server confirmation...');
            
            // 전체 채팅을 받기 위해 대기실 룸에도 조인 (strategy와 casual 모두)
            socket.emit('join_waiting_room', 'strategy');
            socket.emit('join_waiting_room', 'casual');
            console.log('[Client] Joined waiting rooms for global chat');
        } else {
            console.error('[Client] Cannot join game: gameId is null or undefined');
            socket.emit('game_error', { error: 'Invalid game ID' });
        }
    });
    
    // Socket 연결 에러 처리
    socket.on('connect_error', (error) => {
        console.error('[Client] Socket connection error:', error);
        if (error.message === 'Authentication required') {
            // 인증 오류인 경우 페이지 새로고침 (세션 복구 시도)
            console.warn('[Client] Authentication error, refreshing page...');
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
    });
    
    // Socket 연결 거부 처리
    socket.on('disconnect', (reason) => {
        console.log('[Client] Socket disconnected:', reason);
        if (reason === 'io server disconnect') {
            // 서버가 연결을 끊은 경우 (인증 오류 등) 페이지 새로고침
            console.warn('[Client] Server disconnected, refreshing page...');
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
    });
    
    // 프로필 모달에서 사용할 전역 변수 설정
    window.currentUser = currentUser;
    
    // 디버깅: 사용자 정보 로그
    console.log('[Client] Game room initialized:', {
        currentUserId: currentUser.id,
        currentUserNickname: currentUser.nickname,
        gameId: gameId,
        blackPlayerId: blackPlayerId,
        whitePlayerId: whitePlayerId,
        isBlackPlayer: currentUser.id === blackPlayerId,
        isWhitePlayer: currentUser.id === whitePlayerId
    });
    let gameEnded = false;
    let isPaused = false;
    
    // 게임 시작 시 설정된 총 시간 (막대 그래프의 최대값으로 고정)
    // game_state 핸들러에서 사용되므로 먼저 선언
    let initialTotalTime = null;
    
    // 페이지 로드 시 플레이어 정보와 게임 정보를 빈 값으로 초기화
    // DOMContentLoaded 이벤트가 발생한 후 실행
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            clearPlayerPanelContent();
            // 게임 정보 패널도 빈 값으로 초기화
            const gameModeElement = document.getElementById('gameMode');
            const boardSizeElement = document.getElementById('boardSize');
            const timeLimitElement = document.getElementById('timeLimit');
            const byoyomiElement = document.getElementById('byoyomi');
            const komiElement = document.getElementById('komi');
            const gameStatusElement = document.getElementById('gameStatus');
            
            if (gameModeElement) gameModeElement.textContent = '';
            if (boardSizeElement) boardSizeElement.textContent = '';
            if (timeLimitElement) timeLimitElement.textContent = '';
            if (byoyomiElement) byoyomiElement.textContent = '';
            if (komiElement) komiElement.textContent = '';
            if (gameStatusElement) gameStatusElement.textContent = '대기 중';
        });
    } else {
        // DOM이 이미 로드된 경우 즉시 실행
        clearPlayerPanelContent();
        // 게임 정보 패널도 빈 값으로 초기화
        const gameModeElement = document.getElementById('gameMode');
        const boardSizeElement = document.getElementById('boardSize');
        const timeLimitElement = document.getElementById('timeLimit');
        const byoyomiElement = document.getElementById('byoyomi');
        const komiElement = document.getElementById('komi');
        const gameStatusElement = document.getElementById('gameStatus');
        
        if (gameModeElement) gameModeElement.textContent = '';
        if (boardSizeElement) boardSizeElement.textContent = '';
        if (timeLimitElement) timeLimitElement.textContent = '';
        if (byoyomiElement) byoyomiElement.textContent = '';
        if (komiElement) komiElement.textContent = '';
        if (gameStatusElement) gameStatusElement.textContent = '대기 중';
    }
    
    // 초기 게임 모드에 따른 배경 이미지 설정
    function updateBackgroundImage(mode) {
        const body = document.body;
        if (mode === 'playful' || mode === 'casual') {
            body.classList.remove('game-mode-strategic');
            body.classList.add('game-mode-playful');
        } else {
            body.classList.remove('game-mode-playful');
            body.classList.add('game-mode-strategic');
        }
    }

    // 페이지 로드 시 즉시 배경 이미지 적용
    updateBackgroundImage(initialGameMode);

    // 모바일 착수 버튼 기능 변수
    const isMobileDevice = window.innerWidth <= 768;
    let pendingMove = null; // 선택된 위치 저장
    
    // game_state 이벤트 핸들러를 먼저 등록 (서버가 즉시 이벤트를 보낼 수 있으므로)
    let gameStateReceived = false; // game_state 이벤트를 받았는지 추적
    let gameStateRequestTimeout = null;
    let gameStateRequestAttempts = 0;
    let gameStateRequested = false; // 무한루프 방지를 위한 플래그
    const MAX_REQUEST_ATTEMPTS = 1; // 최대 1번만 요청
    let pendingGameState = null; // window.game이 준비되기 전에 온 게임 상태 저장
    let isProcessingGameState = false;
    let moveErrorJustOccurred = false; // move_error 후 game_state가 isMyTurn을 덮어쓰지 않도록 플래그
    
    // game_state 핸들러를 먼저 등록 (window.game 초기화 전에)
    socket.on('game_state', (data) => {
        // game_state를 받았음을 표시 (무한 루프 방지)
        gameStateReceived = true;
        
        // 게임 상태 저장 (CAPTURE 모드 목표 개수 표시용)
        
        // 로그 제거 (너무 많은 콘솔 메시지 방지)
        
        // 대기 중인 요청 취소
        
        isProcessingGameState = true;
        
        setTimeout(() => {
            isProcessingGameState = false;
        }, 100);
        
        // 5초 후 타임아웃
        setTimeout(() => {
            isProcessingGameState = false;
        }, 5000);
        
        // 게임 상태 저장 (재대국 신청용)
        if (data.game) {
            window.gameState = window.gameState || {};
            window.gameState.game = data.game;
        }
        
        // 게임 상태 저장 (설정값 포함)
        // game.startedAt을 단일 소스로 사용하여 gameReady 동기화
        const isGameReady = data.game && data.game.startedAt !== null;
        
        window.gameState = {
            ...window.gameState,
            boardSize: data.boardSize !== undefined && data.boardSize !== null ? parseInt(data.boardSize) : (window.gameState?.boardSize || 19),
            timeLimit: data.timeLimit !== undefined && data.timeLimit !== null ? data.timeLimit : (window.gameState?.timeLimit || 30),
            byoyomiSeconds: data.byoyomiSeconds !== undefined && data.byoyomiSeconds !== null ? data.byoyomiSeconds : (window.gameState?.byoyomiSeconds || 30),
            byoyomiPeriods: data.byoyomiPeriods !== undefined && data.byoyomiPeriods !== null ? data.byoyomiPeriods : (window.gameState?.byoyomiPeriods || 5),
            captureTarget: data.captureTarget !== undefined && data.captureTarget !== null ? data.captureTarget : window.gameState?.captureTarget,
            finalCaptureTarget: data.finalCaptureTarget !== undefined && data.finalCaptureTarget !== null ? data.finalCaptureTarget : window.gameState?.finalCaptureTarget,
            blackCaptureTarget: data.blackCaptureTarget !== undefined && data.blackCaptureTarget !== null ? data.blackCaptureTarget : window.gameState?.blackCaptureTarget,
            whiteCaptureTarget: data.whiteCaptureTarget !== undefined && data.whiteCaptureTarget !== null ? data.whiteCaptureTarget : window.gameState?.whiteCaptureTarget,
            baseStones: data.baseStones !== undefined && data.baseStones !== null ? data.baseStones : window.gameState?.baseStones,
            baseStoneCount: data.baseStoneCount !== undefined && data.baseStoneCount !== null ? parseInt(data.baseStoneCount) : (window.gameState?.baseStoneCount || 4),
            finalKomi: data.finalKomi !== undefined && data.finalKomi !== null ? data.finalKomi : window.gameState?.finalKomi,
            maxMoves: data.maxMoves !== undefined && data.maxMoves !== null ? parseInt(data.maxMoves) : (window.gameState?.maxMoves || null),
            autoScoringMove: data.autoScoringMove !== undefined && data.autoScoringMove !== null ? parseInt(data.autoScoringMove) : window.gameState?.autoScoringMove,
            gameReady: isGameReady // game.startedAt을 단일 소스로 사용
        };
        
        // window.gameState.game 객체 업데이트
        if (data.game) {
            window.gameState.game = {
                ...window.gameState.game,
                ...data.game
            };
        }
        
        // 플레이어 패널 내용 업데이트 (게임 시작 전: 빈 값, 게임 시작 후: 플레이어 정보 표시)
        if (data.game) {
            const isBaseMode = data.game.mode === 'BASE';
            const hasBlackId = data.game.blackId && data.game.blackId !== '';
            const hasWhiteId = data.game.whiteId && data.game.whiteId !== '';
            const hasFinalKomi = data.finalKomi !== undefined && data.finalKomi !== null;
            const isColorSelectionPhase = data.colorSelectionPhase === true;
            const isKomiBiddingPhase = data.komiBiddingPhase === true;
            
            // 베이스바둑 모드인 경우: 흑/백이 정해지고 덤이 정해진 후에만 내용 표시
            if (isBaseMode) {
                if (hasBlackId && hasWhiteId && hasFinalKomi && !isColorSelectionPhase && !isKomiBiddingPhase && isGameReady) {
                    // 모든 설정이 완료되고 게임이 시작되었으면 플레이어 정보 복원
                    if (data.blackPlayer || data.whitePlayer) {
                        restorePlayerPanelContent(data);
                    }
                    console.log('[Client] Player panel content restored - all settings complete and game started');
                } else {
                    // 설정이 완료되지 않았거나 게임이 시작되지 않았으면 플레이어 정보 비우기
                    clearPlayerPanelContent();
                    console.log('[Client] Player panel content cleared - settings not complete or game not started:', {
                        hasBlackId,
                        hasWhiteId,
                        hasFinalKomi,
                        isColorSelectionPhase,
                        isKomiBiddingPhase,
                        isGameReady
                    });
                }
            } else {
                // 베이스바둑이 아닌 모드 (CLASSIC 등): 게임 시작 전에는 빈 값, 게임 시작 후에는 플레이어 정보 표시
                if (isGameReady) {
                    // 게임이 시작되었으면 플레이어 정보 표시 (AI 게임인 경우에도 표시)
                    if (data.blackPlayer || data.whitePlayer || (data.game && data.game.isAiGame)) {
                        restorePlayerPanelContent(data);
                        console.log('[Client] Player panel content restored - game started');
                    }
                } else {
                    // 게임이 시작되지 않았으면 플레이어 정보 비우기
                    clearPlayerPanelContent();
                    console.log('[Client] Player panel content cleared - game not started');
                }
            }
        }
        
        // 디버깅: 설정값 확인
        console.log('[Client] game_state received - Settings:', {
            boardSize: window.gameState.boardSize,
            timeLimit: window.gameState.timeLimit,
            byoyomiSeconds: window.gameState.byoyomiSeconds,
            byoyomiPeriods: window.gameState.byoyomiPeriods,
            baseStoneCount: window.gameState.baseStoneCount,
            hasBaseStones: !!window.gameState.baseStones,
            autoScoringMove: window.gameState.autoScoringMove
        });
        
        // window.game이 있으면 즉시 로드
        if (window.game) {
            window.game.loadState(data);
            
            // currentColor와 isMyTurn 업데이트 (loadState에서 이미 처리되지만 확실히 하기 위해)
            if (data.currentColor !== undefined) {
                window.game.currentColor = data.currentColor;
            }
            if (data.isMyTurn !== undefined) {
                window.game.isMyTurn = data.isMyTurn;
                console.log('[Client] isMyTurn updated from game_state:', {
                    isMyTurn: data.isMyTurn,
                    currentColor: data.currentColor,
                    gameMode: data.game?.mode,
                    isAiGame: data.game?.isAiGame,
                    aiColor: data.game?.aiColor,
                    blackId: data.game?.blackId,
                    whiteId: data.game?.whiteId,
                    currentUserId: currentUser.id
                });
            }
            
            // boardSize가 변경된 경우 stones 배열 재초기화
            if (data.boardSize && data.boardSize !== window.game.boardSize) {
                window.game.boardSize = parseInt(data.boardSize);
                window.game.stones = Array(window.game.boardSize).fill(null).map(() => Array(window.game.boardSize).fill(null));
            }
            
            // 바둑판 다시 그리기 (지연 후)
            setTimeout(() => {
                if (window.game && window.game.canvas) {
                    window.game.updateCellSize();
                    if (window.game.cellSize > 0) {
                        window.game.drawBoard();
                    } else {
                        // cellSize가 0이면 재시도
                        setTimeout(() => {
                            if (window.game) {
                                window.game.updateCellSize();
                                window.game.drawBoard();
                            }
                        }, 200);
                    }
                }
            }, 100);
        } else {
            // window.game이 아직 없으면 저장
            pendingGameState = data;
        }
        
        // 게임 정보 패널 업데이트 (게임 시작 전: 빈 값, 게임 시작 후: 게임 정보 표시)
        if (!isGameReady) {
            // 게임 시작 전: 모든 게임 정보를 빈 값으로 표시
            const gameModeElement = document.getElementById('gameMode');
            const boardSizeElement = document.querySelector('#boardSize') || document.querySelector('.game-info-grid .game-info-value:nth-child(2)');
            const timeLimitElement = document.getElementById('timeLimit');
            const byoyomiElement = document.getElementById('byoyomi');
            const komiElement = document.getElementById('komi');
            const gameStatusElement = document.getElementById('gameStatus');
            
            if (gameModeElement) gameModeElement.textContent = '';
            if (boardSizeElement) boardSizeElement.textContent = '';
            if (timeLimitElement) timeLimitElement.textContent = '';
            if (byoyomiElement) byoyomiElement.textContent = '';
            if (komiElement) komiElement.textContent = '';
            if (gameStatusElement) gameStatusElement.textContent = '대기 중';
            
            console.log('[Client] Game info panel cleared - game not started');
        } else {
            // 게임 시작 후: 모든 게임 정보 표시
            if (data.game && data.game.mode) {
                const gameMode = data.game.mode;
                const modeNames = {
                    'CLASSIC': '일반',
                    'CAPTURE': '따내기바둑',
                    'SPEED': '스피드바둑',
                    'BASE': '베이스바둑',
                    'HIDDEN': '히든바둑',
                    'MISSILE': '미사일바둑',
                    'MIX': '믹스바둑'
                };
                const gameModeElement = document.getElementById('gameMode');
                if (gameModeElement) {
                    gameModeElement.textContent = modeNames[gameMode] || gameMode || '일반';
                }
            }
            
            // 판 크기 표시
            const boardSize = data.boardSize || window.gameState?.boardSize || 19;
            const boardSizeElement = document.getElementById('boardSize');
            if (boardSizeElement) {
                boardSizeElement.textContent = `${boardSize}×${boardSize}`;
            }
            
            // 제한시간 표시
            const timeLimitValue = data.timeLimit || window.gameState?.timeLimit || 30;
            const timeLimitElement = document.getElementById('timeLimit');
            if (timeLimitElement) {
                timeLimitElement.textContent = `${timeLimitValue}분`;
            }
            
            // 초읽기 표시 (스피드바둑이 아닐 때만)
            if (data.game && data.game.mode !== 'SPEED') {
                const byoyomiSecondsValue = data.byoyomiSeconds || window.gameState?.byoyomiSeconds || 30;
                const byoyomiPeriodsValue = data.byoyomiPeriods || window.gameState?.byoyomiPeriods || 5;
                const byoyomiElement = document.getElementById('byoyomi');
                if (byoyomiElement) {
                    byoyomiElement.textContent = `${byoyomiSecondsValue}초 × ${byoyomiPeriodsValue}회`;
                }
            } else {
                const byoyomiElement = document.getElementById('byoyomi');
                if (byoyomiElement) {
                    byoyomiElement.textContent = '-';
                }
            }
            
            // 덤 표시 (CAPTURE 모드가 아닐 때만)
            if (data.game && data.game.mode !== 'CAPTURE') {
                const komiValue = data.komi || data.game?.komi || window.gameState?.komi || 6.5;
                const komiElement = document.getElementById('komi');
                if (komiElement) {
                    komiElement.textContent = `${komiValue}집`;
                }
            } else {
                const komiElement = document.getElementById('komi');
                if (komiElement) {
                    komiElement.textContent = '-';
                }
            }
            
            // 게임 상태 표시
            const gameStatusElement = document.getElementById('gameStatus');
            if (gameStatusElement) {
                gameStatusElement.textContent = '진행 중';
            }
            
            console.log('[Client] Game info panel updated - game started');
        }
        
        // 타이머 업데이트 (gameReady === true일 때만)
        // isGameReady는 위에서 이미 선언됨 (game.startedAt을 단일 소스로 사용)
        // timeLimit은 data에서 우선 가져오고, 없으면 window.gameState, 없으면 기본값 30분
        // null이나 undefined 체크를 명확히 함
        const timeLimit = (data.timeLimit !== undefined && data.timeLimit !== null) 
            ? parseInt(data.timeLimit)
            : ((window.gameState?.timeLimit !== undefined && window.gameState?.timeLimit !== null) 
                ? parseInt(window.gameState.timeLimit)
                : 30);
        const totalTime = timeLimit * 60;
        const byoyomiSeconds = (data.byoyomiSeconds !== undefined && data.byoyomiSeconds !== null)
            ? parseInt(data.byoyomiSeconds)
            : ((window.gameState?.byoyomiSeconds !== undefined && window.gameState?.byoyomiSeconds !== null)
                ? parseInt(window.gameState.byoyomiSeconds)
                : (data.timers?.byoyomiSeconds || 30));
        const byoyomiPeriods = (data.byoyomiPeriods !== undefined && data.byoyomiPeriods !== null)
            ? parseInt(data.byoyomiPeriods)
            : ((window.gameState?.byoyomiPeriods !== undefined && window.gameState?.byoyomiPeriods !== null)
                ? parseInt(window.gameState.byoyomiPeriods)
                : 5);
        
        // 디버깅: 설정값 확인
        console.log('[Client] Timer settings from game_state:', {
            timeLimit: timeLimit,
            byoyomiSeconds: byoyomiSeconds,
            byoyomiPeriods: byoyomiPeriods,
            dataTimeLimit: data.timeLimit,
            dataByoyomiSeconds: data.byoyomiSeconds,
            dataByoyomiPeriods: data.byoyomiPeriods,
            gameStateTimeLimit: window.gameState?.timeLimit,
            gameStateByoyomiSeconds: window.gameState?.byoyomiSeconds,
            gameStateByoyomiPeriods: window.gameState?.byoyomiPeriods
        });
        
        // initialTotalTime 설정 (한 번만, gameReady일 때)
        // window에 설정하여 timer.js에서도 접근 가능하도록 함
        if (isGameReady && (initialTotalTime === null || initialTotalTime === undefined)) {
            initialTotalTime = totalTime;
            window.initialTotalTime = totalTime; // timer.js에서 사용할 수 있도록 window에 저장
            console.log('[Client] initialTotalTime set:', {
                initialTotalTime: initialTotalTime,
                totalTime: totalTime,
                timeLimit: timeLimit
            });
        }
        
        // 타이머 초기화 및 업데이트
        if (window.timer) {
            // gameReady 상태를 GameTimer에 반영
            window.timer.gameReady = isGameReady;
            
            // 설정값 업데이트 (game_state에서 받은 값 우선 사용)
            if (data.byoyomiSeconds !== undefined && data.byoyomiSeconds !== null) {
                window.timer.byoyomiSeconds = data.byoyomiSeconds;
                window.timer.blackByoyomiTime = data.byoyomiSeconds;
                window.timer.whiteByoyomiTime = data.byoyomiSeconds;
            } else if (byoyomiSeconds !== undefined) {
                window.timer.byoyomiSeconds = byoyomiSeconds;
                window.timer.blackByoyomiTime = byoyomiSeconds;
                window.timer.whiteByoyomiTime = byoyomiSeconds;
            }
            
            if (data.byoyomiPeriods !== undefined && data.byoyomiPeriods !== null) {
                window.timer.blackByoyomiPeriods = data.byoyomiPeriods;
                window.timer.whiteByoyomiPeriods = data.byoyomiPeriods;
            } else if (byoyomiPeriods !== undefined) {
                window.timer.blackByoyomiPeriods = byoyomiPeriods;
                window.timer.whiteByoyomiPeriods = byoyomiPeriods;
            }
            
            // gameReady === true일 때만 타이머 업데이트 허용
            if (isGameReady && data.timers) {
                // 타이머 업데이트: updateTimers 메서드를 사용하여 currentTurn도 함께 업데이트
                window.timer.updateTimers(data.timers);
                
                const blackTime = data.timers.blackTime !== undefined ? data.timers.blackTime : totalTime;
                const whiteTime = data.timers.whiteTime !== undefined ? data.timers.whiteTime : totalTime;
                
                // 제한시간이 0분이거나 모두 소진된 경우 초읽기 모드로 처리
                const isTimeLimitZero = totalTime === 0;
                const blackInByoyomi = data.timers.blackInByoyomi || isTimeLimitZero || (blackTime <= 0 && totalTime > 0);
                const whiteInByoyomi = data.timers.whiteInByoyomi || isTimeLimitZero || (whiteTime <= 0 && totalTime > 0);
                
                // 타이머 표시 업데이트
                if (typeof updateTimerBar === 'function') {
                    updateTimerBar('black', blackTime, totalTime, data.timers.blackByoyomiTime, blackInByoyomi, byoyomiSeconds);
                    updateTimerBar('white', whiteTime, totalTime, data.timers.whiteByoyomiTime, whiteInByoyomi, byoyomiSeconds);
                }
                
                // 초읽기 정보 업데이트
                if (typeof updateByoyomiDisplay === 'function') {
                    updateByoyomiDisplay('black', data.timers.blackByoyomiPeriods || byoyomiPeriods, data.timers.blackInByoyomi || false, data.timers.blackByoyomiTime);
                    updateByoyomiDisplay('white', data.timers.whiteByoyomiPeriods || byoyomiPeriods, data.timers.whiteInByoyomi || false, data.timers.whiteByoyomiTime);
                }
                
                console.log('[Client] game_state: Timer updated with currentTurn:', {
                    currentTurn: data.timers.currentTurn,
                    blackTime: blackTime,
                    whiteTime: whiteTime,
                    timerCurrentTurn: window.timer.currentTurn
                });
            } else if (isGameReady) {
                // timers가 없지만 gameReady인 경우 초기값 설정
                // window.gameState에서 설정값 가져오기
                const gameStateTimeLimit = window.gameState?.timeLimit || timeLimit;
                const gameStateTotalTime = gameStateTimeLimit * 60;
                window.timer.serverBlackTime = gameStateTotalTime;
                window.timer.blackTime = gameStateTotalTime;
                window.timer.serverWhiteTime = gameStateTotalTime;
                window.timer.whiteTime = gameStateTotalTime;
                window.timer.lastServerUpdate = Date.now();
                
                // 타이머 표시 업데이트
                if (typeof updateTimerBar === 'function') {
                    updateTimerBar('black', gameStateTotalTime, gameStateTotalTime, 0, false, byoyomiSeconds);
                    updateTimerBar('white', gameStateTotalTime, gameStateTotalTime, 0, false, byoyomiSeconds);
                }
            }
            
            // gameReady가 false일 때: 타이머를 빈 값으로 표시하고 타이머 바 숨김
            if (!isGameReady) {
                // 타이머 텍스트 빈 값으로 표시
                const blackTimerEl = document.getElementById('blackTimer');
                const whiteTimerEl = document.getElementById('whiteTimer');
                if (blackTimerEl) blackTimerEl.textContent = '';
                if (whiteTimerEl) whiteTimerEl.textContent = '';
                
                // 타이머 바 숨김
                const blackBar = document.getElementById('blackTimerBar');
                const whiteBar = document.getElementById('whiteTimerBar');
                if (blackBar) blackBar.style.display = 'none';
                if (whiteBar) whiteBar.style.display = 'none';
                
                // 초읽기 표시 숨김
                const blackByoyomiDisplay = document.getElementById('blackByoyomiDisplay');
                const whiteByoyomiDisplay = document.getElementById('whiteByoyomiDisplay');
                if (blackByoyomiDisplay) blackByoyomiDisplay.style.display = 'none';
                if (whiteByoyomiDisplay) whiteByoyomiDisplay.style.display = 'none';
                
                // 설정값은 window.gameState에 저장만 (표시하지 않음)
                const gameStateTimeLimit = window.gameState?.timeLimit || timeLimit;
                const gameStateTotalTime = gameStateTimeLimit * 60;
                const gameStateByoyomiSeconds = window.gameState?.byoyomiSeconds || byoyomiSeconds;
                const gameStateByoyomiPeriods = window.gameState?.byoyomiPeriods || byoyomiPeriods;
                
                // 타이머 표시 업데이트 (게임 시작 전에도 설정값 표시)
                if (typeof updateTimerBar === 'function') {
                    updateTimerBar('black', gameStateTotalTime, gameStateTotalTime, 0, false, gameStateByoyomiSeconds);
                    updateTimerBar('white', gameStateTotalTime, gameStateTotalTime, 0, false, gameStateByoyomiSeconds);
                }
                
                // 초읽기 정보 업데이트
                if (typeof updateByoyomiDisplay === 'function') {
                    updateByoyomiDisplay('black', gameStateByoyomiPeriods, false, gameStateByoyomiSeconds);
                    updateByoyomiDisplay('white', gameStateByoyomiPeriods, false, gameStateByoyomiSeconds);
                }
            }
        }
        
        // 현재 차례 계산 (서버에서 보낸 isMyTurn을 우선 사용, 없으면 계산)
        let currentColor = data.currentColor || data.timers?.currentTurn || 'black';
        let isMyTurn = false;
        
        // 서버에서 보낸 isMyTurn이 있으면 그것을 사용 (AI 게임 등에서 정확함)
        if (data.isMyTurn !== undefined) {
            isMyTurn = data.isMyTurn;
        } else if (data.game) {
            // 서버에서 보내지 않은 경우에만 계산
            isMyTurn = (currentColor === 'black' && data.game.blackId === currentUser.id) ||
                       (currentColor === 'white' && data.game.whiteId === currentUser.id);
        }
        
        // window.game에 isMyTurn 설정
        // move_error가 방금 발생한 경우 isMyTurn을 덮어쓰지 않음
        if (window.game) {
            window.game.currentColor = currentColor;
            
            // move_error가 방금 발생한 경우 isMyTurn을 true로 유지
            if (typeof moveErrorJustOccurred !== 'undefined' && moveErrorJustOccurred) {
                window.game.isMyTurn = true;
                moveErrorJustOccurred = false; // 플래그 해제
                console.log('[Client] isMyTurn preserved after move_error - isMyTurn:', window.game.isMyTurn);
            } else {
                window.game.isMyTurn = isMyTurn;
                console.log('[Client] isMyTurn calculated/updated:', {
                    isMyTurn,
                    fromServer: data.isMyTurn !== undefined,
                    currentColor,
                    gameMode: data.game?.mode,
                    isAiGame: data.game?.isAiGame,
                    aiColor: data.game?.aiColor,
                    blackId: data.game?.blackId,
                    whiteId: data.game?.whiteId,
                    currentUserId: currentUser.id
                });
            }
        }
        
        // 전광판 업데이트
        if (typeof updateGameNotice === 'function') {
            let noticeText = '';
            if (data.game && data.game.mode === 'MIX' && data.currentMixMode) {
                // 믹스바둑: 현재 모드 표시
                const mixModeNames = {
                    'CLASSIC': '일반',
                    'CAPTURE': '따내기바둑',
                    'SPEED': '스피드바둑',
                    'BASE': '베이스바둑',
                    'HIDDEN': '히든바둑',
                    'MISSILE': '미사일바둑'
                };
                const modeName = mixModeNames[data.currentMixMode] || data.currentMixMode;
                noticeText = `현재 모드: ${modeName}`;
            } else {
                noticeText = '게임이 진행 중입니다.';
            }
            updateGameNotice(noticeText);
        }
        
        // 믹스바둑: 현재 모드 정보 저장
        if (data.currentMixMode) {
            window.gameState = window.gameState || {};
            window.gameState.currentMixMode = data.currentMixMode;
        }
        
        // 플레이어 활성화 표시는 별도로 처리
        
        // 턴 표시 업데이트
        if (typeof updateTurnIndicator === 'function') {
            const currentTurnColor = data.timers?.currentTurn || data.currentColor || 'black';
            const moveNumber = data.moveNumber || window.gameState?.moveNumber || window.game?.moveNumber || 0;
            console.log('[Client] game_state: Calling updateTurnIndicator with:', { moveNumber, currentTurnColor });
            updateTurnIndicator(moveNumber, currentTurnColor);
        } else {
            console.warn('[Client] game_state: updateTurnIndicator function not found');
        }
        
        // 포획 돌 수 업데이트
        if (data.capturedBlack !== undefined || data.capturedWhite !== undefined) {
            const gameData = {
                game: data.game || {},
                finalCaptureTarget: data.finalCaptureTarget || window.gameState?.finalCaptureTarget,
                blackCaptureTarget: data.blackCaptureTarget || window.gameState?.blackCaptureTarget,
                whiteCaptureTarget: data.whiteCaptureTarget || window.gameState?.whiteCaptureTarget
            };
            if (typeof updateCapturedCount === 'function') {
                if (data.capturedBlack !== undefined) {
                    updateCapturedCount('blackCaptured', data.capturedBlack, gameData);
                }
                if (data.capturedWhite !== undefined) {
                    updateCapturedCount('whiteCaptured', data.capturedWhite, gameData);
                }
            }
        }
        
        // CAPTURE 모드 목표 개수 업데이트
        if (data.game && data.game.mode === 'CAPTURE') {
            const captureTargetEl = document.getElementById('captureTarget');
            if (captureTargetEl) {
                const target = data.finalCaptureTarget || data.captureTarget || window.gameState?.finalCaptureTarget || window.gameState?.captureTarget;
                if (target !== undefined && target !== null) {
                    captureTargetEl.textContent = `목표: ${target}개`;
                }
            }
        }
        
        // 게임 모드에 따른 특수 버튼 업데이트
        if (typeof updateSpecialButtons === 'function') {
            const gameMode = data.game?.mode || 'CLASSIC';
            updateSpecialButtons(gameMode, window.gameState);
        }
        
        // 버튼 카운트 업데이트
        if (typeof updateButtonCounts === 'function') {
            updateButtonCounts(window.gameState);
        }
        
        if (typeof updateLeaveButton === 'function') {
            updateLeaveButton();
        }
        
        // 매너 액션 초기화
        if (typeof initializeMannerActions === 'function') {
            initializeMannerActions();
        }
        
        // 베이스바둑 베이스돌 표시 (항상 표시)
        if (data.baseStones && window.game) {
            window.game.baseStones = data.baseStones;
            setTimeout(() => {
                if (window.game.baseImageCache) {
                    // 즉시 그리기
                    window.game.drawBoard();
                    // 이미지 로드 후 다시 그리기 (이미지가 아직 로드되지 않은 경우 대비)
                    setTimeout(() => {
                        window.game.drawBoard();
                    }, 100);
                } else {
                    window.game.baseStones = null;
                    window.game.drawBoard();
                    // 이미지 로드 후 다시 그리기
                    setTimeout(() => {
                        window.game.drawBoard();
                    }, 100);
                }
            }, 500);
        }
        
        // 클래식 모드: 특별 모드 UI 숨김
        const isClassicMode = data.game && data.game.mode === 'CLASSIC';
        
        // 미사일바둑 상태 업데이트 (MISSILE 모드 또는 MIX 모드에서 MISSILE 활성화 시, 클래식 모드 제외)
        const isMissileMode = !isClassicMode && data.game && (
            data.game.mode === 'MISSILE' || 
            (data.game.mode === 'MIX' && data.currentMixMode === 'MISSILE')
        );
        if (isMissileMode && typeof updateMissileButton === 'function') {
            updateMissileButton();
        }
        
        // 히든바둑 상태 업데이트 (HIDDEN 모드 또는 MIX 모드에서 HIDDEN 활성화 시, 클래식 모드 제외)
        const isHiddenMode = !isClassicMode && data.game && (
            data.game.mode === 'HIDDEN' || 
            (data.game.mode === 'MIX' && data.currentMixMode === 'HIDDEN')
        );
        if (isHiddenMode) {
            if (typeof hideItemTimerUI === 'function') {
                hideItemTimerUI('hidden');
            }
            if (typeof updateHiddenButton === 'function') {
                updateHiddenButton();
            }
            
            // 스캔 아이템 상태
            if (data.scanMode === false) {
                if (typeof hideItemTimerUI === 'function') {
                    hideItemTimerUI('scan');
                }
            }
            if (typeof updateScanButton === 'function') {
                updateScanButton();
            }
            
            // 히든 돌 상태 로드는 별도로 처리
        }
        
        // 게임 준비 상태 확인 및 모달 표시
        // game.startedAt을 단일 소스로 사용하여 게임 준비 상태 확인
        const isGameReadyFromServer = data.game && data.game.startedAt !== null;
        const isGameNotReady = !isGameReadyFromServer;
        const isBaseMode = data.game && data.game.mode === 'BASE';
        const isBaseAiGame = isBaseMode && data.game.isAiGame;
        // 베이스바둑 AI 게임: 색상 선택이 필요한 경우
        // - colorSelectionPhase가 true이거나
        // - startedAt이 null이고 blackId 또는 whiteId가 설정되지 않은 경우
        const hasBlackId = data.game && data.game.blackId && data.game.blackId !== '';
        const hasWhiteId = data.game && data.game.whiteId && data.game.whiteId !== '';
        const needsColorSelection = isBaseAiGame && (
            data.colorSelectionPhase === true || 
            ((!data.game.startedAt || data.game.startedAt === null) && (!hasBlackId || !hasWhiteId))
        );
        
        // 디버깅: 베이스바둑 AI 게임 모달 표시 조건 확인
        if (isBaseAiGame) {
            console.log('[Client] BASE AI game modal check:', {
                isGameNotReady,
                isGameReadyFromServer,
                needsColorSelection,
                colorSelectionPhase: data.colorSelectionPhase,
                startedAt: data.game.startedAt,
                hasBlackId,
                hasWhiteId,
                gameReady: data.gameReady
            });
        }
        
        // 클래식 모드 확인 (모달 표시 조건 체크용)
        const isClassicModeForModal = data.game && data.game.mode === 'CLASSIC';
        const isAiGame = data.game && data.game.isAiGame;
        
        // 디버깅: 클래식 모드 게임 상태 확인
        if (isClassicModeForModal) {
            console.log('[Client] Classic mode game state check:', {
                isGameNotReady,
                isGameReadyFromServer,
                gameReady: data.gameReady,
                startedAt: data.game?.startedAt,
                isAiGame: isAiGame,
                hasGame: !!data.game
            });
        }
        
        if (isGameNotReady && data.game) {
            // 클래식 모드: 바로 게임 시작 모달 표시 (특별 모드 조건 건너뛰기)
            // AI 게임도 포함하여 모달 표시
            if (isClassicModeForModal) {
                const gameStartModal = document.getElementById('gameStartModal');
                const isModalVisible = gameStartModal && gameStartModal.classList.contains('show') && gameStartModal.style.display !== 'none';
                
                if (!isModalVisible && typeof showGameStartModal === 'function') {
                    console.log('[Client] Classic mode: Showing game start modal - gameReady:', data.gameReady, 'game:', data.game);
                    showGameStartModal({
                        game: data.game,
                        boardSize: (window.gameState?.boardSize !== undefined && window.gameState?.boardSize !== null) 
                            ? window.gameState.boardSize 
                            : (data.boardSize || 19),
                        timeLimit: (window.gameState?.timeLimit !== undefined && window.gameState?.timeLimit !== null)
                            ? window.gameState.timeLimit
                            : (data.timeLimit || 30),
                        timeIncrement: data.timeIncrement || 5,
                        byoyomiSeconds: (window.gameState?.byoyomiSeconds !== undefined && window.gameState?.byoyomiSeconds !== null)
                            ? window.gameState.byoyomiSeconds
                            : (data.byoyomiSeconds || 30),
                        byoyomiPeriods: (window.gameState?.byoyomiPeriods !== undefined && window.gameState?.byoyomiPeriods !== null)
                            ? window.gameState.byoyomiPeriods
                            : (data.byoyomiPeriods || 5),
                        komi: data.game?.komi,
                        captureTarget: data.captureTarget,
                        autoScoringMove: data.autoScoringMove,
                        baseStoneCount: (window.gameState?.baseStoneCount !== undefined && window.gameState?.baseStoneCount !== null)
                            ? window.gameState.baseStoneCount
                            : (data.baseStoneCount || 4)
                    });
                } else if (isModalVisible) {
                    console.log('[Client] Classic mode: Game start modal already visible, skipping');
                } else {
                    console.error('[Client] Classic mode: showGameStartModal function not found!');
                }
            }
            // 특별 모드: 각 모드별 모달 표시
            else {
                // 돌가리기가 필요한 경우 (SPEED 모드 전용)
                if (data.stonePicking && typeof showStonePickingModal === 'function') {
                    showStonePickingModal(data.stonePicking);
                }
                // 미니게임이 필요한 경우 (가위바위보 등)
                else if (data.minigame && typeof showMinigameModal === 'function') {
                    showMinigameModal(data.minigame);
                }
                // 베이스바둑: AI 게임인 경우 전용 모달 사용
                else if (needsColorSelection) {
                    // AI 게임: 색상 선택 모달 표시 (최우선)
                    // 모달이 이미 표시되어 있는지 확인
                    const colorModalVisible = baseColorSelectionModal && baseColorSelectionModal.style.display !== 'none' && baseColorSelectionModal.style.display !== '';
                    const komiModalVisible = baseKomiSelectionModal && baseKomiSelectionModal.style.display !== 'none' && baseKomiSelectionModal.style.display !== '';
                    
                    if (!colorModalVisible && !komiModalVisible) {
                        console.log('[Client] BASE AI mode: Showing base color selection modal', {
                            colorSelectionPhase: data.colorSelectionPhase,
                            startedAt: data.game.startedAt,
                            gameReady: data.gameReady,
                            needsColorSelection: needsColorSelection,
                            hasBlackId,
                            hasWhiteId
                        });
                        // 모달이 없으면 먼저 생성
                        if (!baseColorSelectionModal && typeof createBaseColorSelectionModal === 'function') {
                            createBaseColorSelectionModal();
                        }
                        if (typeof showBaseColorSelectionModal === 'function') {
                            showBaseColorSelectionModal();
                        } else {
                            console.error('[Client] showBaseColorSelectionModal function not found!');
                        }
                    }
                }
                // 베이스바둑: PVP 게임 색상 선택이 필요한 경우 (최우선)
                else if (data.game.mode === 'BASE' && data.colorSelectionPhase) {
                    console.log('[Client] BASE PVP mode: Showing color selection modal');
                    if (typeof showColorSelectionModal === 'function') {
                        showColorSelectionModal(data);
                    } else {
                        console.error('[Client] showColorSelectionModal function not found!');
                    }
                }
                // 베이스바둑: PVP 게임 덤 입찰이 필요한 경우 (색상 선택 후)
                else if (data.game.mode === 'BASE' && data.komiBiddingPhase) {
                    console.log('[Client] BASE PVP mode: Showing komi bidding modal');
                    if (typeof showKomiBiddingModal === 'function') {
                        showKomiBiddingModal(data);
                    } else {
                        console.error('[Client] showKomiBiddingModal function not found!');
                    }
                }
                // CAPTURE 모드 PVP 게임일 때 덤 설정 모달
                else if (data.game.mode === 'CAPTURE' && !data.game.isAiGame && data.biddingPhase && typeof showCaptureBidModal === 'function') {
                    showCaptureBidModal(data);
                }
                // 기타 모드: 일반 게임 시작 모달
                else if (data.game.mode !== 'BASE' || (!data.colorSelectionPhase && !data.komiBiddingPhase)) {
                    const gameStartModal = document.getElementById('gameStartModal');
                    const isModalVisible = gameStartModal && gameStartModal.classList.contains('show') && gameStartModal.style.display !== 'none';
                    
                    if (!isModalVisible && typeof showGameStartModal === 'function') {
                        console.log('[Client] Showing game start modal - gameReady:', data.gameReady, 'game:', data.game, 'mode:', data.game.mode);
                        showGameStartModal({
                            game: data.game,
                            boardSize: (window.gameState?.boardSize !== undefined && window.gameState?.boardSize !== null) 
                                ? window.gameState.boardSize 
                                : (data.boardSize || 19),
                            timeLimit: (window.gameState?.timeLimit !== undefined && window.gameState?.timeLimit !== null)
                                ? window.gameState.timeLimit
                                : (data.timeLimit || 30),
                            timeIncrement: data.timeIncrement || 5,
                            byoyomiSeconds: (window.gameState?.byoyomiSeconds !== undefined && window.gameState?.byoyomiSeconds !== null)
                                ? window.gameState.byoyomiSeconds
                                : (data.byoyomiSeconds || 30),
                            byoyomiPeriods: (window.gameState?.byoyomiPeriods !== undefined && window.gameState?.byoyomiPeriods !== null)
                                ? window.gameState.byoyomiPeriods
                                : (data.byoyomiPeriods || 5),
                            komi: data.game?.komi,
                            captureTarget: data.captureTarget,
                            autoScoringMove: data.autoScoringMove,
                            baseStoneCount: (window.gameState?.baseStoneCount !== undefined && window.gameState?.baseStoneCount !== null)
                                ? window.gameState.baseStoneCount
                                : (data.baseStoneCount || 4)
                        });
                    } else if (isModalVisible) {
                        console.log('[Client] Game start modal already visible, skipping');
                    } else {
                        console.error('[Client] showGameStartModal function not found!');
                    }
                }
            }
        } else if (isGameNotReady && !data.game) {
            console.warn('[Client] Game not ready but game data is missing');
        } else if (!isGameNotReady && isClassicModeForModal) {
            // 클래식 모드에서 게임이 이미 준비된 경우 로그 출력
            console.log('[Client] Classic mode game already ready - gameReady:', data.gameReady, 'startedAt:', data.game?.startedAt);
        }
        
        // 베이스바둑 AI 게임: 게임이 준비되지 않았거나 색상 선택이 필요한 경우 모달 표시 (isGameNotReady 체크 외에도)
        if (isBaseAiGame && needsColorSelection && data.game) {
            const colorModalVisible = baseColorSelectionModal && baseColorSelectionModal.style.display !== 'none' && baseColorSelectionModal.style.display !== '';
            const komiModalVisible = baseKomiSelectionModal && baseKomiSelectionModal.style.display !== 'none' && baseKomiSelectionModal.style.display !== '';
            
            if (!colorModalVisible && !komiModalVisible) {
                console.log('[Client] BASE AI mode: Showing base color selection modal (fallback check)', {
                    colorSelectionPhase: data.colorSelectionPhase,
                    startedAt: data.game.startedAt,
                    gameReady: data.gameReady,
                    needsColorSelection: needsColorSelection,
                    hasBlackId,
                    hasWhiteId
                });
                // 모달이 없으면 먼저 생성
                if (!baseColorSelectionModal && typeof createBaseColorSelectionModal === 'function') {
                    createBaseColorSelectionModal();
                }
                if (typeof showBaseColorSelectionModal === 'function') {
                    showBaseColorSelectionModal();
                } else {
                    console.error('[Client] showBaseColorSelectionModal function not found!');
                }
            }
        }
        
        if (data.gameReady) {
            // 게임이 준비되었으면 모든 모달 닫기
            console.log('[Client] Game ready, closing modals...', {
                gameReady: data.gameReady,
                startedAt: data.game?.startedAt,
                gameMode: data.game?.mode
            });
            
            // 모달을 확실히 닫기
            const modal = document.getElementById('gameStartModal');
            if (modal && (modal.style.display !== 'none' || modal.classList.contains('show'))) {
                console.log('[Client] game_state: Hiding game start modal because game is ready');
                if (typeof hideGameStartModal === 'function') {
                    hideGameStartModal();
                } else {
                    modal.style.display = 'none';
                    modal.style.visibility = 'hidden';
                    modal.style.opacity = '0';
                    modal.style.pointerEvents = 'none';
                    modal.classList.remove('show');
                    modal.style.zIndex = '-1';
                }
            }
            
            if (typeof hideStonePickingModal === 'function') {
                hideStonePickingModal();
            }
            
            // 모달이 완전히 닫혔는지 확인하고, Canvas가 클릭 가능한지 확인
            setTimeout(() => {
                const modal = document.getElementById('gameStartModal');
                const canvas = document.getElementById('goBoard');
                const computedModal = modal ? window.getComputedStyle(modal) : null;
                const computedCanvas = canvas ? window.getComputedStyle(canvas) : null;
                
                console.log('[Client] Modal and canvas state after game ready:', {
                    modalExists: !!modal,
                    modalDisplay: modal?.style.display,
                    modalVisibility: modal?.style.visibility,
                    modalZIndex: modal?.style.zIndex,
                    modalPointerEvents: modal?.style.pointerEvents,
                    computedModalDisplay: computedModal?.display,
                    computedModalZIndex: computedModal?.zIndex,
                    computedModalPointerEvents: computedModal?.pointerEvents,
                    modalHasShowClass: modal?.classList.contains('show'),
                    canvasExists: !!canvas,
                    canvasDisplay: canvas?.style.display,
                    canvasVisibility: canvas?.style.visibility,
                    canvasPointerEvents: canvas?.style.pointerEvents,
                    computedCanvasDisplay: computedCanvas?.display,
                    computedCanvasZIndex: computedCanvas?.zIndex,
                    computedCanvasPointerEvents: computedCanvas?.pointerEvents,
                    windowGameExists: !!window.game,
                    windowGameIsMyTurn: window.game?.isMyTurn,
                    windowGameCanvas: window.game?.canvas,
                    windowGameCanvasPointerEvents: window.game?.canvas ? window.getComputedStyle(window.game.canvas).pointerEvents : null
                });
                
                // Canvas 클릭 테스트를 위한 추가 정보 및 테스트 핸들러
                if (canvas && window.game) {
                    console.log('[Client] Canvas click test info:', {
                        canvasRect: canvas.getBoundingClientRect(),
                        canvasWidth: canvas.width,
                        canvasHeight: canvas.height,
                        canvasOffsetWidth: canvas.offsetWidth,
                        canvasOffsetHeight: canvas.offsetHeight,
                        canvasClientWidth: canvas.clientWidth,
                        canvasClientHeight: canvas.clientHeight
                    });
                    
                    // Canvas 클릭 이벤트 테스트 (단순 확인용)
                    const testClickHandler = (e) => {
                        console.log('[Client] TEST: Canvas click event received!', {
                            clientX: e.clientX,
                            clientY: e.clientY,
                            target: e.target,
                            currentTarget: e.currentTarget
                        });
                        // 이벤트가 GoGame의 핸들러로 전달되도록 하기 위해 제거하지 않음
                        // 하지만 먼저 도달하는지 확인하기 위해 로그만 출력
                    };
                    
                    // 테스트 핸들러를 capture phase에 추가 (다른 핸들러보다 먼저 실행)
                    canvas.addEventListener('click', testClickHandler, { capture: true, once: true });
                    console.log('[Client] Canvas click test handler added (capture phase). Please click on the board.');
                }
            }, 100);
        }
    });
    
    // processGameStateData 함수는 제거하고 인라인으로 처리
    
    // Initialize game (즉시 초기화)
    const canvas = document.getElementById('goBoard');
    if (canvas) {
        console.log('[Client] Canvas found, initializing GoGame...', {
            canvasId: canvas.id,
            canvasExists: !!canvas,
            initialBoardSize
        });
        const serverBoardSize = initialBoardSize || 19;
        window.game = new GoGame('goBoard', socket, currentUser, gameId, serverBoardSize);
        console.log('[Client] GoGame initialized:', {
            gameExists: !!window.game,
            canvas: window.game?.canvas,
            isMyTurn: window.game?.isMyTurn
        });
        
        // 바둑판이 표시되도록 확인
        const boardSection = document.getElementById('boardSection');
        const boardWrapper = document.querySelector('.board-wrapper');
        if (boardSection) {
            boardSection.style.display = 'flex';
            boardSection.style.visibility = 'visible';
            boardSection.style.opacity = '1';
        }
        if (boardWrapper) {
            boardWrapper.style.display = 'flex';
            boardWrapper.style.visibility = 'visible';
            boardWrapper.style.opacity = '1';
        }
        if (canvas) {
            canvas.style.display = 'block';
            canvas.style.visibility = 'visible';
            canvas.style.opacity = '1';
            canvas.style.pointerEvents = 'auto'; // 클릭 이벤트가 작동하도록 명시적으로 설정
            console.log('[Client] Canvas display settings applied:', {
                display: canvas.style.display,
                visibility: canvas.style.visibility,
                opacity: canvas.style.opacity,
                pointerEvents: canvas.style.pointerEvents
            });
        }
        
        // 바둑판 크기 업데이트 및 그리기
        setTimeout(() => {
            if (window.game && window.game.canvas) {
                window.game.updateCellSize();
                if (window.game.cellSize > 0) {
                    window.game.drawBoard();
                } else {
                    // cellSize가 0이면 다시 시도
                    setTimeout(() => {
                        if (window.game) {
                            window.game.updateCellSize();
                            window.game.drawBoard();
                        }
                    }, 200);
                }
            }
        }, 100);
        
        // 추가 확인 (DOM이 완전히 로드된 후)
        setTimeout(() => {
            if (window.game && window.game.canvas) {
                const rect = window.game.canvas.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    window.game.updateCellSize();
                    window.game.drawBoard();
                } else {
                    // canvas 크기가 0이면 재시도
                    setTimeout(() => {
                        if (window.game && window.game.canvas) {
                            window.game.updateCellSize();
                            window.game.drawBoard();
                        }
                    }, 300);
                }
            }
        }, 500);
        
        // 최종 확인 (1초 후)
        setTimeout(() => {
            if (window.game && window.game.canvas) {
                const rect = window.game.canvas.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    if (window.game.cellSize === 0 || !window.game.cellSize) {
                        window.game.updateCellSize();
                    }
                    window.game.drawBoard();
                }
            }
        }, 1000);
        
        // 새로고침 시에만 게임 상태 요청 (서버가 자동으로 보내지 않은 경우 대비)
        // 무한루프 방지: 한 번만 요청하고 플래그로 제어
        if (!gameStateRequested) {
            gameStateRequested = true;
            setTimeout(() => {
                // 서버가 자동으로 보내는 것을 기다림 (3초)
                if (!gameStateReceived) {
                    socket.emit('get_game_state');
                }
            }, 3000);
        }
        
        // window.game이 준비되었을 때 저장된 게임 상태가 있으면 로드
        function checkPendingState() {
            if (pendingGameState && window.game) {
                window.game.loadState(pendingGameState);
                pendingGameState = null;
            }
            // 바둑판 다시 그리기
            if (window.game && window.game.canvas) {
                setTimeout(() => {
                    if (window.game) {
                        window.game.updateCellSize();
                        if (window.game.cellSize > 0) {
                            window.game.drawBoard();
                        }
                    }
                }, 100);
            }
        }
        
        // 연결 시 요청 (서버가 자동으로 보내지만 안전장치)
        
        // 이미 연결되어 있으면 확인
        
        // 즉시 확인
        checkPendingState();
        
        // 약간의 지연 후 다시 확인 (game_state 이벤트가 나중에 올 수 있음)
        setTimeout(checkPendingState, 1000);
        }
        
    // Initialize timer
    window.timer = new GameTimer(socket);
    
    // 모바일 착수 버튼 기능 설정
    const mobileMoveButtonArea = document.getElementById('mobileMoveButtonArea');
    const mobileMoveControl = document.getElementById('mobileMoveControl');
    const useMoveButtonCheckbox = document.getElementById('useMoveButton');
    const confirmMoveBtn = document.getElementById('confirmMoveBtn');
    
    // 디버깅: 모바일 착수 버튼 체크박스 상태 확인
    console.log('[Client] Mobile move button checkbox state:', {
        checkboxExists: !!useMoveButtonCheckbox,
        checked: useMoveButtonCheckbox?.checked,
        checkboxId: useMoveButtonCheckbox?.id,
        checkboxValue: useMoveButtonCheckbox?.value
    });
    
    // 모바일에서만 착수 버튼 영역 표시
    if (mobileMoveButtonArea && mobileMoveControl && useMoveButtonCheckbox && confirmMoveBtn) {
        // 체크박스 변경 시
        useMoveButtonCheckbox.addEventListener('change', (e) => {
            mobileMoveButtonArea.style.display = e.target.checked ? 'block' : 'none';
            confirmMoveBtn.disabled = !pendingMove;
            // pendingMove가 있으면 다시 그리기
            if (pendingMove && window.game) {
                window.game.drawBoard();
            }
        });
        
        // 착수 버튼 클릭 시
        confirmMoveBtn.addEventListener('click', () => {
            if (!pendingMove || !window.game) return;
            
            // 게임이 종료되었는지 확인 (경쟁 조건 방지)
            if (gameEnded) {
                console.log('[Client] Game already ended, ignoring move request');
                pendingMove = null;
                confirmMoveBtn.disabled = true;
                return;
            }
            
            // 호버 효과 제거
            window.game.hoverX = null;
            window.game.hoverY = null;
            window.game.drawBoard(); // 투명한 돌 표시
            
            // 서버에만 착수 요청 (로컬 상태는 서버 응답 후 업데이트)
            socket.emit('make_move', {
                gameId: gameId,
                x: pendingMove.x,
                y: pendingMove.y
            });
            // 초기화
            pendingMove = null;
            confirmMoveBtn.disabled = true;
        });
        }
        
        // 바둑판 클릭 이벤트 오버라이드 (모바일 착수 버튼 모드에서만)
        // game.js의 setupEventListeners가 실행된 후에 오버라이드
        // 클래식 모드에서는 모바일 착수 버튼을 사용하지 않으므로 이 코드를 실행하지 않음
        // gameMode는 config.gameMode를 우선적으로 확인 (가장 정확함)
        // config 객체를 다시 확인 (gameRoomConfig에서 가져옴)
        const configGameMode = window.gameRoomConfig?.gameMode || config.gameMode;
        const currentGameMode = configGameMode || (window.gameState && window.gameState.game && window.gameState.game.mode) || initialGameMode || 'strategic';
        const isClassicMode = currentGameMode === 'CLASSIC';
        
        console.log('[Client] Checking mobile move button mode:', {
            useMoveButtonCheckboxExists: !!useMoveButtonCheckbox,
            checked: useMoveButtonCheckbox?.checked,
            windowGameExists: !!window.game,
            configGameMode: configGameMode,
            windowGameRoomConfigGameMode: window.gameRoomConfig?.gameMode,
            configGameModeValue: config.gameMode,
            windowGameStateMode: window.gameState?.game?.mode,
            initialGameMode,
            currentGameMode,
            isClassicMode,
            shouldSkip: isClassicMode
        });
        
        if (useMoveButtonCheckbox && useMoveButtonCheckbox.checked && window.game && !isClassicMode) {
            console.log('[Client] Mobile move button mode: Setting up click handler (non-classic mode)');
            setTimeout(() => {
                const newClickHandler = (e) => {
                    if (!window.game || !window.game.isMyTurn) {
                        return;
                    }
                    
                    // 요청 중이면 무시 (연속 클릭 방지)
                    if (window.game.isMovePending) {
                        return;
                    }
                    
                    const { boardX, boardY } = window.game.getBoardPosition(e.clientX, e.clientY);
                    if (window.game.isValidMove(boardX, boardY)) {
                        pendingMove = { x: boardX, y: boardY };
                        window.game.hoverX = boardX;
                        window.game.hoverY = boardY;
                        window.game.drawBoard(); // 투명한 돌을 그리기 위해 다시 그리기
                        confirmMoveBtn.disabled = false;
                    }
                };
                
                // 기존 클릭 이벤트 리스너를 제거하지 않고, 새 핸들러만 추가
                // Canvas를 클론하면 GoGame의 이벤트 리스너가 모두 사라지므로,
                // 대신 이벤트를 가로채서 처리하고 GoGame의 핸들러로 전달
                console.log('[Client] Setting up mobile move button handler (without replacing canvas)');
                
                // 기존 GoGame의 클릭 핸들러를 가로채서 먼저 처리
                // capture phase에서 실행되어 GoGame의 핸들러보다 먼저 실행됨
                const originalCanvas = window.game?.canvas || canvas;
                if (originalCanvas && useMoveButtonCheckbox && useMoveButtonCheckbox.checked) {
                    // 모바일 착수 버튼 모드일 때만 핸들러 추가
                    console.log('[Client] Mobile move button mode: Adding click handler');
                    originalCanvas.addEventListener('click', (e) => {
                        // 모바일 착수 버튼 모드: pendingMove만 설정하고 GoGame 핸들러는 실행하지 않음
                        newClickHandler(e);
                        e.stopPropagation(); // GoGame의 핸들러 실행 방지
                        e.preventDefault(); // 기본 동작 방지
                    }, true); // capture phase에서 먼저 실행
                } else {
                    // 모바일 착수 버튼 모드가 아니면 GoGame의 핸들러가 정상적으로 실행됨
                    console.log('[Client] Not in mobile move button mode, GoGame handlers will work normally', {
                        useMoveButtonCheckbox: !!useMoveButtonCheckbox,
                        checked: useMoveButtonCheckbox?.checked,
                        originalCanvas: !!originalCanvas,
                        windowGame: !!window.game,
                        windowGameCanvas: !!window.game?.canvas
                    });
                    
                    // GoGame의 이벤트 리스너가 등록되었는지 확인
                    if (window.game && window.game.canvas) {
                        console.log('[Client] Verifying GoGame click handler is registered...');
                        // 이벤트 리스너는 직접 확인할 수 없지만, setupEventListeners가 호출되었는지 확인
                        // GoGame의 setupEventListeners가 정상적으로 호출되었으면 핸들러가 등록되어야 함
                    }
                }
                
                // 터치 이동 시 호버 효과 업데이트 (모바일) - originalCanvas 사용
                if (originalCanvas) {
                    originalCanvas.addEventListener('touchmove', (e) => {
                        if (!window.game || !window.game.isMyTurn || !useMoveButtonCheckbox?.checked) return;
                        e.preventDefault();
                        const touch = e.touches[0];
                        
                        // 실제 픽셀 좌표 계산
                        const rect = originalCanvas.getBoundingClientRect();
                        const scaleX = originalCanvas.width / rect.width;
                        const scaleY = originalCanvas.height / rect.height;
                        const pixelX = (touch.clientX - rect.left) * scaleX;
                        const pixelY = (touch.clientY - rect.top) * scaleY;
                        
                        const { boardX, boardY } = window.game.getBoardPosition(touch.clientX, touch.clientY);
                        if (window.game.isValidMove(boardX, boardY)) {
                            // 교차점 위치 계산
                            const intersectionX = (boardX + 1) * window.game.cellSize;
                            const intersectionY = (boardY + 1) * window.game.cellSize;
                            
                            // 교차점과 터치 포인트 사이의 거리 계산
                            const dx = pixelX - intersectionX;
                            const dy = pixelY - intersectionY;
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            
                            // 교차점에서 반경 이내에 있으면 호버 효과 표시
                            const snapRadius = window.game.cellSize * 0.6;
                            
                            if (distance <= snapRadius) {
                                window.game.hoverX = boardX;
                                window.game.hoverY = boardY;
                                window.game.hoverPixelX = intersectionX;
                                window.game.hoverPixelY = intersectionY;
                                window.game.drawBoard();
                                if (confirmMoveBtn) confirmMoveBtn.disabled = false;
                            }
                        }
                    });
                    
                    // 마우스 이동 이벤트 (호버 효과) - 모바일 착수 버튼 모드에서만
                    // GoGame의 mousemove 핸들러와 충돌하지 않도록 조건부로만 처리
                    if (useMoveButtonCheckbox && useMoveButtonCheckbox.checked) {
                        originalCanvas.addEventListener('mousemove', (e) => {
                            if (!window.game || !window.game.isMyTurn) {
                                return;
                            }
                            const { boardX, boardY } = window.game.getBoardPosition(e.clientX, e.clientY);
                            if (window.game.isValidMove(boardX, boardY)) {
                                window.game.hoverX = boardX;
                                window.game.hoverY = boardY;
                                window.game.drawBoard();
                            } else {
                                if (window.game.hoverX !== null || window.game.hoverY !== null) {
                                    window.game.hoverX = null;
                                    window.game.hoverY = null;
                                    window.game.drawBoard();
                                }
                            }
                        });
                        
                        // 마우스가 캔버스를 벗어날 때 호버 제거
                        originalCanvas.addEventListener('mouseleave', () => {
                            if (window.game && useMoveButtonCheckbox?.checked) {
                                window.game.hoverX = null;
                                window.game.hoverY = null;
                                window.game.drawBoard();
                            }
                        });
                    } // if (useMoveButtonCheckbox && useMoveButtonCheckbox.checked) 블록 닫기
                } // if (originalCanvas) 블록 닫기
                
                // 바둑판 다시 그리기
                if (window.game) {
                    window.game.updateCellSize();
                    window.game.drawBoard();
                }
            }, 100);
        }
        
        // 턴이 변경될 때 pendingMove 초기화
        // move_made와 ai_move 이벤트는 아래에서 처리되므로 여기서는 초기화만
        const resetPendingMove = () => {
            pendingMove = null;
            if (confirmMoveBtn) {
                confirmMoveBtn.disabled = true;
            }
        };
        
        // move_made 이벤트에 초기화 추가 (아래 핸들러 실행 후)
        // 첫 번째 move_made 핸들러 (중복 방지용)
        socket.on('move_made', (data) => {
            console.log('[Client] First move_made handler called (resetPendingMove)', {
                hasData: !!data,
                hasMove: !!data?.move,
                data: data,
                move: data?.move,
                dataKeys: data ? Object.keys(data) : [],
                dataType: typeof data
            });
            resetPendingMove();
            // 이벤트가 계속 전파되도록 아무것도 반환하지 않음 (void)
        });
        
        // 두 번째 move_made 핸들러 (바둑돌 그리기) - 첫 번째 핸들러 직후에 등록
        console.log('[Client] Registering second move_made handler (right after first)...', {
            socketId: socket.id,
            socketExists: !!socket,
            hasSocketOn: typeof socket.on === 'function',
            timestamp: new Date().toISOString()
        });
        socket.on('move_made', (data) => {
            console.log('[Client] Second move_made handler called (full handler):', {
                hasGame: !!window.game,
                hasMove: !!data?.move,
                move: data?.move,
                data: data,
                dataKeys: data ? Object.keys(data) : [],
                capturedStones: data?.capturedStones,
                gameMode: data?.game?.mode,
                socketId: socket.id,
                timestamp: new Date().toISOString()
            });
            
            if (!window.game) {
                console.warn('[Client] move_made: Missing window.game', {
                    hasGame: !!window.game,
                    windowGame: window.game
                });
                return;
            }
            
            if (!data || !data.move) {
                console.warn('[Client] move_made: Missing data or data.move', {
                    hasData: !!data,
                    hasMove: !!data?.move,
                    data: data,
                    dataKeys: data ? Object.keys(data) : [],
                    move: data?.move
                });
                return;
            }
            
            // 베이스바둑: 베이스돌 정보 업데이트
            if (data.baseStones && window.game.loadState) {
                window.game.loadState({ baseStones: data.baseStones });
            }
            
            // Handle captured stones
            const capturedStones = data.capturedStones || [];
            console.log('[Client] Calling window.game.makeMove:', {
                move: data.move,
                capturedStones: capturedStones.length
            });
            const moveResult = window.game.makeMove(data.move, capturedStones);
            console.log('[Client] makeMove result:', moveResult);
            
            // 베이스바둑: 베이스 돌 다시 그리기 (수순 후에도 베이스 돌이 보이도록)
            if (window.game && window.game.baseStones) {
                setTimeout(() => {
                    window.game.drawBoard();
                }, 50);
            }
            
            // Update captured stones count
            if (data.capturedBlack !== undefined || data.capturedWhite !== undefined) {
                const gameData = {
                    game: data.game || {},
                    finalCaptureTarget: data.finalCaptureTarget || window.gameState?.finalCaptureTarget,
                    blackCaptureTarget: data.blackCaptureTarget || window.gameState?.blackCaptureTarget,
                    whiteCaptureTarget: data.whiteCaptureTarget || window.gameState?.whiteCaptureTarget
                };
                if (data.capturedBlack !== undefined) {
                    updateCapturedCount('blackCaptured', data.capturedBlack, gameData);
                }
                if (data.capturedWhite !== undefined) {
                    updateCapturedCount('whiteCaptured', data.capturedWhite, gameData);
                }
            }
            
            // 타이머 업데이트 (중요: move_made 후 턴 전환 및 타이머 업데이트)
            if (data.timers && window.timer) {
                // 게임 상태에서 초읽기 설정값 가져오기
                const byoyomiSeconds = (window.gameState && window.gameState.byoyomiSeconds) || data.timers.byoyomiSeconds || 30;
                const timeLimit = (window.gameState && window.gameState.timeLimit) || 30;
                const totalTime = timeLimit * 60;
                
                // 타이머 업데이트: updateTimers 메서드를 사용하여 currentTurn도 함께 업데이트
                window.timer.updateTimers(data.timers);
                
                // 제한시간이 0분이거나 모두 소진된 경우 초읽기 모드로 처리
                const isTimeLimitZero = totalTime === 0;
                const blackInByoyomi = data.timers.blackInByoyomi || isTimeLimitZero || ((data.timers.blackTime || totalTime) <= 0 && totalTime > 0);
                const whiteInByoyomi = data.timers.whiteInByoyomi || isTimeLimitZero || ((data.timers.whiteTime || totalTime) <= 0 && totalTime > 0);
                
                // 타이머 바 업데이트 (중요: 턴 전환 후 타이머 업데이트)
                if (typeof updateTimerBar === 'function') {
                    updateTimerBar('black', data.timers.blackTime || totalTime, totalTime, data.timers.blackByoyomiTime, blackInByoyomi, byoyomiSeconds);
                    updateTimerBar('white', data.timers.whiteTime || totalTime, totalTime, data.timers.whiteByoyomiTime, whiteInByoyomi, byoyomiSeconds);
                }
                
                // 초읽기 정보 업데이트
                if (typeof updateByoyomiDisplay === 'function') {
                    updateByoyomiDisplay('black', data.timers.blackByoyomiPeriods, blackInByoyomi, data.timers.blackByoyomiTime);
                    updateByoyomiDisplay('white', data.timers.whiteByoyomiPeriods, whiteInByoyomi, data.timers.whiteByoyomiTime);
                }
                
                console.log('[Client] move_made: Timer updated:', {
                    currentTurn: data.timers.currentTurn,
                    timerCurrentTurn: window.timer.currentTurn,
                    blackTime: data.timers.blackTime,
                    whiteTime: data.timers.whiteTime,
                    blackInByoyomi: data.timers.blackInByoyomi,
                    whiteInByoyomi: data.timers.whiteInByoyomi
                });
            }
            
            // 다음 색상 계산 (서버에서 전송된 currentColor 또는 timers.currentTurn 사용)
            const nextColor = data.currentColor || data.timers?.currentTurn || (data.move.color === 'black' ? 'white' : 'black');
            window.game.currentColor = nextColor;
            if (window.gameState) {
                window.gameState.currentColor = nextColor;
            }
            
            // 내 턴인지 확인 (AI 게임 고려)
            let isMyTurn = false;
            if (data.game && currentUser) {
                if (data.game.isAiGame) {
                    // AI 게임: AI 색상이 아니고, 현재 턴이 내 색상이면 내 턴
                    const aiColor = data.game.aiColor || 'white';
                    if (nextColor === 'black' && aiColor !== 'black' && data.game.blackId === currentUser.id) {
                        isMyTurn = true;
                    } else if (nextColor === 'white' && aiColor !== 'white' && data.game.whiteId === currentUser.id) {
                        isMyTurn = true;
                    } else {
                        isMyTurn = false;
                    }
                } else {
                    // PVP 게임: 현재 턴이 내 색상이면 내 턴
                    isMyTurn = (nextColor === 'black' && data.game.blackId === currentUser.id) ||
                               (nextColor === 'white' && data.game.whiteId === currentUser.id);
                }
            }
            window.game.isMyTurn = isMyTurn;
            
            console.log('[Client] move_made: Updated turn and isMyTurn:', {
                nextColor: nextColor,
                isMyTurn: isMyTurn,
                aiGame: data.game?.isAiGame,
                aiColor: data.game?.aiColor,
                blackId: data.game?.blackId,
                whiteId: data.game?.whiteId,
                currentUserId: currentUser?.id,
                timersCurrentTurn: data.timers?.currentTurn,
                dataCurrentColor: data.currentColor
            });
            
            console.log('[Client] move_made: Updated turn and isMyTurn:', {
                nextColor: nextColor,
                isMyTurn: isMyTurn,
                aiGame: data.game?.isAiGame,
                aiColor: data.game?.aiColor,
                blackId: data.game?.blackId,
                whiteId: data.game?.whiteId,
                currentUserId: currentUser?.id
            });
            
            // 믹스바둑: 현재 모드 표시
            if (data.currentMixMode || data.mixModeSwitched) {
                const modeNames = {
                    'CLASSIC': '일반',
                    'CAPTURE': '따내기',
                    'SPEED': '스피드',
                    'BASE': '베이스',
                    'HIDDEN': '히든',
                    'MISSILE': '미사일'
                };
                const currentMixMode = data.currentMixMode || window.currentMixMode;
                if (currentMixMode) {
                    const modeName = modeNames[currentMixMode] || currentMixMode;
                    const noticeText = `현재 모드: ${modeName}`;
                    updateGameNotice(noticeText);
                }
            }
            
            updateTurnIndicator(data.move.moveNumber || window.game.moveNumber, nextColor);
            
            // 더블 패스 감지: 양쪽이 모두 통과하면 계가 진행
            if (data.isDoublePass) {
                console.log('[Client] Double pass detected in move_made, starting scoring');
                // 계가중 오버레이 표시
                if (typeof showScoringOverlay === 'function') {
                    showScoringOverlay();
                }
                // 게임 종료 플래그 설정
                if (window.game) {
                    window.game.isMyTurn = false;
                    window.game.isScoring = true;
                }
                // scoring_started 이벤트를 기다림 (서버에서 emit됨)
            }
            
            // 게임 종료 처리
            if (data.isGameOver) {
                console.log('[Client] Game over detected in move_made');
                if (window.game) {
                    window.game.isMyTurn = false;
                }
            }
        });
        
        // ai_move 이벤트 핸들러: AI가 수를 둔 후 처리 (move_made와 동일한 로직)
        socket.on('ai_move', (data) => {
            console.log('[Client] ai_move event received:', {
                hasData: !!data,
                hasMove: !!data?.move,
                move: data?.move,
                timers: data?.timers,
                game: data?.game
            });
            
            resetPendingMove();
            
            if (!window.game || !data.move) {
                console.warn('[Client] ai_move: window.game or data.move is missing');
                return;
            }
            
            // Handle captured stones
            const capturedStones = data.capturedStones || [];
            const moveResult = window.game.makeMove(data.move, capturedStones);
            console.log('[Client] ai_move: makeMove result:', moveResult);
            
            // Update captured stones count
            if (data.capturedBlack !== undefined || data.capturedWhite !== undefined) {
                const gameData = {
                    game: data.game || {},
                    finalCaptureTarget: data.finalCaptureTarget || window.gameState?.finalCaptureTarget,
                    blackCaptureTarget: data.blackCaptureTarget || window.gameState?.blackCaptureTarget,
                    whiteCaptureTarget: data.whiteCaptureTarget || window.gameState?.whiteCaptureTarget
                };
                if (data.capturedBlack !== undefined) {
                    updateCapturedCount('blackCaptured', data.capturedBlack, gameData);
                }
                if (data.capturedWhite !== undefined) {
                    updateCapturedCount('whiteCaptured', data.capturedWhite, gameData);
                }
            }
            
            // 타이머 업데이트 (중요: ai_move 후 턴 전환 및 타이머 업데이트)
            if (data.timers && window.timer) {
                // 게임 상태에서 초읽기 설정값 가져오기
                const byoyomiSeconds = (window.gameState && window.gameState.byoyomiSeconds) || data.timers.byoyomiSeconds || 30;
                const timeLimit = (window.gameState && window.gameState.timeLimit) || 30;
                const totalTime = timeLimit * 60;
                
                // 타이머 업데이트: updateTimers 메서드를 사용하여 currentTurn도 함께 업데이트
                window.timer.updateTimers(data.timers);
                
                // 제한시간이 0분이거나 모두 소진된 경우 초읽기 모드로 처리
                const isTimeLimitZero = totalTime === 0;
                const blackInByoyomi = data.timers.blackInByoyomi || isTimeLimitZero || ((data.timers.blackTime || totalTime) <= 0 && totalTime > 0);
                const whiteInByoyomi = data.timers.whiteInByoyomi || isTimeLimitZero || ((data.timers.whiteTime || totalTime) <= 0 && totalTime > 0);
                
                // 타이머 바 업데이트 (중요: 턴 전환 후 타이머 업데이트)
                if (typeof updateTimerBar === 'function') {
                    updateTimerBar('black', data.timers.blackTime || totalTime, totalTime, data.timers.blackByoyomiTime, blackInByoyomi, byoyomiSeconds);
                    updateTimerBar('white', data.timers.whiteTime || totalTime, totalTime, data.timers.whiteByoyomiTime, whiteInByoyomi, byoyomiSeconds);
                }
                
                // 초읽기 정보 업데이트
                if (typeof updateByoyomiDisplay === 'function') {
                    updateByoyomiDisplay('black', data.timers.blackByoyomiPeriods, blackInByoyomi, data.timers.blackByoyomiTime);
                    updateByoyomiDisplay('white', data.timers.whiteByoyomiPeriods, whiteInByoyomi, data.timers.whiteByoyomiTime);
                }
                
                console.log('[Client] ai_move: Timer updated:', {
                    currentTurn: data.timers.currentTurn,
                    timerCurrentTurn: window.timer.currentTurn,
                    blackTime: data.timers.blackTime,
                    whiteTime: data.timers.whiteTime,
                    blackInByoyomi: data.timers.blackInByoyomi,
                    whiteInByoyomi: data.timers.whiteInByoyomi
                });
            }
            
            // 다음 색상 계산 (서버에서 전송된 currentColor 또는 timers.currentTurn 사용)
            const nextColor = data.currentColor || data.timers?.currentTurn || (data.move.color === 'black' ? 'white' : 'black');
            window.game.currentColor = nextColor;
            if (window.gameState) {
                window.gameState.currentColor = nextColor;
            }
            
            // 내 턴인지 확인 (AI 게임 고려)
            let isMyTurn = false;
            if (data.game && currentUser) {
                if (data.game.isAiGame) {
                    // AI 게임: AI 색상이 아니고, 현재 턴이 내 색상이면 내 턴
                    const aiColor = data.game.aiColor || 'white';
                    if (nextColor === 'black' && aiColor !== 'black' && data.game.blackId === currentUser.id) {
                        isMyTurn = true;
                    } else if (nextColor === 'white' && aiColor !== 'white' && data.game.whiteId === currentUser.id) {
                        isMyTurn = true;
                    } else {
                        isMyTurn = false;
                    }
                } else {
                    // PVP 게임: 현재 턴이 내 색상이면 내 턴
                    isMyTurn = (nextColor === 'black' && data.game.blackId === currentUser.id) ||
                               (nextColor === 'white' && data.game.whiteId === currentUser.id);
                }
            }
            window.game.isMyTurn = isMyTurn;
            
            console.log('[Client] ai_move: Updated turn and isMyTurn:', {
                nextColor: nextColor,
                isMyTurn: isMyTurn,
                aiGame: data.game?.isAiGame,
                aiColor: data.game?.aiColor,
                blackId: data.game?.blackId,
                whiteId: data.game?.whiteId,
                currentUserId: currentUser?.id,
                timersCurrentTurn: data.timers?.currentTurn,
                dataCurrentColor: data.currentColor
            });
            
            // 턴 표시 업데이트
            if (data.gameState && data.gameState.moveNumber) {
                updateTurnIndicator(data.gameState.moveNumber, nextColor);
            } else if (window.game && window.game.moveNumber) {
                updateTurnIndicator(window.game.moveNumber, nextColor);
            }
        });

    // 사이드바 토글 기능
    const sidebarToggle = document.getElementById('sidebarToggle');
    const gameContainer = document.querySelector('.game-container');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    
    if (sidebarToggle && gameContainer) {
        sidebarToggle.addEventListener('click', () => {
            gameContainer.classList.toggle('sidebar-collapsed');
            // 바둑판 크기 재계산 (레이아웃 변경 대응)
            setTimeout(() => {
                if (window.game) {
                    window.game.updateCellSize();
                    window.game.drawBoard();
                }
            }, 300);
        });
        }

    // 모바일에서 오버레이 클릭 시 사이드바 닫기
    if (sidebarOverlay && gameContainer) {
        sidebarOverlay.addEventListener('click', () => {
            gameContainer.classList.add('sidebar-collapsed');
        });
        }

    // 리사이즈 시 모바일 감지 업데이트 및 바둑판 크기 재계산
    let resizeTimer;
    let isMobile = window.innerWidth <= 768;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const newIsMobile = window.innerWidth <= 768;
            if (newIsMobile !== isMobile) {
                isMobile = newIsMobile;
            }
            // 바둑판 크기 재계산
            if (window.game) {
                window.game.updateCellSize();
                window.game.drawBoard();
            }
        }, 300);
        });

    // 타이머 바 업데이트 함수 (제한시간은 항상 유지, 초읽기 모드일 때는 초읽기 시간 표시)
    function updateTimerBar(color, timeLeft, totalTime, byoyomiTime = null, inByoyomi = false, byoyomiSeconds = 30) {
        // 전역 스코프에서 접근 가능하도록 window에 노출
        if (typeof window !== 'undefined') {
            window.updateTimerBar = updateTimerBar;
        }
        const barId = color === 'black' ? 'blackTimerBar' : 'whiteTimerBar';
        const timerId = color === 'black' ? 'blackTimer' : 'whiteTimer';
        const barElement = document.getElementById(barId);
        const timer = document.getElementById(timerId);
        
        if (!barElement || !timer) {
            console.warn(`[Client] updateTimerBar: Element not found for ${color}`, {
                barId,
                timerId,
                barExists: !!barElement,
                timerExists: !!timer
            });
            return;
        }
        
        // barElement가 timer-bar-fill 클래스를 가지고 있으면 그 자체가 fill 요소임 (EJS 구조상)
        // 그렇지 않으면 내부에서 찾음
        let barFill = barElement;
        if (!barElement.classList.contains('timer-bar-fill')) {
            barFill = barElement.querySelector('.timer-bar-fill');
        }

        if (!barFill) {
            console.error(`[Client] updateTimerBar: barFill element not found for ${color}`, {
                barId,
                barElement,
                barElementClasses: barElement.className
            });
            return;
        }
        
        // 상위 요소(컨테이너) 표시
        if (barFill.parentElement && barFill.parentElement.classList.contains('timer-bar')) {
            barFill.parentElement.style.display = 'block';
        }
        
        // initialTotalTime이 설정되어 있으면 그것을 사용, 없으면 현재 totalTime 사용
        // window.initialTotalTime을 우선 사용 (게임 시작 시 설정된 최대 시간)
        const initialTotal = (typeof window !== 'undefined' && window.initialTotalTime) 
            ? window.initialTotalTime 
            : (initialTotalTime || totalTime);
        
        // 제한시간이 0분이거나 모두 소진된 경우 초읽기 모드로 처리
        const isTimeLimitZero = initialTotal === 0 || totalTime === 0;
        const isTimeExhausted = !inByoyomi && timeLeft <= 0 && initialTotal > 0;
        const shouldUseByoyomiMode = inByoyomi || isTimeLimitZero || isTimeExhausted;
        
        let displayTotalVal, displayTime;

        if (shouldUseByoyomiMode) {
            // 초읽기 모드: 막대 그래프가 초읽기 시간을 표시 (꽉 찼다가 줄어듦)
            displayTotalVal = byoyomiSeconds; 
            // 초읽기 시간이 null이거나 undefined이면 초읽기 초기값으로 설정 (수를 두면 회복됨)
            // 하지만 실제로는 서버에서 byoyomiTime이 전달되어야 함
            if (byoyomiTime !== null && byoyomiTime !== undefined) {
                displayTime = Math.max(0, byoyomiTime);
            } else {
                // 서버에서 전달되지 않은 경우 초읽기 초기값 사용 (Max 상태)
                console.warn(`[Client] updateTimerBar: byoyomiTime is ${byoyomiTime} for ${color}, using byoyomiSeconds: ${byoyomiSeconds}`);
                displayTime = byoyomiSeconds;
            }
        } else {
            // 일반 모드: 막대 그래프가 전체 제한 시간을 표시
            displayTotalVal = initialTotal;
            displayTime = Math.max(0, timeLeft);
        }
        
        // displayTime이 0 이하이면 0으로 설정 (정확한 퍼센트 계산을 위해)
        const safeDisplayTime = Math.max(0, displayTime);
        const percent = Math.max(0, Math.min(100, (safeDisplayTime / displayTotalVal) * 100));
        
        // 타이머 바가 표시되도록 보장
        barFill.style.display = 'block';
        barFill.style.visibility = 'visible';
        barFill.style.opacity = '1';
        
        // 너비 설정 (0이면 정확히 0%, 0보다 크면 최소 0.1%로 표시)
        const finalWidth = percent <= 0 ? 0 : Math.max(0.1, percent);
        
        // transition이 적용되도록 하기 위해 현재 width를 확인하고 업데이트
        // getComputedStyle을 사용하여 정확한 현재 width 가져오기
        let currentWidth = finalWidth;
        try {
            const computedStyle = window.getComputedStyle(barFill);
            const parentComputedStyle = window.getComputedStyle(barFill.parentElement);
            const currentWidthPx = parseFloat(computedStyle.width);
            const parentWidthPx = parseFloat(parentComputedStyle.width);
            if (parentWidthPx > 0) {
                currentWidth = (currentWidthPx / parentWidthPx) * 100;
            }
        } catch (e) {
            // getComputedStyle 실패 시 style.width 사용
            const styleWidth = barFill.style.width;
            if (styleWidth) {
                currentWidth = parseFloat(styleWidth);
            }
        }
        
        // width가 변경될 때만 업데이트하여 transition 애니메이션이 작동하도록 함
        // 0.1% 이상 차이가 날 때만 업데이트 (부드러운 애니메이션을 위해)
        if (Math.abs(currentWidth - finalWidth) > 0.1) {
            // transition이 적용되도록 하기 위해 requestAnimationFrame 사용
            requestAnimationFrame(() => {
                barFill.style.width = finalWidth + '%';
            });
        } else if (Math.abs(currentWidth - finalWidth) > 0.01) {
            // 작은 차이도 업데이트 (더 정확한 표시)
            barFill.style.width = finalWidth + '%';
        }
        
        // 초읽기 모드일 때는 바 색상을 다르게 표시
        if (shouldUseByoyomiMode) {
            barFill.classList.add('byoyomi-mode');
            // 초읽기 시간이 얼마 안 남았을 때 색상 변경 (긴박함 표시)
            // displayTime은 이미 Math.max(0, byoyomiTime)으로 처리됨
            if (displayTime <= 10) {
                barFill.style.background = 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)'; // 빨간색
            } else if (displayTime > 0) {
                barFill.style.background = 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)'; // 노란색
            } else {
                barFill.style.background = 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)'; // 빨간색 (시간 초과)
            }
        } else {
            barFill.classList.remove('byoyomi-mode');
            if (timeLeft <= 60) {
                barFill.style.background = 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)';
            } else if (timeLeft <= 300) {
                barFill.style.background = 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)';
            } else {
                barFill.style.background = 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)';
            }
        }
        
        // 경고 상태 설정 (제한시간 기준)
        if (shouldUseByoyomiMode) {
            // 초읽기 모드: 초읽기 시간으로 경고 상태 결정
            const currentByoyomiTime = byoyomiTime !== null && byoyomiTime !== undefined ? byoyomiTime : byoyomiSeconds;
            if (currentByoyomiTime <= 10) {
                timer.classList.add('danger');
                timer.classList.remove('warning');
            } else if (currentByoyomiTime <= 30) {
                timer.classList.add('warning');
                timer.classList.remove('danger');
            } else {
                timer.classList.remove('warning', 'danger');
            }
        } else {
            // 일반 모드: 제한시간으로 경고 상태 결정
            if (timeLeft <= 60) {
                timer.classList.add('danger');
                timer.classList.remove('warning');
            } else if (timeLeft <= 300) {
                timer.classList.add('warning');
                timer.classList.remove('danger');
            } else {
                timer.classList.remove('warning', 'danger');
            }
        }
    }

    // 초읽기 표시 업데이트 함수 (항상 표시, 초읽기 모드일 때는 강조)
    function updateByoyomiDisplay(color, periods, inByoyomi, byoyomiTime = null) {
        const displayId = color === 'black' ? 'blackByoyomiDisplay' : 'whiteByoyomiDisplay';
        const countId = color === 'black' ? 'blackByoyomiCount' : 'whiteByoyomiCount';
        const display = document.getElementById(displayId);
        const count = document.getElementById(countId);
        
        if (!display || !count) {
            console.warn(`[Client] updateByoyomiDisplay: Element not found for ${color}`, {
                displayId,
                countId,
                displayExists: !!display,
                countExists: !!count
            });
            return;
        }
        
        // periods가 있으면 항상 표시 (초읽기 모드가 아니어도 표시)
        if (periods !== undefined && periods !== null && periods >= 0) {
            display.style.display = 'flex';
            count.textContent = periods.toString();
            // 초읽기 모드일 때는 활성화 스타일 적용
            if (inByoyomi && periods > 0) {
                display.classList.add('active');
                display.style.background = 'rgba(245, 158, 11, 0.4)';
                display.style.borderColor = 'rgba(245, 158, 11, 0.6)';
            } else {
                display.classList.remove('active');
                display.style.background = 'rgba(255, 193, 7, 0.2)';
                display.style.borderColor = 'rgba(255, 193, 7, 0.4)';
            }
        } else {
            // periods가 없으면 기본값 0 표시
            display.style.display = 'flex';
            count.textContent = '0';
            display.classList.remove('active');
            display.style.background = 'rgba(255, 193, 7, 0.2)';
            display.style.borderColor = 'rgba(255, 193, 7, 0.4)';
        }
    }

    // 턴 표시 업데이트
    function updateTurnIndicator(moveNumber, currentColor) {
        const turnNumberEl = document.getElementById('turnNumber');
        const turnColorEl = document.getElementById('turnColor');
        const currentMove = moveNumber || 0;
        const turnIndicator = document.getElementById('turnIndicator');
        
        if (!turnNumberEl || !turnColorEl) {
            console.warn('[Client] updateTurnIndicator: turnNumberEl or turnColorEl not found');
            return;
        }
        
        // 사이드바 수순 패널: 1/N 형식으로 표시
        if (turnIndicator && turnIndicator.classList.contains('turn-indicator-sidebar')) {
            // 사이드바의 경우 1/N 형식으로 표시
            if (window.gameState && window.gameState.autoScoringMove) {
                const autoScoringMove = window.gameState.autoScoringMove;
                turnNumberEl.textContent = `${currentMove}/${autoScoringMove}`;
                console.log('[Client] updateTurnIndicator: Sidebar with autoScoringMove:', `${currentMove}/${autoScoringMove}`);
                
                // N/N일 때 계가중 오버레이 표시 및 바둑돌 놓기 방지
                if (currentMove >= autoScoringMove) {
                    showScoringOverlay();
                    // 계가 시작 시 바둑돌 놓기 방지
                    if (window.game) {
                        window.game.isMyTurn = false;
                        window.game.isScoring = true;
                    }
                } else {
                    hideScoringOverlay();
                    // 계가가 아니면 플래그 해제 (단, 게임이 끝나지 않았을 때만)
                    if (window.game && !gameEnded) {
                        window.game.isScoring = false;
                    }
                }
            } else if (window.gameState && window.gameState.maxMoves) {
                const maxMoves = window.gameState.maxMoves;
                turnNumberEl.textContent = `${currentMove}/${maxMoves}`;
                console.log('[Client] updateTurnIndicator: Sidebar with maxMoves:', `${currentMove}/${maxMoves}`);
                
                // N/N일 때 계가중 오버레이 표시 및 바둑돌 놓기 방지
                if (currentMove >= maxMoves) {
                    showScoringOverlay();
                    // 계가 시작 시 바둑돌 놓기 방지
                    if (window.game) {
                        window.game.isMyTurn = false;
                        window.game.isScoring = true;
                    }
                } else {
                    hideScoringOverlay();
                    // 계가가 아니면 플래그 해제 (단, 게임이 끝나지 않았을 때만)
                    if (window.game && !gameEnded) {
                        window.game.isScoring = false;
                    }
                }
            } else {
                // 계가 정보가 없으면 단순히 수순만 표시
                turnNumberEl.textContent = currentMove;
                console.log('[Client] updateTurnIndicator: Sidebar without scoring info:', currentMove);
                hideScoringOverlay();
            }
        } else {
            // 플레이어 패널의 경우 기존대로 표시
            turnNumberEl.textContent = currentMove;
            console.log('[Client] updateTurnIndicator: Player panel:', currentMove);
        }
        
        turnColorEl.textContent = currentColor === 'black' ? '흑' : '백';
        
        // 계가까지 남은 수 표시 (플레이어 패널용)
        if (turnIndicator && !turnIndicator.classList.contains('turn-indicator-sidebar')) {
            // 플레이어 패널의 경우에만 계가 정보 추가 표시
            // 기존 계가 정보 요소 찾기 또는 생성
            let countingInfo = turnIndicator.querySelector('.counting-info');
            if (!countingInfo) {
                countingInfo = document.createElement('div');
                countingInfo.className = 'counting-info';
                countingInfo.style.cssText = 'font-size: 11px; color: rgba(156, 163, 175, 0.8); margin-top: 4px;';
                turnIndicator.appendChild(countingInfo);
            }
            
            // 자동계가 정보 우선 표시 (AI 게임인 경우)
            if (window.gameState && window.gameState.autoScoringMove) {
                const autoScoringMove = window.gameState.autoScoringMove;
                if (currentMove < autoScoringMove) {
                    countingInfo.textContent = `${autoScoringMove}턴에 자동계가`;
                    countingInfo.style.display = 'block';
                } else {
                    countingInfo.textContent = '자동계가 예정';
                    countingInfo.style.display = 'block';
                }
            }
            // maxMoves 정보 표시 (자동계가가 없을 때만)
            else if (window.gameState && window.gameState.maxMoves) {
                const maxMoves = window.gameState.maxMoves;
                const remainingMoves = Math.max(0, maxMoves - currentMove);
                
                if (remainingMoves > 0) {
                    countingInfo.textContent = `계가까지 ${remainingMoves}수 남음`;
                    countingInfo.style.display = 'block';
                } else {
                    countingInfo.textContent = '계가 예정';
                    countingInfo.style.display = 'block';
                }
            } else {
                // 계가 정보가 없으면 숨기기
                countingInfo.style.display = 'none';
            }
        }
        
        // 통과 버튼 활성화/비활성화
        const passBtn = document.getElementById('passBtn');
        if (passBtn) {
            if (window.game && window.game.isMyTurn) {
                passBtn.disabled = false;
                passBtn.style.cursor = 'pointer';
            } else {
                passBtn.disabled = true;
                passBtn.style.cursor = 'not-allowed';
            }
        }
        }
    
    // 계가중 오버레이 표시/숨김 함수
    function showScoringOverlay() {
        let overlay = document.getElementById('scoringOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'scoringOverlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 99999;
                pointer-events: auto;
            `;
            
            const text = document.createElement('div');
            text.textContent = '계가중..';
            text.style.cssText = `
                font-size: 4rem;
                font-weight: bold;
                color: #fbbf24;
                text-shadow: 0 0 20px rgba(251, 191, 36, 0.8);
                animation: pulse 2s ease-in-out infinite;
                pointer-events: none;
            `;
            
            // 애니메이션 추가
            let style = document.getElementById('scoringOverlayStyle');
            if (!style) {
                style = document.createElement('style');
                style.id = 'scoringOverlayStyle';
                style.textContent = `
                    @keyframes pulse {
                        0%, 100% { opacity: 1; transform: scale(1); }
                        50% { opacity: 0.7; transform: scale(1.05); }
                    }
                `;
                document.head.appendChild(style);
            }
            
            overlay.appendChild(text);
            document.body.appendChild(overlay);
        } else {
            overlay.style.display = 'flex';
            overlay.style.pointerEvents = 'auto';
        }
        
        // 계가 중에는 바둑돌을 놓을 수 없도록 설정
        if (window.game) {
            window.game.isMyTurn = false;
            window.game.isScoring = true;
        }
    }
    
    function hideScoringOverlay() {
        const overlay = document.getElementById('scoringOverlay');
        if (overlay) {
            overlay.style.display = 'none';
            overlay.style.pointerEvents = 'none';
        }
        
        // 계가 종료 시 플래그 해제 (하지만 게임이 끝났으므로 isMyTurn은 false로 유지)
        if (window.game) {
            window.game.isScoring = false;
        }
    }

    // 특수 기능 버튼 표시 (게임 모드에 따라)
    function updateSpecialButtons(gameMode, gameState = null) {
        const specialButtons = document.getElementById('specialButtons');
        if (!specialButtons) return;
        
        specialButtons.innerHTML = '';
        
        // 믹스바둑인 경우 현재 모드 확인
        let activeMode = gameMode;
        if (gameMode === 'MIX' && gameState && gameState.currentMixMode) {
            activeMode = gameState.currentMixMode;
        }
        
        // 기본 버튼들 (일반 게임)
        const buttons = [];
        
        // 특수 모드별 버튼
        if (activeMode === 'HIDDEN' || gameMode === 'MIX') {
            buttons.push({ id: 'hiddenBtn', text: '히든', icon: '/images/hidden.webp' });
        }
        if (activeMode === 'MISSILE' || gameMode === 'MIX') {
            buttons.push({ id: 'missileBtn', text: '미사일', icon: '/images/missile.webp' });
        }
        if (activeMode === 'HIDDEN' || gameMode === 'MIX') {
            buttons.push({ id: 'scanBtn', text: '스캔', icon: '/images/scan.webp' });
        }
        
        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.className = 'game-btn btn-special';
            button.id = btn.id;
            button.setAttribute('data-tooltip', btn.text);
            
            if (btn.icon) {
                const img = document.createElement('img');
                img.src = btn.icon;
                img.alt = btn.text;
                img.onerror = function() {
                    this.style.display = 'none';
                    this.parentElement.textContent = btn.text.charAt(0);
                };
                button.appendChild(img);
            } else {
                button.textContent = btn.text;
            }
            
            // 카운트 오버레이 추가 (특수 아이템 버튼만)
            if (btn.id.includes('Btn') && (btn.id.includes('hidden') || btn.id.includes('missile') || btn.id.includes('scan'))) {
                const countOverlay = document.createElement('div');
                countOverlay.className = 'btn-count-overlay';
                countOverlay.id = btn.id + 'Count';
                countOverlay.textContent = '0';
                button.appendChild(countOverlay);
            }
            
            specialButtons.appendChild(button);
        });
        
        // 게임 상태가 있으면 카운트 업데이트
        if (gameState) {
            updateButtonCounts(gameState);
        }
        }

    // 버튼 카운트 업데이트 함수
    function updateButtonCounts(gameState) {
        if (!gameState) return;
        
        // 히든 아이템 카운트
        const hiddenCountEl = document.getElementById('hiddenBtnCount');
        if (hiddenCountEl && gameState.hiddenStones !== undefined) {
            const hiddenLimit = gameState.hiddenStones || 0;
            const hiddenUsed = gameState.hiddenStonesUsed || 0;
            const hiddenRemaining = Math.max(0, hiddenLimit - hiddenUsed);
            hiddenCountEl.textContent = hiddenRemaining;
        }
        
        // 스캔 아이템 카운트
        const scanCountEl = document.getElementById('scanBtnCount');
        if (scanCountEl && gameState.scanCount !== undefined) {
            const scanLimit = gameState.scanCount || 0;
            const scanUsed = gameState.scanCountUsed || 0;
            const scanRemaining = Math.max(0, scanLimit - scanUsed);
            scanCountEl.textContent = scanRemaining;
        }
        
        // 미사일 아이템 카운트
        const missileCountEl = document.getElementById('missileBtnCount');
        if (missileCountEl && gameState.missileMoveLimit !== undefined) {
            const missileLimit = gameState.missileMoveLimit || 0;
            const missileUsed = gameState.missileMoveLimitUsed || 0;
            const missileRemaining = Math.max(0, missileLimit - missileUsed);
            missileCountEl.textContent = missileRemaining;
        }
        }

    // 히든바둑 관련 상태
    let hiddenItemActive = false;
    let hiddenItemDeadline = null;
    let scanItemActive = false;
    let scanItemDeadline = null;
    let scanMode = false;
    let hiddenItemTimerInterval = null;
    let scanItemTimerInterval = null;
    
    // 전역 변수로 설정 (game.js에서 접근 가능하도록)
    window.hiddenItemActive = false;
    window.scanItemActive = false;
    window.scanMode = false;

    function handleSpecialButton(buttonId) {
        switch (buttonId) {
            case 'hiddenBtn':
                updateHiddenButton();
                break;
            case 'scanBtn':
                updateScanButton();
                break;
            case 'missileBtn':
                updateMissileButton();
                break;
        }
        }

    function updateHiddenButton() {
        const hiddenBtn = document.getElementById('hiddenBtn');
        if (!hiddenBtn) return;
        
        window.hiddenItemActive = hiddenItemActive;
        
        if (window.game && window.game.isMyTurn && !hiddenItemActive) {
            // 히든 아이템 사용 횟수 체크는 서버에서 처리
            hiddenBtn.disabled = false;
        } else {
            hiddenBtn.disabled = true;
        }
        
        // 카운트 업데이트
        updateButtonCounts(window.gameState);
        }

    function updateScanButton() {
        const scanBtn = document.getElementById('scanBtn');
        if (!scanBtn) return;
        
        window.scanItemActive = scanItemActive;
        window.scanMode = scanMode;
        
        if (window.game && window.game.isMyTurn && !scanItemActive) {
            scanBtn.disabled = false;
        } else {
            scanBtn.disabled = true;
        }
        
        // 카운트 업데이트
        updateButtonCounts(window.gameState);
        }

    function updateMissileButton() {
        const missileBtn = document.getElementById('missileBtn');
        if (!missileBtn) return;
        
        window.missileItemActive = window.missileItemActive || false;
        
        if (window.game && window.game.isMyTurn && !window.missileItemActive) {
            // 미사일 아이템 사용 횟수 체크는 서버에서 처리
            missileBtn.disabled = false;
        } else {
            missileBtn.disabled = true;
        }
        
        // 카운트 업데이트
        updateButtonCounts(window.gameState);
        }

    function startHiddenItemTimer(deadline) {
        if (hiddenItemTimerInterval) {
            clearInterval(hiddenItemTimerInterval);
        }
        
        hiddenItemTimerInterval = setInterval(() => {
            const now = Date.now();
            const remaining = Math.max(0, deadline - now);
            const seconds = Math.ceil(remaining / 1000);
            
            if (remaining <= 0) {
                clearInterval(hiddenItemTimerInterval);
                hiddenItemActive = false;
                hiddenItemDeadline = null;
                updateHiddenButton();
            } else {
                const progress = (remaining / (deadline - (deadline - 30000))) * 100;
                updateItemTimerUI('hidden', seconds, progress);
            }
        }, 100);
        }

    function startScanItemTimer(deadline) {
        if (scanItemTimerInterval) {
            clearInterval(scanItemTimerInterval);
        }
        
        scanItemTimerInterval = setInterval(() => {
            const now = Date.now();
            const remaining = Math.max(0, deadline - now);
            const seconds = Math.ceil(remaining / 1000);
            
            if (remaining <= 0) {
                clearInterval(scanItemTimerInterval);
                scanItemActive = false;
                scanItemDeadline = null;
                updateScanButton();
            } else {
                const progress = (remaining / (deadline - (deadline - 30000))) * 100;
                updateItemTimerUI('scan', seconds, progress);
            }
        }, 100);
        }

    function updateItemTimerUI(type, seconds, progress) {
        const containerId = type === 'hidden' ? 'hiddenItemTimerContainer' : 'scanItemTimerContainer';
        const barId = type === 'hidden' ? 'hiddenItemTimerBar' : 'scanItemTimerBar';
        const textId = type === 'hidden' ? 'hiddenItemTimerText' : 'scanItemTimerText';
        
        const container = document.getElementById(containerId);
        const bar = document.getElementById(barId);
        const text = document.getElementById(textId);
        
        if (container) container.style.display = 'block';
        if (bar) bar.style.width = Math.max(0, Math.min(100, progress)) + '%';
        if (text) text.textContent = `${seconds}초`;
        
        // 프리즘 효과 (바둑판 섹션 테두리)
        const boardSection = document.getElementById('boardSection');
        if (boardSection) {
            if (progress < 20) {
                boardSection.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.8)';
            } else if (progress < 50) {
                boardSection.style.boxShadow = '0 0 15px rgba(245, 158, 11, 0.6)';
            } else {
                boardSection.style.boxShadow = '';
            }
        }
        }

    function hideItemTimerUI(type) {
        const containerId = type === 'hidden' ? 'hiddenItemTimerContainer' : 'scanItemTimerContainer';
        const container = document.getElementById(containerId);
        if (container) container.style.display = 'none';
        
        const boardSection = document.getElementById('boardSection');
        if (boardSection) {
            boardSection.style.boxShadow = '';
        }
        }

    // 나가기/일시정지 버튼 업데이트
    function updateLeaveButton() {
        const leaveBtn = document.getElementById('leaveBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        
        if (leaveBtn && pauseBtn) {
            const gameEnded = window.gameState && window.gameState.gameEnded;
            
            if (gameEnded) {
                leaveBtn.style.display = 'block';
                pauseBtn.style.display = 'none';
                // 게임 종료 시에만 활성화
                leaveBtn.disabled = false;
            } else {
                leaveBtn.style.display = 'block';
                pauseBtn.style.display = window.gameState && window.gameState.isPaused ? 'block' : 'none';
                leaveBtn.disabled = false;
            }
        }
    }

    // 아바타 선택 모달 열기
    function openAvatarSelector() {
        let avatarHTML = '<div class="avatar-grid">';
        for (let i = 1; i <= 10; i++) {
            avatarHTML += `<div class="avatar-item" data-avatar="${i}" onclick="selectAvatar(${i})">
                <img src="/images/profile${i}.webp" alt="Avatar ${i}" onerror="this.style.display='none'; this.parentElement.textContent='${i}'">
            </div>`;
        }
        avatarHTML += '</div>';
        
        // 아바타 선택 모달 표시
        showAvatarSelectorModal(avatarHTML);
        }

    // 아바타 선택 모달 표시 함수
    function showAvatarSelectorModal(html) {
        // 기존 모달이 있으면 제거
        const existingModal = document.getElementById('avatarSelectorModal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'avatarSelectorModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>프로필 아바타 선택</h2>
                    <button class="close-modal" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    ${html}
                </div>
            </div>
        `;
        
        // 배경 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                const modalEl = document.getElementById('avatarSelectorModal');
                if (modalEl) modalEl.remove();
            }
        });
        
        document.body.appendChild(modal);
        
        // 아바타 선택 버튼 이벤트 리스너 추가
        modal.querySelectorAll('.avatar-item').forEach(item => {
            item.addEventListener('click', () => {
                const modalEl = document.getElementById('avatarSelectorModal');
                if (modalEl) modalEl.remove();
            });
        });
        }
    
    // 티어 계산 함수 (레이팅에 따라) - 참고 저장소 기준
    function getTierFromRating(rating) {
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

    // 매너등급 계산 함수
    function getMannerGrade(mannerScore) {
        if (mannerScore >= 2000) return { grade: 'S', text: 'S급' };
        if (mannerScore >= 1800) return { grade: 'A', text: 'A급' };
        if (mannerScore >= 1600) return { grade: 'B', text: 'B급' };
        if (mannerScore >= 1400) return { grade: 'C', text: 'C급' };
        return { grade: 'D', text: 'D급' };
        }

    // 매너등급 업데이트
    function updateMannerGrade(elementId, mannerScore) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const gradeInfo = getMannerGrade(mannerScore);
        element.textContent = gradeInfo.text;
        element.className = 'manner-grade ' + gradeInfo.grade;
        }
    
    // 티어 이미지 업데이트
    function updateTierIcon(element, rating, size = 'normal') {
        if (!element) return;
        const tier = getTierFromRating(rating);
        const sizeClass = size === 'small' ? 'tier-icon-small' : 'tier-icon';
        element.className = sizeClass;
        element.src = `/images/tire${tier}.webp`;
        element.alt = `티어${tier}`;
        element.onerror = function() {
            this.style.display = 'none';
        };
        }
    
    // 아바타 업데이트
    function updateAvatar(targetUserId, avatarNumber) {
        // 플레이어 패널 아바타 업데이트
        const blackAvatar = document.getElementById('blackAvatar');
        const whiteAvatar = document.getElementById('whiteAvatar');
        
        // 게임 정보에서 플레이어 ID 확인
        let playerId = null;
        if (window.gameState && window.gameState.game) {
            if (window.gameState.game.blackId === targetUserId) {
                playerId = 'black';
            } else if (window.gameState.game.whiteId === targetUserId) {
                playerId = 'white';
            }
        }
        
        if (playerId === 'black' && blackAvatar) {
            if (avatarNumber) {
                blackAvatar.innerHTML = `<img src="/images/profile${avatarNumber}.webp" alt="Avatar" onerror="this.style.display='none'; this.parentElement.textContent='${(blackAvatar.textContent || 'A').charAt(0).toUpperCase()}'">`;
            }
            blackAvatar.setAttribute('data-avatar', avatarNumber || '1');
        }
        
        if (playerId === 'white' && whiteAvatar) {
            if (avatarNumber) {
                whiteAvatar.innerHTML = `<img src="/images/profile${avatarNumber}.webp" alt="Avatar" onerror="this.style.display='none'; this.parentElement.textContent='${(whiteAvatar.textContent || 'A').charAt(0).toUpperCase()}'">`;
            }
            whiteAvatar.setAttribute('data-avatar', avatarNumber || '1');
        }
        
        // 유저 목록 아바타 업데이트
        const userItems = document.querySelectorAll('.user-item');
        userItems.forEach(item => {
            const itemUserId = item.getAttribute('data-user-id');
            if (itemUserId === targetUserId) {
                const avatarEl = item.querySelector('.user-avatar');
                if (avatarEl && avatarNumber) {
                    avatarEl.innerHTML = `<img src="/images/profile${avatarNumber}.webp" alt="Avatar" onerror="this.style.display='none'; this.parentElement.textContent='${(item.textContent || 'A').charAt(0).toUpperCase()}'">`;
                }
            }
        });
        }
    
    // 플레이어 패널 내용 비우기 함수 (게임 시작 전)
    function clearPlayerPanelContent() {
        const blackName = document.getElementById('blackName');
        const whiteName = document.getElementById('whiteName');
        const blackAvatar = document.getElementById('blackAvatar');
        const whiteAvatar = document.getElementById('whiteAvatar');
        const blackRating = document.getElementById('blackRating');
        const whiteRating = document.getElementById('whiteRating');
        const blackManner = document.getElementById('blackManner');
        const whiteManner = document.getElementById('whiteManner');
        
        // 플레이어 이름을 빈 값으로 표시
        if (blackName) {
            blackName.textContent = '';
            blackName.style.opacity = '1';
            blackName.style.cursor = 'default';
            blackName.onclick = null;
        }
        if (whiteName) {
            whiteName.textContent = '';
            whiteName.style.opacity = '1';
            whiteName.style.cursor = 'default';
            whiteName.onclick = null;
        }
        
        // 아바타를 빈 값으로 표시
        if (blackAvatar) {
            blackAvatar.innerHTML = '';
            blackAvatar.style.opacity = '1';
            blackAvatar.style.cursor = 'default';
            blackAvatar.onclick = null;
        }
        if (whiteAvatar) {
            whiteAvatar.innerHTML = '';
            whiteAvatar.style.opacity = '1';
            whiteAvatar.style.cursor = 'default';
            whiteAvatar.onclick = null;
        }
        
        // 레이팅 숨기기 (빈 값)
        if (blackRating) {
            blackRating.textContent = '';
            blackRating.style.display = 'none';
        }
        if (whiteRating) {
            whiteRating.textContent = '';
            whiteRating.style.display = 'none';
        }
        
        // 티어 아이콘 숨기기
        const blackTierIcon = document.querySelector('.player-panel.black .tier-icon');
        const whiteTierIcon = document.querySelector('.player-panel.white .tier-icon');
        if (blackTierIcon) blackTierIcon.style.display = 'none';
        if (whiteTierIcon) whiteTierIcon.style.display = 'none';
        
        // 매너 점수 숨기기
        if (blackManner) {
            blackManner.style.display = 'none';
        }
        if (whiteManner) {
            whiteManner.style.display = 'none';
        }
    }
    
    // 플레이어 패널 내용 복원 함수 (게임 시작 후)
    function restorePlayerPanelContent(data) {
        // 서버에서 받은 플레이어 정보로 패널 내용 복원
        // data.blackPlayer와 data.whitePlayer를 사용하여 업데이트
        const game = data.game || window.gameState?.game || {};
        const isAiGame = game.isAiGame || false;
        const aiColor = game.aiColor || 'white';
        
        if (data.blackPlayer || (isAiGame && aiColor === 'black')) {
            const blackName = document.getElementById('blackName');
            const blackAvatar = document.getElementById('blackAvatar');
            const blackRating = document.getElementById('blackRating');
            const blackManner = document.getElementById('blackManner');
            
            if (blackName) {
                if (isAiGame && aiColor === 'black') {
                    blackName.textContent = 'AI';
                } else {
                    blackName.textContent = data.blackPlayer?.nickname || '흑';
                }
                blackName.style.opacity = '1';
                const blackPlayerId = isAiGame && aiColor === 'black' ? null : (data.blackPlayer?.id || null);
                if (blackPlayerId && blackPlayerId !== currentUser.id) {
                    blackName.style.cursor = 'pointer';
                    blackName.onclick = () => showProfileModal(blackPlayerId);
                } else {
                    blackName.style.cursor = 'default';
                    blackName.onclick = null;
                }
            }
            
            if (blackAvatar) {
                if (isAiGame && aiColor === 'black') {
                    blackAvatar.innerHTML = '<img src="/images/aibot.webp" alt="AI봇" onerror="this.style.display=\'none\'; this.parentElement.textContent=\'AI\';">';
                } else if (data.blackPlayer?.avatar) {
                    blackAvatar.innerHTML = `<img src="/images/profile${data.blackPlayer.avatar}.webp" alt="${data.blackPlayer.nickname}" onerror="this.style.display='none'; this.parentElement.textContent='${(data.blackPlayer.nickname || '흑').charAt(0).toUpperCase()}'">`;
                } else {
                    blackAvatar.innerHTML = (data.blackPlayer?.nickname || '흑').charAt(0).toUpperCase();
                }
                blackAvatar.style.opacity = '1';
                const blackPlayerId = isAiGame && aiColor === 'black' ? null : (data.blackPlayer?.id || null);
                if (blackPlayerId && blackPlayerId !== currentUser.id) {
                    blackAvatar.style.cursor = 'pointer';
                    blackAvatar.onclick = () => showProfileModal(blackPlayerId);
                } else {
                    blackAvatar.style.cursor = 'default';
                    blackAvatar.onclick = null;
                }
            }
            
            if (blackRating) {
                const rating = isAiGame && aiColor === 'black' ? (game.whiteRating || 1500) : (data.blackPlayer?.rating || 1500);
                blackRating.textContent = rating;
                blackRating.style.display = '';
                
                // 티어 아이콘 표시
                const blackTierIcon = document.querySelector('.player-panel.black .tier-icon');
                if (blackTierIcon) {
                    let tier = 1;
                    if (rating >= 3500) tier = 9;
                    else if (rating >= 3000) tier = 8;
                    else if (rating >= 2400) tier = 7;
                    else if (rating >= 2000) tier = 6;
                    else if (rating >= 1700) tier = 5;
                    else if (rating >= 1500) tier = 4;
                    else if (rating >= 1400) tier = 3;
                    else if (rating >= 1300) tier = 2;
                    blackTierIcon.src = `/images/tire${tier}.webp`;
                    blackTierIcon.style.display = '';
                }
            }
            
            if (blackManner && data.blackPlayer?.mannerScore !== undefined) {
                blackManner.style.display = '';
            }
        }
        
        if (data.whitePlayer || (isAiGame && aiColor === 'white')) {
            const whiteName = document.getElementById('whiteName');
            const whiteAvatar = document.getElementById('whiteAvatar');
            const whiteRating = document.getElementById('whiteRating');
            const whiteManner = document.getElementById('whiteManner');
            
            if (whiteName) {
                if (isAiGame && aiColor === 'white') {
                    whiteName.textContent = 'AI';
                } else {
                    whiteName.textContent = data.whitePlayer?.nickname || '백';
                }
                whiteName.style.opacity = '1';
                const whitePlayerId = isAiGame && aiColor === 'white' ? null : (data.whitePlayer?.id || null);
                if (whitePlayerId && whitePlayerId !== currentUser.id) {
                    whiteName.style.cursor = 'pointer';
                    whiteName.onclick = () => showProfileModal(whitePlayerId);
                } else {
                    whiteName.style.cursor = 'default';
                    whiteName.onclick = null;
                }
            }
            
            if (whiteAvatar) {
                if (isAiGame && aiColor === 'white') {
                    whiteAvatar.innerHTML = '<img src="/images/aibot.webp" alt="AI봇" onerror="this.style.display=\'none\'; this.parentElement.textContent=\'AI\';">';
                } else if (data.whitePlayer?.avatar) {
                    whiteAvatar.innerHTML = `<img src="/images/profile${data.whitePlayer.avatar}.webp" alt="${data.whitePlayer.nickname}" onerror="this.style.display='none'; this.parentElement.textContent='${(data.whitePlayer.nickname || '백').charAt(0).toUpperCase()}'">`;
                } else {
                    whiteAvatar.innerHTML = (data.whitePlayer?.nickname || '백').charAt(0).toUpperCase();
                }
                whiteAvatar.style.opacity = '1';
                const whitePlayerId = isAiGame && aiColor === 'white' ? null : (data.whitePlayer?.id || null);
                if (whitePlayerId && whitePlayerId !== currentUser.id) {
                    whiteAvatar.style.cursor = 'pointer';
                    whiteAvatar.onclick = () => showProfileModal(whitePlayerId);
                } else {
                    whiteAvatar.style.cursor = 'default';
                    whiteAvatar.onclick = null;
                }
            }
            
            if (whiteRating) {
                const rating = isAiGame && aiColor === 'white' ? (game.blackRating || 1500) : (data.whitePlayer?.rating || 1500);
                whiteRating.textContent = rating;
                whiteRating.style.display = '';
                
                // 티어 아이콘 표시
                const whiteTierIcon = document.querySelector('.player-panel.white .tier-icon');
                if (whiteTierIcon) {
                    let tier = 1;
                    if (rating >= 3500) tier = 9;
                    else if (rating >= 3000) tier = 8;
                    else if (rating >= 2400) tier = 7;
                    else if (rating >= 2000) tier = 6;
                    else if (rating >= 1700) tier = 5;
                    else if (rating >= 1500) tier = 4;
                    else if (rating >= 1400) tier = 3;
                    else if (rating >= 1300) tier = 2;
                    whiteTierIcon.src = `/images/tire${tier}.webp`;
                    whiteTierIcon.style.display = '';
                }
            }
            
            if (whiteManner && data.whitePlayer?.mannerScore !== undefined) {
                whiteManner.style.display = '';
            }
        }
    }
    
    // 전광판 업데이트 함수
    function updateGameNotice(message) {
        const noticeBoard = document.getElementById('gameNoticeBoard');
        if (noticeBoard && message) {
            noticeBoard.textContent = message;
        }
    }
    
    // window에 노출하여 game.js에서도 접근 가능하도록 함
    window.updateGameNotice = updateGameNotice;

    // Ready status update handler
    socket.on('ready_status_update', (data) => {
        // GameTimer의 gameReady도 업데이트
        if (window.timer) {
            window.timer.gameReady = data.gameReady || false;
        }
        
        // gameData를 전달하기 위해 window.gameState 사용
        const gameData = window.gameState || {};
        if (typeof updateReadyStatus === 'function') {
            updateReadyStatus(data.readyStatus, gameData);
        }
        
        // AI 게임 여부 확인
        const isAiGame = window.gameState && window.gameState.game && window.gameState.game.isAiGame;
        
        // 게임이 시작되었으면 모달 닫기 (AI 게임이 아닌 경우에만)
        // AI 게임인 경우 사용자가 직접 "경기 시작" 버튼을 누를 때까지 모달을 유지
        if (data.gameReady && !isAiGame) {
            setTimeout(() => {
                if (typeof hideGameStartModal === 'function') {
                    hideGameStartModal();
                }
            }, 300);
        }
        });

    // Game started handler
    socket.on('game_started', (data) => {
        console.log('[Client] game_started received:', data);
        
        // game.startedAt을 단일 소스로 사용
        const isGameReady = window.gameState && window.gameState.game && window.gameState.game.startedAt !== null;
        
        // GameTimer의 gameReady도 true로 설정
        if (window.timer) {
            window.timer.gameReady = isGameReady;
        }
        gameReady = isGameReady;
        
        // window.gameState 업데이트
        if (window.gameState) {
            window.gameState.gameReady = isGameReady;
        }
        
        // 베이스바둑: 베이스 돌 유지 (게임 시작 후에도 베이스 돌이 보이도록)
        if (window.game && window.game.baseStones) {
            window.game.drawBoard();
        }
        
        // AI 게임 여부 확인
        const isAiGame = window.gameState && window.gameState.game && window.gameState.game.isAiGame;
        
        // 모달 닫기
        if (baseColorSelectionModal) {
            baseColorSelectionModal.style.display = 'none';
            baseColorSelectionModal.classList.remove('show');
        }
        if (baseKomiSelectionModal) {
            baseKomiSelectionModal.style.display = 'none';
            baseKomiSelectionModal.classList.remove('show');
        }
        
        // 게임 시작 모달 닫기 (AI 게임이 아닌 경우에만)
        // AI 게임인 경우 사용자가 직접 "경기 시작" 버튼을 누를 때까지 모달을 유지
        if (!isAiGame) {
            console.log('[Client] game_started: Calling hideGameStartModal (PVP game)');
            if (typeof hideGameStartModal === 'function') {
                hideGameStartModal();
            } else {
                console.warn('[Client] game_started: hideGameStartModal function not found, hiding modal directly');
            }
            
            // 모달을 확실히 닫기 (직접 처리)
            const modal = document.getElementById('gameStartModal');
            if (modal) {
                console.log('[Client] game_started: Hiding modal directly');
                modal.style.display = 'none';
                modal.style.visibility = 'hidden';
                modal.style.opacity = '0';
                modal.style.pointerEvents = 'none';
                modal.classList.remove('show');
                modal.style.zIndex = '-1';
            }
        } else {
            console.log('[Client] game_started: AI game detected, keeping modal open until user clicks start button');
        }
        });

    // CAPTURE 모드에서 따낸 돌 표시 업데이트 함수
    function updateCapturedCount(elementId, capturedCount, gameData) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        // gameData가 없으면 window.gameState 사용
        // 따낸 돌 숫자 표시 (항상 크게)
        element.textContent = capturedCount || 0;
        
        // 목표점수 표시 (CAPTURE 모드일 때만)
        if (gameData.game && gameData.game.mode === 'CAPTURE') {
            const targetElementId = elementId === 'blackCaptured' ? 'blackCapturedTarget' : 'whiteCapturedTarget';
            const targetElement = document.getElementById(targetElementId);
            if (targetElement) {
                const target = elementId === 'blackCaptured' 
                    ? (gameData.game.blackCaptureTarget || gameData.captureTarget || 20)
                    : (gameData.game.whiteCaptureTarget || gameData.captureTarget || 20);
                targetElement.textContent = `/${target}`;
            }
        }
    }

    // Game events
    // 따내기바둑 입찰 관련 변수
    let captureBidModal = null;
    let localBid = 0; // 현재 설정한 덤 개수 (0~20)
    let biddingState = null;
    let bidTimerInterval = null;
    let bidDeadline = null;
    
    // 돌가리기 관련 변수
    let stonePickingModal = null;
    let stonePickingTimerInterval = null;
    let stonePickingDeadline = null;
    let stonePickingRole = null; // 'black' 또는 'white'

    // Game start modal variables (함수보다 먼저 선언하여 TDZ 문제 방지)
    let gameStartModal = null;
    let countdownInterval = null;
    let gameReady = false;
    
    // 베이스바둑 AI 게임용 모달 변수 (함수보다 먼저 선언하여 TDZ 문제 방지)
    let baseColorSelectionModal = null;
    let baseKomiSelectionModal = null;
    let selectedBaseColor = 'black';
    let selectedBaseKomi = 0;
    
    // 베이스바둑 AI 게임 전역 함수들 (모달 생성 전에 정의되어야 함)
    window.selectBaseColor = function(color) {
        selectedBaseColor = color;
        updateBaseColorSelectionModal();
    };
    
    window.confirmBaseColorSelection = function() {
        if (!baseColorSelectionModal) return;
        
        // 색상 선택 모달 닫기
        baseColorSelectionModal.style.display = 'none';
        baseColorSelectionModal.classList.remove('show');
        
        // 덤 설정 모달 표시
        showBaseKomiSelectionModal();
    };
    
    window.adjustBaseKomi = function(amount) {
        selectedBaseKomi = Math.max(0, Math.min(50, selectedBaseKomi + amount));
        updateBaseKomiSelectionModal();
    };
    
    window.confirmBaseSelection = function() {
        if (!baseKomiSelectionModal) return;
        
        // 덤 설정 모달 닫기
        baseKomiSelectionModal.style.display = 'none';
        baseKomiSelectionModal.classList.remove('show');
        
        // 서버에 색상 및 덤 전송
        if (typeof socket !== 'undefined' && socket) {
            console.log('[Client] Sending base game settings:', {
                color: selectedBaseColor,
                komi: 0.5 + selectedBaseKomi
            });
            socket.emit('set_base_game_settings', {
                color: selectedBaseColor,
                komi: 0.5 + selectedBaseKomi // 기본 0.5집 + 추가 덤
            });
        }
    };
    
    // 베이스바둑 AI 게임용 모달 함수 선언 (호이스팅을 위해 함수 선언문 사용)
    function showBaseColorSelectionModal() {
        console.log('[Client] showBaseColorSelectionModal called');
        
        // 모달이 없으면 생성
        if (!baseColorSelectionModal) {
            const existingModal = document.getElementById('baseColorSelectionModal');
            if (existingModal) {
                baseColorSelectionModal = existingModal;
            } else {
                createBaseColorSelectionModal();
            }
        }
        
        // 모달이 여전히 없으면 재시도
        if (!baseColorSelectionModal) {
            const modal = document.getElementById('baseColorSelectionModal');
            if (modal) {
                baseColorSelectionModal = modal;
            } else {
                console.error('[Client] baseColorSelectionModal not found after creation!');
                return;
            }
        }
        
        // 다른 모달 숨기기
        if (gameStartModal) {
            gameStartModal.style.display = 'none';
            gameStartModal.classList.remove('show');
        }
        if (baseKomiSelectionModal) {
            baseKomiSelectionModal.style.display = 'none';
            baseKomiSelectionModal.classList.remove('show');
        }
        
        selectedBaseColor = 'black';
        updateBaseColorSelectionModal();
        baseColorSelectionModal.style.display = 'flex';
        baseColorSelectionModal.style.visibility = 'visible';
        baseColorSelectionModal.style.opacity = '1';
        baseColorSelectionModal.style.zIndex = '10000';
        baseColorSelectionModal.classList.add('show');
        
        console.log('[Client] Base color selection modal displayed');
    }
    
    function showBaseKomiSelectionModal() {
        console.log('[Client] showBaseKomiSelectionModal called');
        
        // 모달이 없으면 생성
        if (!baseKomiSelectionModal) {
            const existingModal = document.getElementById('baseKomiSelectionModal');
            if (existingModal) {
                baseKomiSelectionModal = existingModal;
            } else {
                createBaseKomiSelectionModal();
            }
        }
        
        // 모달이 여전히 없으면 재시도
        if (!baseKomiSelectionModal) {
            const modal = document.getElementById('baseKomiSelectionModal');
            if (modal) {
                baseKomiSelectionModal = modal;
            } else {
                console.error('[Client] baseKomiSelectionModal not found after creation!');
                return;
            }
        }
        
        // 다른 모달 숨기기
        if (gameStartModal) {
            gameStartModal.style.display = 'none';
            gameStartModal.classList.remove('show');
        }
        if (baseColorSelectionModal) {
            baseColorSelectionModal.style.display = 'none';
            baseColorSelectionModal.classList.remove('show');
        }
        
        selectedBaseKomi = 0;
        updateBaseKomiSelectionModal();
        baseKomiSelectionModal.style.display = 'flex';
        baseKomiSelectionModal.style.visibility = 'visible';
        baseKomiSelectionModal.style.opacity = '1';
        baseKomiSelectionModal.style.zIndex = '10000';
        baseKomiSelectionModal.classList.add('show');
        
        console.log('[Client] Base komi selection modal displayed');
    }
    
    // 베이스바둑 AI 게임용 모달 생성 함수들 (호이스팅을 위해 함수 선언문 사용)
    function createBaseColorSelectionModal() {
        if (baseColorSelectionModal) {
            return; // 이미 생성됨
        }
        
        const modal = document.createElement('div');
        modal.id = 'baseColorSelectionModal';
        modal.className = 'base-komi-modal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="base-color-modal-content">
                <div class="base-komi-modal-header">
                    <div class="base-komi-modal-title">
                        <span>색상 선택</span>
                    </div>
                    <button class="base-komi-close-modal" onclick="document.getElementById('baseColorSelectionModal').style.display='none'">&times;</button>
                </div>
                <div class="base-komi-modal-body">
                    <p class="base-komi-description">
                        바둑판에 배치된 베이스돌을 확인하고 원하는 색상을 선택하세요.
                    </p>
                    <div class="base-stone-info">
                        <div class="base-stone-icon">💎</div>
                        <div class="base-stone-text">
                            <strong>베이스돌 안내</strong>
                            <p>베이스돌은 각각 5점의 가치를 가집니다. 베이스돌을 따내면 5점을 획득하고, 계가 시 사석으로 남아있으면 5점으로 계산됩니다.</p>
                        </div>
                    </div>
                    
                    <!-- 색상 선택 -->
                    <div class="base-color-section">
                        <label class="base-section-label">색상 선택</label>
                        <div class="base-color-buttons">
                            <button id="selectBaseColorBlackBtn" class="base-color-btn base-color-black">
                                <div class="base-color-icon">⚫</div>
                                <div class="base-color-text">
                                    <div class="base-color-name">흑</div>
                                    <div class="base-color-desc">선수</div>
                                </div>
                            </button>
                            <button id="selectBaseColorWhiteBtn" class="base-color-btn base-color-white">
                                <div class="base-color-icon">⚪</div>
                                <div class="base-color-text">
                                    <div class="base-color-name">백</div>
                                    <div class="base-color-desc">후수</div>
                                </div>
                            </button>
                        </div>
                    </div>
                    
                    <button id="confirmBaseColorBtn" class="base-confirm-btn">
                        <span class="base-confirm-icon">▶</span>
                        <span>다음</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        baseColorSelectionModal = modal;
        console.log('[Client] Base color selection modal created');
        
        // 드래그 기능 추가
        makeBaseColorModalDraggable(modal);
        
        // 이벤트 리스너 추가 (onclick 대신)
        const blackBtn = modal.querySelector('#selectBaseColorBlackBtn');
        const whiteBtn = modal.querySelector('#selectBaseColorWhiteBtn');
        const confirmBtn = modal.querySelector('#confirmBaseColorBtn');
        
        if (blackBtn) {
            blackBtn.addEventListener('click', () => {
                selectedBaseColor = 'black';
                updateBaseColorSelectionModal();
            });
        }
        if (whiteBtn) {
            whiteBtn.addEventListener('click', () => {
                selectedBaseColor = 'white';
                updateBaseColorSelectionModal();
            });
        }
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                if (!baseColorSelectionModal) return;
                baseColorSelectionModal.style.display = 'none';
                baseColorSelectionModal.classList.remove('show');
                showBaseKomiSelectionModal();
            });
        }
    }
    
    function createBaseKomiSelectionModal() {
        if (baseKomiSelectionModal) {
            return; // 이미 생성됨
        }
        
        const modal = document.createElement('div');
        modal.id = 'baseKomiSelectionModal';
        modal.className = 'base-komi-modal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="base-komi-modal-content">
                <div class="base-komi-modal-header">
                    <div class="base-komi-modal-title">
                        <span>덤 설정</span>
                    </div>
                    <button class="base-komi-close-modal" onclick="document.getElementById('baseKomiSelectionModal').style.display='none'">&times;</button>
                </div>
                <div class="base-komi-modal-body">
                    <p class="base-komi-description">
                        선택한 색상: <span id="selectedColorDisplay">흑</span>
                    </p>
                    
                    <!-- 덤 설정 -->
                    <div class="base-komi-section">
                        <label class="base-section-label">덤 설정</label>
                        <div class="base-komi-display">
                            <div class="base-komi-value" id="baseKomiDisplay">0</div>
                            <div class="base-komi-label">기본 0.5집 + 제시한 덤</div>
                        </div>
                        <input type="range" id="baseKomiSlider" class="base-komi-slider" min="0" max="50" value="0" step="1">
                        <div class="base-komi-buttons">
                            <button class="base-komi-btn" data-amount="10">+10</button>
                            <button class="base-komi-btn" data-amount="5">+5</button>
                            <button class="base-komi-btn" data-amount="1">+1</button>
                            <button class="base-komi-btn" data-amount="-1">-1</button>
                            <button class="base-komi-btn" data-amount="-5">-5</button>
                            <button class="base-komi-btn" data-amount="-10">-10</button>
                            <button class="base-komi-btn" data-amount="0">초기화</button>
                            <button class="base-komi-btn base-komi-btn-max" data-amount="50">MAX</button>
                        </div>
                    </div>
                    
                    <button id="confirmBaseSelectionBtn" class="base-confirm-btn">
                        <span class="base-confirm-icon">▶</span>
                        <span>경기 시작</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        baseKomiSelectionModal = modal;
        console.log('[Client] Base komi selection modal created');
        
        // 드래그 기능 추가
        makeBaseKomiModalDraggable(modal);
        
        // 이벤트 리스너 추가 (onclick 대신)
        const komiButtons = modal.querySelectorAll('.base-komi-btn');
        const confirmBtn = modal.querySelector('#confirmBaseSelectionBtn');
        const komiSlider = modal.querySelector('#baseKomiSlider');
        
        komiButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const amountAttr = btn.getAttribute('data-amount');
                if (amountAttr !== null) {
                    const amount = parseInt(amountAttr);
                    if (amount === 0) {
                        selectedBaseKomi = 0;
                    } else {
                        selectedBaseKomi = Math.max(0, Math.min(50, selectedBaseKomi + amount));
                    }
                    updateBaseKomiSelectionModal();
                }
            });
        });
        
        if (komiSlider) {
            komiSlider.addEventListener('input', (e) => {
                selectedBaseKomi = parseInt(e.target.value) || 0;
                updateBaseKomiSelectionModal();
            });
        }
        
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                if (!baseKomiSelectionModal) return;
                baseKomiSelectionModal.style.display = 'none';
                baseKomiSelectionModal.classList.remove('show');
                
                // 서버에 색상 및 덤 전송
                if (typeof socket !== 'undefined' && socket) {
                    console.log('[Client] Sending base game settings:', {
                        color: selectedBaseColor,
                        komi: 0.5 + selectedBaseKomi
                    });
                    socket.emit('set_base_game_settings', {
                        color: selectedBaseColor,
                        komi: 0.5 + selectedBaseKomi // 기본 0.5집 + 추가 덤
                    });
                }
            });
        }
    }
    
    function updateBaseColorSelectionModal() {
        if (!baseColorSelectionModal) return;
        
        // 색상 선택 버튼 업데이트
        const blackBtn = document.getElementById('selectBaseColorBlackBtn');
        const whiteBtn = document.getElementById('selectBaseColorWhiteBtn');
        if (blackBtn) {
            if (selectedBaseColor === 'black') {
                blackBtn.classList.add('active');
            } else {
                blackBtn.classList.remove('active');
            }
        }
        if (whiteBtn) {
            if (selectedBaseColor === 'white') {
                whiteBtn.classList.add('active');
            } else {
                whiteBtn.classList.remove('active');
            }
        }
    }
    
    function updateBaseKomiSelectionModal() {
        if (!baseKomiSelectionModal) return;
        
        // 선택한 색상 표시 업데이트
        const colorDisplay = document.getElementById('selectedColorDisplay');
        if (colorDisplay) {
            colorDisplay.textContent = selectedBaseColor === 'black' ? '흑' : '백';
        }
        
        // 덤 표시 업데이트
        const komiDisplay = document.getElementById('baseKomiDisplay');
        if (komiDisplay) {
            komiDisplay.textContent = selectedBaseKomi;
        }
        
        // 슬라이더 업데이트
        const komiSlider = document.getElementById('baseKomiSlider');
        if (komiSlider) {
            komiSlider.value = selectedBaseKomi;
        }
    }
    
    function makeBaseColorModalDraggable(modal) {
        const modalContent = modal.querySelector('.base-color-modal-content');
        if (!modalContent) return;
        
        let isDragging = false;
        let currentX = 0;
        let currentY = 0;
        let initialX = 0;
        let initialY = 0;
        let xOffset = 0;
        let yOffset = 0;
        
        // 드래그 시작
        const dragStart = (e) => {
            const target = e.target;
            const header = modalContent.querySelector('.base-komi-modal-header');
            const isHeaderArea = header && (target === header || header.contains(target));
            const isContentArea = target === modalContent || modalContent.contains(target);
            
            if (isHeaderArea || isContentArea) {
                if (e.type === 'touchstart') {
                    initialX = e.touches[0].clientX - xOffset;
                    initialY = e.touches[0].clientY - yOffset;
                } else {
                    initialX = e.clientX - xOffset;
                    initialY = e.clientY - yOffset;
                }
                isDragging = true;
                modalContent.style.cursor = 'grabbing';
                modalContent.style.userSelect = 'none';
            }
        };
        
        // 드래그 중
        const dragMove = (e) => {
            if (isDragging) {
                e.preventDefault();
                if (e.type === 'touchmove') {
                    currentX = e.touches[0].clientX - initialX;
                    currentY = e.touches[0].clientY - initialY;
                } else {
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;
                }
                
                xOffset = currentX;
                yOffset = currentY;
                
                modalContent.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
            }
        };
        
        // 드래그 종료
        const dragEnd = () => {
            if (isDragging) {
                isDragging = false;
                modalContent.style.cursor = 'grab';
                modalContent.style.userSelect = '';
            }
        };
        
        // 이벤트 리스너 추가 - 헤더와 모달 본문에만 추가 (버튼 컨테이너 제외)
        const header = content.querySelector('.game-start-modal-header');
        if (header) {
            header.addEventListener('mousedown', dragStart);
            header.addEventListener('touchstart', dragStart);
        }
        
        // 모달 본문에도 추가하되, 버튼 영역은 제외
        const modalBody = content.querySelector('.game-start-modal-body');
        if (modalBody) {
            modalBody.addEventListener('mousedown', dragStart);
            modalBody.addEventListener('touchstart', dragStart);
        }
        
        // 버튼 컨테이너는 드래그에서 완전히 제외
        const buttonContainer = content.querySelector('.start-button-container');
        if (buttonContainer) {
            buttonContainer.style.pointerEvents = 'auto';
            // 버튼 컨테이너의 모든 이벤트 전파 차단
            buttonContainer.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            }, true); // 캡처 단계에서 차단
            buttonContainer.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            }, true); // 캡처 단계에서 차단
            
            // 버튼 자체도 드래그에서 제외
            const startButton = buttonContainer.querySelector('#startGameButton');
            if (startButton) {
                startButton.style.pointerEvents = 'auto';
                startButton.style.cursor = 'pointer';
                startButton.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    return false;
                }, true); // 캡처 단계에서 차단
                startButton.addEventListener('touchstart', (e) => {
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    return false;
                }, true); // 캡처 단계에서 차단
            }
        }
        
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('touchmove', dragMove);
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchend', dragEnd);
    }
    
    function makeBaseKomiModalDraggable(modal) {
        const modalContent = modal.querySelector('.base-komi-modal-content');
        if (!modalContent) return;
        
        let isDragging = false;
        let currentX = 0;
        let currentY = 0;
        let initialX = 0;
        let initialY = 0;
        let xOffset = 0;
        let yOffset = 0;
        
        // 드래그 시작 (헤더만)
        const dragStart = (e) => {
            const target = e.target;
            const header = modalContent.querySelector('.base-komi-modal-header');
            const isHeaderArea = header && (target === header || header.contains(target));
            
            if (isHeaderArea) {
                if (e.type === 'touchstart') {
                    initialX = e.touches[0].clientX - xOffset;
                    initialY = e.touches[0].clientY - yOffset;
                } else {
                    initialX = e.clientX - xOffset;
                    initialY = e.clientY - yOffset;
                }
                isDragging = true;
                modalContent.style.cursor = 'grabbing';
                modalContent.style.userSelect = 'none';
                e.preventDefault();
            }
        };
        
        // 드래그 중
        const dragMove = (e) => {
            if (isDragging) {
                e.preventDefault();
                if (e.type === 'touchmove') {
                    currentX = e.touches[0].clientX - initialX;
                    currentY = e.touches[0].clientY - initialY;
                } else {
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;
                }
                
                xOffset = currentX;
                yOffset = currentY;
                
                modalContent.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
            }
        };
        
        // 드래그 종료
        const dragEnd = () => {
            if (isDragging) {
                isDragging = false;
                modalContent.style.cursor = 'grab';
                modalContent.style.userSelect = '';
            }
        };
        
        // 헤더에만 이벤트 리스너 추가
        const header = modalContent.querySelector('.base-komi-modal-header');
        if (header) {
            header.addEventListener('mousedown', dragStart);
            header.addEventListener('touchstart', dragStart);
        }
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('touchmove', dragMove);
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchend', dragEnd);
    }

    // 대국 준비 모달 드래그 기능
    function makeGameStartModalDraggable(modal) {
        const modalContent = modal.querySelector('.game-start-modal-content');
        if (!modalContent) return;
        
        // cloneNode를 사용하지 않고 직접 드래그 기능 추가
        // 버튼의 이벤트 리스너를 보존하기 위해 복제하지 않음
        const content = modalContent;
        
        let isDragging = false;
        let currentX = 0;
        let currentY = 0;
        let initialX = 0;
        let initialY = 0;
        let xOffset = 0;
        let yOffset = 0;
        
        // 드래그 오프셋 초기화 (항상 가운데에서 시작)
        xOffset = 0;
        yOffset = 0;
        content.style.transform = 'translate(0, 0)';
        content.style.position = 'relative';
        
        // 드래그 시작
        const dragStart = (e) => {
            const target = e.target;
            
            // 버튼이나 버튼 내부 요소는 드래그 제외 (더 엄격하게 체크)
            const buttonElement = content.querySelector('#startGameButton');
            const buttonContainer = content.querySelector('.start-button-container');
            
            // 버튼 관련 요소인지 확인
            if (target.closest('.start-game-button') || 
                target.closest('#startGameButton') || 
                target.closest('.start-button-container') ||
                target.id === 'startGameButton' ||
                target.classList.contains('start-game-button') ||
                (buttonElement && (target === buttonElement || buttonElement.contains(target))) ||
                (buttonContainer && (target === buttonContainer || buttonContainer.contains(target)))) {
                console.log('[Client] Drag prevented: clicked on start game button or container');
                e.stopPropagation(); // 버블링 방지
                return;
            }
            
            // 헤더나 모달 콘텐츠 영역에서 드래그 시작 가능 (버튼 영역 제외)
            const header = content.querySelector('.game-start-modal-header');
            const isHeaderArea = header && (target === header || header.contains(target));
            const isContentArea = target === content || content.contains(target);
            
            // 버튼 컨테이너는 드래그 제외
            if (buttonContainer && (target === buttonContainer || buttonContainer.contains(target))) {
                return;
            }
            
            if (isHeaderArea || (isContentArea && !buttonContainer.contains(target))) {
                if (e.type === 'touchstart') {
                    initialX = e.touches[0].clientX - xOffset;
                    initialY = e.touches[0].clientY - yOffset;
                } else {
                    initialX = e.clientX - xOffset;
                    initialY = e.clientY - yOffset;
                }
                isDragging = true;
                content.style.cursor = 'grabbing';
                content.style.userSelect = 'none';
            }
        };
        
        // 드래그 중
        const dragMove = (e) => {
            if (isDragging) {
                e.preventDefault();
                if (e.type === 'touchmove') {
                    currentX = e.touches[0].clientX - initialX;
                    currentY = e.touches[0].clientY - initialY;
                } else {
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;
                }
                
                xOffset = currentX;
                yOffset = currentY;
                
                content.style.position = 'relative';
                content.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
            }
        };
        
        // 드래그 종료
        const dragEnd = () => {
            if (isDragging) {
                isDragging = false;
                content.style.cursor = 'move';
                content.style.userSelect = '';
            }
        };
        
        // 이벤트 리스너 추가 - 헤더와 모달 본문에만 추가 (버튼 컨테이너 제외)
        const header = content.querySelector('.game-start-modal-header');
        if (header) {
            header.addEventListener('mousedown', dragStart);
            header.addEventListener('touchstart', dragStart);
        }
        
        // 버튼 컨테이너를 미리 찾아서 변수에 저장
        const buttonContainer = content.querySelector('.start-button-container');
        const buttonElement = content.querySelector('#startGameButton');
        
        // 모달 본문에도 추가하되, 버튼 영역은 제외
        const modalBody = content.querySelector('.game-start-modal-body');
        if (modalBody) {
            // 버튼 컨테이너를 제외하고 이벤트 리스너 추가
            modalBody.addEventListener('mousedown', (e) => {
                // 버튼 컨테이너나 버튼 자체는 제외
                if (buttonContainer && (e.target === buttonContainer || buttonContainer.contains(e.target))) {
                    return; // 드래그 시작하지 않음
                }
                if (buttonElement && (e.target === buttonElement || buttonElement.contains(e.target))) {
                    return;
                }
                dragStart(e);
            });
            modalBody.addEventListener('touchstart', (e) => {
                if (buttonContainer && (e.target === buttonContainer || buttonContainer.contains(e.target))) {
                    return;
                }
                if (buttonElement && (e.target === buttonElement || buttonElement.contains(e.target))) {
                    return;
                }
                dragStart(e);
            });
        }
        
        // 버튼 컨테이너는 드래그에서 완전히 제외
        // 버튼 컨테이너에 이벤트 리스너를 추가하지 않음 (버튼 자체의 이벤트 리스너가 처리)
        if (buttonContainer) {
            buttonContainer.style.pointerEvents = 'auto';
            buttonContainer.style.position = 'relative';
            buttonContainer.style.zIndex = '10002'; // 버튼 컨테이너도 최상위
            
            // 버튼 클릭 이벤트가 우선 처리되도록 stopPropagation 추가 (모든 단계에서)
            const preventDragOnButton = (e) => {
                e.stopPropagation(); // 드래그 이벤트로 전파 방지
                e.stopImmediatePropagation(); // 같은 요소의 다른 리스너도 차단
            };
            
            buttonContainer.addEventListener('mousedown', preventDragOnButton, true); // 캡처 단계
            buttonContainer.addEventListener('mousedown', preventDragOnButton, false); // 버블 단계
            buttonContainer.addEventListener('touchstart', preventDragOnButton, true);
            buttonContainer.addEventListener('touchstart', preventDragOnButton, false);
            
            // 클릭 이벤트도 전파 차단
            buttonContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
            }, true);
        }
        
        // 버튼 자체도 드래그에서 제외 (위에서 이미 선언됨)
        if (buttonElement) {
            buttonElement.style.pointerEvents = 'auto';
            buttonElement.style.position = 'relative';
            buttonElement.style.zIndex = '10003'; // 버튼이 최상위
            
            const preventDragOnButtonElement = (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
            };
            
            buttonElement.addEventListener('mousedown', preventDragOnButtonElement, true);
            buttonElement.addEventListener('touchstart', preventDragOnButtonElement, true);
        }
        
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('touchmove', dragMove);
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchend', dragEnd);
    }

    // Show game start modal
    function showGameStartModal(gameData) {
        // gameData의 gameReady를 확인 (전역 gameReady 변수는 모달이 닫힐 때만 true로 설정됨)
        console.log('[Client] showGameStartModal called with:', gameData);

        const modal = document.getElementById('gameStartModal');
        if (!modal) {
            console.error('[Client] gameStartModal element not found!');
            // DOM이 로드되지 않았을 수 있으므로 잠시 후 재시도
            setTimeout(() => {
                const retryModal = document.getElementById('gameStartModal');
                if (retryModal) {
                    showGameStartModal(gameData);
                } else {
                    console.error('[Client] gameStartModal element still not found after retry!');
                }
            }, 100);
            return;
        }
        
        // 모달이 이미 표시되어 있으면 중복 표시 방지
        if (modal.classList.contains('show') && modal.style.display !== 'none') {
            console.log('[Client] Game start modal already shown, skipping');
            return;
        }
        
        const isAiGame = gameData.game?.isAiGame || false;

        // 게임 모드별 설명 텍스트

        // 게임 설명 표시
        const gameDescriptionSection = document.getElementById('gameDescriptionSection');
        if (gameDescriptionSection) {
            const modeDescriptions = {
                'CLASSIC': '일반바둑입니다. 상대방보다 더 많은 집을 만들어 이기세요.',
                'CAPTURE': '따내기바둑입니다. 지정된 개수 이상의 돌을 따내면 승리합니다.',
                'SPEED': '스피드바둑입니다. 빠르게 두세요.',
                'BASE': '베이스바둑입니다. 베이스를 점령하세요.',
                'HIDDEN': '히든바둑입니다. 숨겨진 돌을 찾으세요.',
                'MISSILE': '미사일바둑입니다. 미사일을 발사하세요.',
                'MIX': '믹스바둑입니다. 다양한 규칙이 적용됩니다.'
            };
            const description = modeDescriptions[gameData.game?.mode] || '게임을 시작합니다.';
            gameDescriptionSection.textContent = description;
        }

        // 게임 정보 표시
        const gameInfoSection = document.getElementById('gameInfoSection');
        if (gameInfoSection) {
            const modeNames = {
                'CLASSIC': '일반',
                'CAPTURE': '따내기',
                'SPEED': '스피드',
                'BASE': '베이스',
                'HIDDEN': '히든',
                'MISSILE': '미사일',
                'MIX': '믹스'
            };
            
            const modeName = modeNames[gameData.game?.mode] || gameData.game?.mode || '일반바둑';
            // window.gameState에서 우선 가져오고, 없으면 gameData에서, 없으면 기본값 사용
            const timeLimit = (window.gameState?.timeLimit !== undefined && window.gameState?.timeLimit !== null)
                ? window.gameState.timeLimit
                : ((gameData.timeLimit !== undefined && gameData.timeLimit !== null)
                    ? gameData.timeLimit
                    : (gameData.game?.timeLimit || 30));
            const timeIncrement = (gameData.timeIncrement !== undefined && gameData.timeIncrement !== null)
                ? gameData.timeIncrement
                : 5;
            const byoyomiSeconds = (window.gameState?.byoyomiSeconds !== undefined && window.gameState?.byoyomiSeconds !== null)
                ? window.gameState.byoyomiSeconds
                : ((gameData.byoyomiSeconds !== undefined && gameData.byoyomiSeconds !== null)
                    ? gameData.byoyomiSeconds
                    : 30);
            const byoyomiPeriods = (window.gameState?.byoyomiPeriods !== undefined && window.gameState?.byoyomiPeriods !== null)
                ? window.gameState.byoyomiPeriods
                : ((gameData.byoyomiPeriods !== undefined && gameData.byoyomiPeriods !== null)
                    ? gameData.byoyomiPeriods
                    : 5);
            const boardSize = (window.gameState?.boardSize !== undefined && window.gameState?.boardSize !== null)
                ? window.gameState.boardSize
                : (gameData.boardSize !== undefined ? gameData.boardSize : 19);

            // AI 게임일 때 흑/백 정보 추가 (베이스바둑이 아닌 경우에만)
            let userColor = null;
            let aiColor = null;
            const isBaseMode = gameData.game?.mode === 'BASE';
            if (isAiGame && gameData.game && !isBaseMode) {
                const aiColorInGame = gameData.game.aiColor || 'white';
                const userId = currentUserId || '';
                const gameBlackId = gameData.game.blackId || '';
                const gameWhiteId = gameData.game.whiteId || '';
                const isUserBlack = gameBlackId === userId;
                const isUserWhite = gameWhiteId === userId;
                
                console.log('[Client] AI game color determination:', {
                    isAiGame,
                    isBaseMode,
                    aiColorInGame,
                    userId,
                    gameBlackId,
                    gameWhiteId,
                    isUserBlack,
                    isUserWhite
                });
                
                // 유저가 흑인지 백인지 확인
                if (isUserBlack) {
                    userColor = 'black';
                    aiColor = 'white';
                } else if (isUserWhite) {
                    userColor = 'white';
                    aiColor = 'black';
                } else {
                    // 판단이 안 되는 경우, aiColor로 유추
                    if (aiColorInGame === 'black') {
                        userColor = 'white';
                        aiColor = 'black';
                    } else {
                        userColor = 'black';
                        aiColor = 'white';
                    }
                    console.warn('[Client] Could not determine user color from game IDs, using aiColor to infer');
                }
            }
            
            let gameInfoHTML = '';
            
            // AI 게임일 때 흑/백 정보를 맨 위에 표시 (베이스바둑이 아닌 경우에만)
            if (isAiGame && userColor && aiColor && !isBaseMode) {
                console.log('[Client] Adding user color info to modal:', { userColor, aiColor, isBaseMode });
                gameInfoHTML += `
                    <div class="game-info-item" style="font-weight: bold; margin-bottom: 8px;">
                        <span class="game-info-label">당신의 색상</span>
                        <span class="game-info-value">${userColor === 'black' ? '⚫ 흑 (선수)' : '⚪ 백 (후수)'}</span>
                    </div>
                `;
            } else {
                console.log('[Client] Skipping user color info:', { isAiGame, userColor, aiColor, isBaseMode });
            }
            
            gameInfoHTML += `
                <div class="game-info-item">
                    <span class="game-info-label">게임 모드</span>
                    <span class="game-info-value">${modeName}</span>
                </div>
                <div class="game-info-item">
                    <span class="game-info-label">바둑판 크기</span>
                    <span class="game-info-value">${boardSize}×${boardSize}</span>
                </div>
                <div class="game-info-item">
                    <span class="game-info-label">제한시간</span>
                    <span class="game-info-value">${timeLimit}분</span>
                </div>
            `;
            
            // 스피드바둑일 때는 피셔 방식 표시
            if (gameData.game?.mode === 'SPEED' && timeIncrement) {
                gameInfoHTML += `
                    <div class="game-info-item">
                        <span class="game-info-label">피셔 방식</span>
                        <span class="game-info-value">${timeIncrement}초 추가</span>
                    </div>
                `;
            }
            // 스피드바둑이 아닐 때만 초읽기 표시
            else if (gameData.game?.mode !== 'SPEED') {
                gameInfoHTML += `
                    <div class="game-info-item">
                        <span class="game-info-label">초읽기</span>
                        <span class="game-info-value">${byoyomiSeconds}초 × ${byoyomiPeriods}회</span>
                    </div>
                `;
            }
            
            // AI 게임일 때 계가까지 수순 표시
            if (gameData.game?.isAiGame) {
                const autoScoringMove = gameData.autoScoringMove || window.gameState?.autoScoringMove;
                gameInfoHTML += `
                    <div class="game-info-item">
                        <span class="game-info-label">자동 계가</span>
                        <span class="game-info-value">${autoScoringMove ? `${autoScoringMove}턴에 진행` : '설정하지 않음'}</span>
                    </div>
                `;
            }
            
            // 덤 표시 (CAPTURE 모드가 아닐 때만)
            if (gameData.game?.mode !== 'CAPTURE') {
                const komiValue = gameData.komi || gameData.game?.komi || 6.5;
                gameInfoHTML += `
                    <div class="game-info-item">
                        <span class="game-info-label">덤</span>
                        <span class="game-info-value">${komiValue}집</span>
                    </div>
                `;
            }
            
            // CAPTURE 모드일 때 목표 점수 표시
            if (gameData.game?.mode === 'CAPTURE') {
                const captureTarget = gameData.captureTarget || gameData.game?.captureTarget || 20;
                gameInfoHTML += `
                    <div class="game-info-item">
                        <span class="game-info-label">목표 점수</span>
                        <span class="game-info-value">${captureTarget}개</span>
                    </div>
                `;
            }
            
            // BASE 모드일 때 베이스 돌 개수 표시
            if (gameData.game?.mode === 'BASE') {
                const baseStoneCount = (window.gameState?.baseStoneCount !== undefined && window.gameState?.baseStoneCount !== null)
                    ? window.gameState.baseStoneCount
                    : (gameData.baseStoneCount || 4);
                gameInfoHTML += `
                    <div class="game-info-item">
                        <span class="game-info-label">베이스 돌 개수</span>
                        <span class="game-info-value">${baseStoneCount}개</span>
                    </div>
                `;
            }
            
            gameInfoSection.innerHTML = gameInfoHTML;
        }

        // 준비 상태 표시
        // AI 게임인 경우: AI는 항상 준비완료 상태로 표시
        const readyStatus = {
            black: isAiGame && gameData.game?.aiColor === 'black' ? true : (gameData.readyStatus?.black || false),
            white: isAiGame && gameData.game?.aiColor === 'white' ? true : (gameData.readyStatus?.white || false)
        };
        
        if (typeof updateReadyStatus === 'function') {
            updateReadyStatus(readyStatus, gameData);
        }

        // 모달 컨텐츠 위치 초기화 (항상 가운데에 오도록)
        const modalContent = modal.querySelector('.game-start-modal-content');
        if (modalContent) {
            // 드래그 오프셋 초기화
            modalContent.style.transform = 'none';
            modalContent.style.top = 'auto';
            modalContent.style.left = 'auto';
            modalContent.style.right = 'auto';
            modalContent.style.bottom = 'auto';
            modalContent.style.margin = '0';
            modalContent.style.position = 'relative';
        }
        
        // 모달 표시 (확실히 보이도록 설정하고 가운데 정렬)
        modal.style.display = 'flex';
        modal.style.visibility = 'visible';
        modal.style.opacity = '1';
        modal.style.zIndex = '10000';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.classList.add('show');
        // gameStartModal 변수에 할당 (이미 선언되어 있음)
        try {
            gameStartModal = modal;
        } catch (e) {
            console.error('[Client] Error assigning to gameStartModal:', e);
        }
        console.log('[Client] Game start modal displayed, modal:', modal, 'display:', modal.style.display, 'classList:', modal.classList.toString());
        
        // 모든 게임에서 드래그 기능 활성화
        makeGameStartModalDraggable(modal);
        
        // 버튼 이벤트 리스너 설정 (약간의 지연을 두어 DOM이 완전히 준비되도록)
        setTimeout(() => {
            setupStartGameButton();
        }, 50);

        // 카운트다운 시작 (유저 vs 유저 게임인 경우에만)
        const countdownSection = document.querySelector('.countdown-section');
        if (isAiGame) {
            // AI 게임인 경우: 카운트다운 섹션 숨김
            if (countdownSection) {
                countdownSection.style.display = 'none';
            }
        } else {
            // PVP 게임인 경우: 카운트다운 시작
            if (countdownSection && typeof startCountdown === 'function') {
                countdownSection.style.display = 'block';
                const deadline = Date.now() + 30000; // 30초 카운트다운
                startCountdown(deadline);
            }
        }
    }

    // Update ready status indicators with player profiles
    function updateReadyStatus(readyStatus, gameData) {
        const blackNickname = document.getElementById('blackReadyNickname');
        const whiteNickname = document.getElementById('whiteReadyNickname');
        const blackIndicator = document.getElementById('blackReadyIndicator');
        const whiteIndicator = document.getElementById('whiteReadyIndicator');
        const blackItem = blackIndicator ? blackIndicator.closest('.player-info-item') : null;
        const whiteItem = whiteIndicator ? whiteIndicator.closest('.player-info-item') : null;
        
        // 베이스바둑일 때는 흑/백 유저 표시 숨기기
        if (gameData && gameData.game && gameData.game.mode === 'BASE') {
            return;
        }
        
        // 흑 플레이어 정보 표시
        if (blackNickname) {
            const isAiGame = gameData?.game?.isAiGame || false;
            const aiColor = gameData?.game?.aiColor || 'white';
            const userId = currentUserId || '';
            const isUserBlack = gameData?.game?.blackId === userId;
            
            if (isAiGame && aiColor === 'black') {
                blackNickname.textContent = 'AI';
            } else if (isAiGame && isUserBlack) {
                // AI 게임이고 유저가 흑인 경우
                const currentUser = window.currentUser || {};
                blackNickname.textContent = currentUser.nickname || '당신';
            } else {
                const blackPlayer = gameData?.blackPlayer || null;
                blackNickname.textContent = blackPlayer ? blackPlayer.nickname : '-';
            }
        }
        
        // 백 플레이어 정보 표시
        if (whiteNickname) {
            const isAiGame = gameData?.game?.isAiGame || false;
            const aiColor = gameData?.game?.aiColor || 'white';
            const userId = currentUserId || '';
            const isUserWhite = gameData?.game?.whiteId === userId;
            
            if (isAiGame && aiColor === 'white') {
                whiteNickname.textContent = 'AI';
            } else if (isAiGame && isUserWhite) {
                // AI 게임이고 유저가 백인 경우
                const currentUser = window.currentUser || {};
                whiteNickname.textContent = currentUser.nickname || '당신';
            } else {
                const whitePlayer = gameData?.whitePlayer || null;
                whiteNickname.textContent = whitePlayer ? whitePlayer.nickname : '-';
            }
        }
        
        // 준비 상태 표시
        if (blackIndicator) {
            if (readyStatus.black) {
                blackIndicator.classList.remove('waiting');
                blackIndicator.classList.add('ready');
                blackIndicator.querySelector('.indicator-text').textContent = '준비완료';
                if (blackItem) blackItem.classList.add('ready');
            } else {
                blackIndicator.classList.remove('ready');
                blackIndicator.classList.add('waiting');
                blackIndicator.querySelector('.indicator-text').textContent = '대기중';
                if (blackItem) blackItem.classList.remove('ready');
            }
        }
        
        if (whiteIndicator) {
            if (readyStatus.white) {
                whiteIndicator.classList.remove('waiting');
                whiteIndicator.classList.add('ready');
                whiteIndicator.querySelector('.indicator-text').textContent = '준비완료';
                if (whiteItem) whiteItem.classList.add('ready');
            } else {
                whiteIndicator.classList.remove('ready');
                whiteIndicator.classList.add('waiting');
                whiteIndicator.querySelector('.indicator-text').textContent = '대기중';
                if (whiteItem) whiteItem.classList.remove('ready');
            }
        }
    }

    // Setup start game button click handler
    let startButtonClickHandler = null; // 중복 방지를 위한 플래그
    function setupStartGameButton() {
        const startGameButton = document.getElementById('startGameButton');
        if (!startGameButton) {
            console.warn('[Client] setupStartGameButton: Button not found, will retry');
            setTimeout(() => {
                const retryButton = document.getElementById('startGameButton');
                if (retryButton) {
                    console.log('[Client] setupStartGameButton: Button found on retry, setting up event listener');
                    setupStartGameButton();
                } else {
                    console.error('[Client] setupStartGameButton: Button still not found after retry');
                }
            }, 100);
            return;
        }
        
        // 이미 이벤트 리스너가 등록되어 있으면 제거하고 다시 등록 (중복 방지)
        if (startButtonClickHandler) {
            console.log('[Client] setupStartGameButton: Removing existing event listeners');
            startGameButton.onclick = null;
            startGameButton.removeEventListener('click', startButtonClickHandler, true);
            startGameButton.removeEventListener('click', startButtonClickHandler, false);
        }
        
        console.log('[Client] setupStartGameButton: Button found, setting up event listener', {
            buttonId: startGameButton.id,
            buttonElement: startGameButton,
            alreadyHasHandler: startButtonClickHandler !== null
        });
        
        // 버튼이 비활성화되어 있으면 활성화 및 CSS 강제 설정
        startGameButton.disabled = false;
        startGameButton.style.pointerEvents = 'auto';
        startGameButton.style.cursor = 'pointer';
        startGameButton.style.position = 'relative';
        startGameButton.style.zIndex = '10003'; // 최상위로 설정
        startGameButton.style.userSelect = 'none'; // 텍스트 선택 방지
        
        // ::before pseudo-element가 클릭을 방해하지 않도록 처리
        const buttonStyles = window.getComputedStyle(startGameButton, '::before');
        if (buttonStyles && buttonStyles.content && buttonStyles.content !== 'none') {
            // ::before 요소가 있으면 pointer-events를 none으로 설정
            const style = document.createElement('style');
            style.textContent = `
                #startGameButton::before {
                    pointer-events: none !important;
                }
            `;
            document.head.appendChild(style);
            console.log('[Client] Added style to disable pointer-events on button ::before');
        }
        
        // 버튼 컨테이너도 설정 (다른 이름의 변수 사용하여 충돌 방지)
        const btnContainer = startGameButton.closest('.start-button-container');
        if (btnContainer) {
            btnContainer.style.pointerEvents = 'auto';
            btnContainer.style.position = 'relative';
            btnContainer.style.zIndex = '10002';
        }
        
        // 버튼 내부 요소들도 클릭 가능하도록 설정
        const buttonIcon = startGameButton.querySelector('.button-icon');
        const buttonText = startGameButton.querySelector('.button-text');
        if (buttonIcon) {
            buttonIcon.style.pointerEvents = 'none'; // 자식 요소는 이벤트를 부모로 전달
        }
        if (buttonText) {
            buttonText.style.pointerEvents = 'none';
        }
        
        // 클릭 이벤트 핸들러 정의
        startButtonClickHandler = function(e) {
            if (!e) e = window.event;
            
            console.log('[Client] Start game button click handler called', {
                buttonId: startGameButton.id,
                eventType: e.type || 'unknown',
                target: e.target,
                currentTarget: e.currentTarget,
                timestamp: Date.now()
            });
            
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            console.log('[Client] Start game button clicked', {
                buttonId: startGameButton.id,
                buttonElement: startGameButton,
                socketExists: typeof socket !== 'undefined',
                socketConnected: socket && socket.connected,
                eventType: e.type || 'unknown',
                timestamp: Date.now()
            });
            
            if (typeof socket !== 'undefined' && socket && socket.connected) {
                console.log('[Client] Emitting player_ready event');
                try {
                    socket.emit('player_ready');
                    console.log('[Client] player_ready event emitted successfully');
                } catch (error) {
                    console.error('[Client] Error emitting player_ready event:', error);
                }
                // 버튼 비활성화 (중복 클릭 방지)
                startGameButton.disabled = true;
                const buttonText = startGameButton.querySelector('.button-text');
                if (buttonText) {
                    buttonText.textContent = '시작 중...';
                } else {
                    startGameButton.textContent = '시작 중...';
                }
            } else {
                console.error('[Client] Socket not available or not connected', {
                    socketExists: typeof socket !== 'undefined',
                    socket: socket,
                    socketConnected: socket && socket.connected
                });
            }
            
            return false;
        };
        
        // 가장 단순하고 확실한 방법: onclick 속성 사용
        // 다른 모든 이벤트 리스너보다 우선순위가 높음
        startGameButton.onclick = function(e) {
            console.log('[Client] Button onclick fired!', {
                target: e.target,
                currentTarget: e.currentTarget
            });
            
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            // AI 게임 여부 확인
            const isAiGame = window.gameState && window.gameState.game && window.gameState.game.isAiGame;
            
            if (typeof socket !== 'undefined' && socket && socket.connected) {
                console.log('[Client] Emitting player_ready event');
                try {
                    socket.emit('player_ready');
                    console.log('[Client] player_ready event emitted successfully');
                    
                    // 버튼 비활성화 (중복 클릭 방지)
                    startGameButton.disabled = true;
                    const buttonText = startGameButton.querySelector('.button-text');
                    if (buttonText) {
                        buttonText.textContent = '시작 중...';
                    } else {
                        startGameButton.textContent = '시작 중...';
                    }
                    
                    // AI 게임인 경우 사용자가 버튼을 눌렀으므로 모달 닫기
                    if (isAiGame) {
                        setTimeout(() => {
                            if (typeof hideGameStartModal === 'function') {
                                hideGameStartModal();
                            } else {
                                const modal = document.getElementById('gameStartModal');
                                if (modal) {
                                    modal.style.display = 'none';
                                    modal.style.visibility = 'hidden';
                                    modal.style.opacity = '0';
                                    modal.style.pointerEvents = 'none';
                                    modal.classList.remove('show');
                                    modal.style.zIndex = '-1';
                                }
                            }
                        }, 100);
                    }
                } catch (error) {
                    console.error('[Client] Error emitting player_ready event:', error);
                }
            } else {
                console.error('[Client] Socket not available or not connected');
            }
            
            return false;
        };
        
        // 추가 보장을 위한 이벤트 리스너 (위임 방식)
        const modal = startGameButton.closest('.game-start-modal');
        const modalContent = startGameButton.closest('.game-start-modal-content');
        
        // 클릭 핸들러 정의 (재사용)
        const handleButtonClick = function(e) {
            const target = e.target;
            console.log('[Client] Button area clicked!', {
                target: target,
                targetId: target.id,
                targetClass: target.className,
                targetTag: target.tagName,
                button: startGameButton,
                isButton: target === startGameButton,
                isButtonChild: startGameButton.contains(target),
                isInContainer: target.closest('.start-button-container') !== null
            });
            
            // 이벤트 전파 방지
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            // 버튼 핸들러 직접 호출
            if (startGameButton.onclick) {
                console.log('[Client] Calling button onclick handler directly');
                try {
                    startGameButton.onclick(e);
                } catch (err) {
                    console.error('[Client] Error calling button onclick:', err);
                }
            }
            
            // socket으로 직접 전송 (이중 보장)
            if (typeof socket !== 'undefined' && socket && socket.connected) {
                console.log('[Client] Emitting player_ready directly from click handler');
                try {
                    socket.emit('player_ready');
                    startGameButton.disabled = true;
                    const buttonText = startGameButton.querySelector('.button-text');
                    if (buttonText) {
                        buttonText.textContent = '시작 중...';
                    }
                } catch (error) {
                    console.error('[Client] Error emitting player_ready:', error);
                }
            }
            
            return false;
        };
        
        // 모달에 클릭 이벤트 위임 (모든 클릭 로그)
        if (modal) {
            modal.addEventListener('click', function(e) {
                const target = e.target;
                console.log('[Client] Modal click detected!', {
                    target: target,
                    targetId: target.id,
                    targetClass: target.className,
                    targetTag: target.tagName,
                    isButton: target === startGameButton,
                    isButtonChild: startGameButton.contains(target),
                    isInContainer: target.closest('.start-button-container') !== null,
                    isInButtonClass: target.closest('.start-game-button') !== null
                });
                
                // 버튼 영역 클릭 감지
                if (target === startGameButton || 
                    startGameButton.contains(target) ||
                    target.closest('#startGameButton') ||
                    target.closest('.start-game-button') ||
                    target.closest('.start-button-container')) {
                    console.log('[Client] Button click detected in modal handler!');
                    handleButtonClick(e);
                }
            }, true); // 캡처 단계
            
            // mousedown도 모니터링
            modal.addEventListener('mousedown', function(e) {
                const target = e.target;
                console.log('[Client] Modal mousedown detected!', {
                    target: target,
                    targetId: target.id,
                    targetClass: target.className,
                    isButton: target === startGameButton || startGameButton.contains(target),
                    isInContainer: target.closest('.start-button-container') !== null
                });
            }, true);
        }
        
        // 모달 컨텐츠에도 클릭 이벤트 위임 (모든 클릭 로그)
        if (modalContent) {
            modalContent.addEventListener('click', function(e) {
                const target = e.target;
                console.log('[Client] Modal content click detected!', {
                    target: target,
                    targetId: target.id,
                    targetClass: target.className,
                    isButton: target === startGameButton || startGameButton.contains(target),
                    isInContainer: target.closest('.start-button-container') !== null
                });
                
                // 버튼 영역 클릭 감지
                if (target === startGameButton || 
                    startGameButton.contains(target) ||
                    target.closest('#startGameButton') ||
                    target.closest('.start-game-button') ||
                    target.closest('.start-button-container')) {
                    console.log('[Client] Button click detected in modal content handler!');
                    handleButtonClick(e);
                }
            }, true); // 캡처 단계
        }
        
        // 버튼 컨테이너에도 직접 핸들러 추가
        const buttonContainer = startGameButton.closest('.start-button-container');
        if (buttonContainer) {
            buttonContainer.addEventListener('click', function(e) {
                console.log('[Client] Button container clicked!', {
                    target: e.target,
                    currentTarget: e.currentTarget,
                    button: startGameButton
                });
                handleButtonClick(e);
            }, true);
            
            // mousedown도 감지
            buttonContainer.addEventListener('mousedown', function(e) {
                console.log('[Client] Button container mousedown!', {
                    target: e.target,
                    currentTarget: e.currentTarget
                });
            }, true);
            console.log('[Client] Button container click handler added');
        }
        
        // 전역 클릭 감지 (최후의 수단 - 디버깅용)
        const globalClickHandler = function(e) {
            const target = e.target;
            // 버튼이나 버튼 내부/근처를 클릭한 경우
            if (target === startGameButton || 
                startGameButton.contains(target) ||
                target.closest('#startGameButton') ||
                target.closest('.start-game-button') ||
                target.closest('.start-button-container')) {
                console.log('[Client] GLOBAL CLICK DETECTED ON BUTTON AREA!', {
                    target: target,
                    targetId: target.id,
                    targetClass: target.className,
                    button: startGameButton
                });
                
                // 이벤트 전파를 막지 않고 핸들러만 호출 (다른 핸들러도 실행되도록)
                if (startGameButton.onclick) {
                    try {
                        startGameButton.onclick(e);
                    } catch (err) {
                        console.error('[Client] Error in global click handler:', err);
                    }
                }
            }
        };
        document.addEventListener('click', globalClickHandler, true);
        console.log('[Client] Global click handler added for debugging');
        
        // mousedown으로도 처리 시도
        startGameButton.addEventListener('mousedown', function(e) {
            console.log('[Client] Button mousedown fired!', e.target);
            // mousedown에서 click을 트리거
            setTimeout(() => {
                if (startGameButton.onclick) {
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    startGameButton.dispatchEvent(clickEvent);
                }
            }, 0);
        }, true);
        
        // mousedown 이벤트도 추가 (클릭 감지 및 드래그 방지)
        const mousedownHandler = (e) => {
            e.stopPropagation();
            console.log('[Client] Start game button mousedown event triggered', {
                target: e.target,
                currentTarget: e.currentTarget,
                button: e.button
            });
        };
        startGameButton.addEventListener('mousedown', mousedownHandler, true);
        startGameButton.addEventListener('mousedown', mousedownHandler, false);
        
        // mouseup 이벤트도 추가 (클릭 직접 처리)
        const mouseupHandler = (e) => {
            console.log('[Client] Start game button mouseup event triggered', {
                target: e.target,
                currentTarget: e.currentTarget,
                button: e.button,
                hasHandler: startButtonClickHandler !== null,
                timestamp: Date.now()
            });
            
            // 왼쪽 버튼 클릭인 경우에만 처리
            if (e.button === 0) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                // mouseup에서도 클릭 핸들러 직접 호출
                if (startButtonClickHandler) {
                    console.log('[Client] Calling click handler from mouseup');
                    startButtonClickHandler(e);
                }
            }
            return false;
        };
        startGameButton.addEventListener('mouseup', mouseupHandler, true);
        startGameButton.addEventListener('mouseup', mouseupHandler, false);
        
        // touchstart, touchend도 추가 (모바일 지원)
        const touchStartHandler = (e) => {
            e.stopPropagation();
            console.log('[Client] Start game button touchstart event triggered');
        };
        startGameButton.addEventListener('touchstart', touchStartHandler, true);
        
        const touchEndHandler = (e) => {
            console.log('[Client] Start game button touchend event triggered');
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (startButtonClickHandler) {
                console.log('[Client] Calling click handler from touchend');
                startButtonClickHandler(e);
            }
            return false;
        };
        startGameButton.addEventListener('touchend', touchEndHandler, true);
        
        // 버튼 컨테이너에도 추가 클릭 이벤트 추가 (이미 위에서 선언된 buttonContainer 재사용)
        // buttonContainer는 위에서 이미 선언되었으므로 재사용
        if (buttonContainer) {
            buttonContainer.addEventListener('click', (e) => {
                // 버튼이나 버튼 내부 요소를 클릭한 경우에만 처리
                if (e.target === startGameButton || startGameButton.contains(e.target)) {
                    console.log('[Client] Click detected on button container (second handler), delegating to button handler');
                    if (startButtonClickHandler) {
                        startButtonClickHandler(e);
                    }
                }
            }, false); // 버블 단계에서도 처리
        }
        
        // 버튼 요소의 최종 상태 확인 및 로그
        const buttonComputedStyle = window.getComputedStyle(startGameButton);
        // btnContainer는 위에서 이미 선언되었으므로 재사용
        const containerComputedStyle = btnContainer ? window.getComputedStyle(btnContainer) : null;
        
        console.log('[Client] setupStartGameButton: Event listener attached successfully', {
            buttonId: startGameButton.id,
            hasOnclick: startGameButton.onclick !== null,
            onclickType: typeof startGameButton.onclick,
            buttonElement: startGameButton,
            disabled: startGameButton.disabled,
            buttonPointerEvents: startGameButton.style.pointerEvents,
            computedButtonPointerEvents: buttonComputedStyle.pointerEvents,
            buttonDisplay: buttonComputedStyle.display,
            buttonVisibility: buttonComputedStyle.visibility,
            buttonOpacity: buttonComputedStyle.opacity,
            buttonZIndex: buttonComputedStyle.zIndex,
            buttonCursor: buttonComputedStyle.cursor,
            containerPointerEvents: containerComputedStyle ? containerComputedStyle.pointerEvents : null,
            containerZIndex: containerComputedStyle ? containerComputedStyle.zIndex : null
        });
        
        // 버튼이 실제로 클릭 가능한지 테스트용 핸들러 (모든 이벤트 타입)
        const testHandler = (eventType) => {
            return (e) => {
                console.log(`[Client] TEST: Button ${eventType} event fired!`, {
                    target: e.target,
                    currentTarget: e.currentTarget,
                    button: e.button,
                    type: e.type
                });
            };
        };
        
        startGameButton.addEventListener('click', testHandler('click'), true);
        startGameButton.addEventListener('mousedown', testHandler('mousedown'), true);
        startGameButton.addEventListener('mouseup', testHandler('mouseup'), true);
        startGameButton.addEventListener('pointerdown', testHandler('pointerdown'), true);
        
        // 버튼 컨테이너에도 테스트 핸들러 추가
        if (btnContainer) {
            btnContainer.addEventListener('click', (e) => {
                console.log('[Client] TEST: Container click event fired!', {
                    target: e.target,
                    currentTarget: e.currentTarget
                });
            }, true);
        }
        
        // 전역 클릭 이벤트로도 확인 (디버깅용)
        document.addEventListener('click', (e) => {
            if (e.target === startGameButton || startGameButton.contains(e.target)) {
                console.log('[Client] TEST: Global click detected on button!', {
                    target: e.target,
                    button: startGameButton
                });
            }
        }, true);
    }
    
    // 초기 설정 (페이지 로드 시, 모달이 아직 표시되지 않았을 수 있으므로 나중에 다시 호출됨)
    // setupStartGameButton(); // 주석 처리: 모달이 표시될 때 호출됨

    // Start countdown
    function startCountdown(deadline) {

        const countdownBar = document.getElementById('countdownBar');
        const countdownTime = document.getElementById('countdownTime');

        const updateCountdown = () => {
            const now = Date.now();
            const remaining = Math.max(0, deadline - now);
            const seconds = Math.ceil(remaining / 1000);
            
            if (countdownBar) {
                const total = deadline - (deadline - 30000);
                const progress = (remaining / total) * 100;
                countdownBar.style.width = Math.max(0, Math.min(100, progress)) + '%';
            }
            
            if (countdownTime) {
                countdownTime.textContent = `${seconds}초`;
            }
            
            if (remaining <= 0) {
                if (countdownInterval) {
                    clearInterval(countdownInterval);
                }
            }
        };

        updateCountdown();
        const countdownInterval = setInterval(updateCountdown, 100);
    }

    // Show capture bid modal (덤 설정 모달)
    function showCaptureBidModal(bidData) {
        const modal = document.getElementById('captureBidModal');
        if (!modal) return;
        
        // 모달이 이미 표시되어 있으면 중복 표시 방지
        
        // 입찰 상태 저장
        biddingState = bidData;
        bidDeadline = bidData.captureBidDeadline || (Date.now() + 30000);
        localBid = 0; // 초기값 0
        
        // UI 초기화
        const bidSlider = document.getElementById('bidSlider');
        const bidValueDisplay = document.getElementById('bidValueDisplay');
        const bidRoundInfo = document.getElementById('bidRoundInfo');
        const bidStatusInfo = document.getElementById('bidStatusInfo');
        const submitBidButton = document.getElementById('submitBidButton');
        
        
        // 모달 표시
        modal.style.display = 'flex';
        modal.classList.add('show');
        captureBidModal = modal;
        
        // 타이머 시작
        startBidTimer();
        
        // 슬라이더 및 버튼 이벤트 설정
        setupBidControls();
    
    // 덤 설정 컨트롤 이벤트 설정
    function setupBidControls() {
        const bidSlider = document.getElementById('bidSlider');
        const bidDecreaseBtn = document.getElementById('bidDecreaseBtn');
        const bidIncreaseBtn = document.getElementById('bidIncreaseBtn');
        const bidValueDisplay = document.getElementById('bidValueDisplay');
        const submitBidButton = document.getElementById('submitBidButton');
        
        if (!bidSlider || !bidValueDisplay) return;
        
        // 슬라이더 값 변경
        
        // - 버튼
            };
        
        // + 버튼
            };
        
        // 제출 버튼
    
    // 덤 설정 타이머 시작
    function startBidTimer() {
        const updateTimer = () => {
            // 타이머 업데이트 로직은 각 모달에서 구현됨
        };
        
        updateTimer();
        bidTimerInterval = setInterval(updateTimer, 100);
    
    // 덤 설정 모달 닫기
    function hideCaptureBidModal() {
        const modal = document.getElementById('captureBidModal');
        if (modal) {
            modal.remove();
        }
        captureBidModal = null;
    }

    // Show stone picking modal (돌가리기 모달)
    function showStonePickingModal(pickingData) {
        const modal = document.getElementById('stonePickingModal');
        if (!modal) return;
        
        // 모달이 이미 표시되어 있으면 중복 표시 방지
        
        // 역할 저장
        stonePickingRole = pickingData.stonePickingRole;
        stonePickingDeadline = pickingData.stonePickingDeadline || (Date.now() + 30000);
        
        // 역할에 따라 UI 표시
        const whiteRoleDiv = document.getElementById('stonePickingWhiteRole');
        const blackRoleDiv = document.getElementById('stonePickingBlackRole');
        const subtitle = document.getElementById('stonePickingSubtitle');
        
            if (whiteRoleDiv) whiteRoleDiv.style.display = 'none';
            if (blackRoleDiv) blackRoleDiv.style.display = 'block';
            if (subtitle) subtitle.textContent = '홀수 또는 짝수를 선택하세요';
        
        // 상태 정보 초기화
        const statusInfo = document.getElementById('stonePickingStatusInfo');
        
        // 모달 표시
        modal.style.display = 'flex';
        modal.classList.add('show');
        stonePickingModal = modal;
        
        // 타이머 시작
        startStonePickingTimer();
        
        // 흑 역할일 때만 버튼 이벤트 설정
        if (stonePickingRole === 'black') {
            setupStonePickingButtons();
        }
    }

    // 돌가리기 버튼 이벤트 설정
    function setupStonePickingButtons() {
        const chooseOddBtn = document.getElementById('chooseOddBtn');
        const chooseEvenBtn = document.getElementById('chooseEvenBtn');
        
        if (chooseOddBtn) {
            chooseOddBtn.onclick = () => submitStonePickingChoice('odd');
        }
        if (chooseEvenBtn) {
            chooseEvenBtn.onclick = () => submitStonePickingChoice('even');
        }
    }

    // 돌가리기 타이머 시작
    function startStonePickingTimer() {
        if (stonePickingTimerInterval) {
            clearInterval(stonePickingTimerInterval);
        }
        
        const updateTimer = () => {
            const now = Date.now();
            const remaining = Math.max(0, stonePickingDeadline - now);
            const seconds = Math.ceil(remaining / 1000);
            
            const timerEl = document.getElementById('stonePickingTimer');
            if (timerEl) {
                timerEl.textContent = `${seconds}초`;
            }
            
            if (remaining <= 0) {
                if (stonePickingTimerInterval) {
                    clearInterval(stonePickingTimerInterval);
                }
                // 시간 초과 시 자동 선택 (흑 역할일 때만)
                if (stonePickingRole === 'black') {
                    submitStonePickingChoice('odd');
                }
            }
        };
        
        updateTimer();
        stonePickingTimerInterval = setInterval(updateTimer, 100);
    }
    
    // 돌가리기 선택 제출
    function submitStonePickingChoice(choice) {
        // 버튼 비활성화
        const chooseOddBtn = document.getElementById('chooseOddBtn');
        const chooseEvenBtn = document.getElementById('chooseEvenBtn');
        if (chooseOddBtn) chooseOddBtn.disabled = true;
        if (chooseEvenBtn) chooseEvenBtn.disabled = true;
        
        // 상태 업데이트
        const statusInfo = document.getElementById('stonePickingStatusInfo');
        if (statusInfo) {
            statusInfo.textContent = '선택이 제출되었습니다. 상대방을 기다리는 중...';
        }
        
        // 서버에 선택 전송
        socket.emit('submit_stone_picking_choice', { choice });
        }
    
    // 돌가리기 모달 닫기
    function hideStonePickingModal() {
        const modal = document.getElementById('stonePickingModal');
        if (modal) {
            modal.style.display = 'none';
        }
        stonePickingModal = null;
        }

    // Hide game start modal
    function hideGameStartModal() {
        const modal = document.getElementById('gameStartModal');
        if (modal) {
            console.log('[Client] Hiding game start modal, modal exists:', !!modal, 'before:', {
                display: window.getComputedStyle(modal).display,
                visibility: window.getComputedStyle(modal).visibility,
                zIndex: window.getComputedStyle(modal).zIndex,
                hasShowClass: modal.classList.contains('show')
            });
            
            // show 클래스를 먼저 제거 (CSS에서 display: flex로 설정됨)
            modal.classList.remove('show');
            
            // 모달 완전히 숨기기 (!important로 CSS 우선순위 우회)
            modal.style.setProperty('display', 'none', 'important');
            modal.style.setProperty('visibility', 'hidden', 'important');
            modal.style.setProperty('opacity', '0', 'important');
            modal.style.setProperty('z-index', '-1', 'important');
            modal.style.setProperty('pointer-events', 'none', 'important'); // 클릭 이벤트 차단
            modal.style.setProperty('position', 'fixed', 'important');
            modal.style.setProperty('top', '-9999px', 'important'); // 화면 밖으로 이동
            modal.style.setProperty('left', '-9999px', 'important');
            
            // CSS 클래스도 강제로 제거 (show 클래스가 display: flex로 설정)
            modal.className = modal.className.replace(/\bshow\b/g, '').trim();
            
            console.log('[Client] Game start modal hidden:', {
                display: modal.style.display,
                computedDisplay: window.getComputedStyle(modal).display,
                visibility: modal.style.visibility,
                opacity: modal.style.opacity,
                zIndex: modal.style.zIndex,
                computedZIndex: window.getComputedStyle(modal).zIndex,
                pointerEvents: modal.style.pointerEvents,
                computedPointerEvents: window.getComputedStyle(modal).pointerEvents,
                hasShowClass: modal.classList.contains('show'),
                className: modal.className
            });
        } else {
            console.warn('[Client] gameStartModal element not found when trying to hide');
        }
        gameReady = true;
    }

    // Show minigame modal
    function showMinigameModal(gameData) {
        const modal = document.getElementById('minigameModal');
        if (!modal) return;

        const minigameType = gameData.minigameType;
        const minigameTitle = document.getElementById('minigameTitle');
        const minigameSubtitle = document.getElementById('minigameSubtitle');
        const minigameContent = document.getElementById('minigameContent');
        const submitButton = document.getElementById('submitMinigameButton');

        let minigameResult = null;
        
        if (minigameType === 'stone_picking') {
            const buttons = minigameContent?.querySelectorAll('.minigame-btn');
            if (buttons) {
                buttons.forEach(btn => {
                    btn.addEventListener('click', () => {
                        buttons.forEach(b => {
                            b.style.transform = '';
                            b.style.boxShadow = '';
                        });
                        btn.style.transform = 'scale(1.1)';
                        btn.style.boxShadow = '0 0 20px rgba(102, 126, 234, 0.6)';
                        minigameResult = btn.dataset.stone;
                        if (submitButton) submitButton.style.display = 'block';
                    });
                });
            }
            if (minigameSubtitle) minigameSubtitle.textContent = '가위, 바위, 보 중 하나를 선택하세요. 이긴 쪽이 흑을 가져갑니다.';
        } else if (minigameType === 'rock_paper_scissors') {
            const buttons = minigameContent?.querySelectorAll('.minigame-btn');
            if (buttons) {
                buttons.forEach(btn => {
                    btn.addEventListener('click', () => {
                        buttons.forEach(b => {
                            b.style.transform = '';
                            b.style.boxShadow = '';
                        });
                        btn.style.transform = 'scale(1.1)';
                        btn.style.boxShadow = '0 0 20px rgba(102, 126, 234, 0.6)';
                        minigameResult = btn.dataset.choice;
                        if (submitButton) submitButton.style.display = 'block';
                    });
                });
            }
            if (minigameSubtitle) minigameSubtitle.textContent = '덤 값을 입력하세요. 양쪽 플레이어의 평균값이 사용됩니다.';
        }

        // 제출 버튼 이벤트
        if (submitButton) {
            submitButton.addEventListener('click', () => {
                if (minigameResult) {
                    socket.emit('submit_minigame_result', { result: minigameResult });
                    submitButton.textContent = '제출 완료';
                    submitButton.disabled = true;
                }
            });
        }

        modal.style.display = 'flex';
        }

    // Hide minigame modal
    function hideMinigameModal() {
        const modal = document.getElementById('minigameModal');
        if (modal) {
            modal.style.display = 'none';
        }
        }

    // Minigame status update handler
    socket.on('minigame_status_update', (data) => {
        // 미니게임 상태 업데이트 처리
        });

    // Minigame completed handler
    socket.on('minigame_completed', (data) => {
        if (typeof hideMinigameModal === 'function') {
            hideMinigameModal();
        }
        });

    // Start game button click handler는 setupStartGameButton 함수로 이동됨

    // game_state 핸들러는 위에서 이미 등록됨 (window.game 초기화 전에)
    // 중복 등록 방지 - 아래 중복 코드 제거됨
    
    // 아바타 업데이트 이벤트
    socket.on('avatar_updated', (data) => {
        if (data.userId && data.avatar) {
            if (typeof updateAvatar === 'function') {
                updateAvatar(data.userId, data.avatar);
            }
        }
        });

    // move_made 이벤트 핸들러는 위에서 첫 번째 핸들러 직후에 등록됨 (중복 제거)

    // 착수 에러 처리 (moveErrorJustOccurred는 184줄에서 선언됨)
    socket.on('move_error', (data) => {
        console.error('[Client] move_error received:', {
            error: data.error,
            fullData: data
        });
        
        // 패 규칙 에러인 경우 접두사 없이 표시, 그 외는 "착수 오류: " 접두사 추가
        const errorMessage = data.error || '알 수 없는 오류가 발생했습니다.';
        
        // 에러 메시지 표시 (전광판에 표시)
        if (typeof updateGameNotice === 'function') {
            updateGameNotice(errorMessage);
            console.log('[Client] move_error: Updated game notice with:', errorMessage);
        } else {
            console.warn('[Client] move_error: updateGameNotice function not found');
        }
        
        // GoGame의 pending 플래그 해제 및 차례 복구
        if (window.game) {
            // 즉시 상태 복구
            window.game.isMovePending = false;
            window.game.isMyTurn = true; // 서버가 거부했으므로 차례 유지
            
            // move_error 플래그 설정 (game_state가 isMyTurn을 덮어쓰지 않도록)
            moveErrorJustOccurred = true;
            
            // 하이브리드 착수: pending move 제거 (서버 거부 시 투명한 돌 제거)
            window.game.hoverX = null;
            window.game.hoverY = null;
            window.game.drawBoard();
            
            console.log('[Client] move_error: Reset game state - isMovePending:', window.game.isMovePending, 'isMyTurn:', window.game.isMyTurn, 'moveErrorJustOccurred:', moveErrorJustOccurred);
            
            // 1초 후 플래그 해제 (game_state 이벤트가 오지 않는 경우 대비)
            setTimeout(() => {
                moveErrorJustOccurred = false;
            }, 1000);
            
            // 보드 다시 그려서 상태 반영
            if (window.game.drawBoard && typeof window.game.drawBoard === 'function') {
                setTimeout(() => {
                    window.game.drawBoard();
                }, 50);
            }
        }
        });

    // ai_move 이벤트 핸들러 (완전한 버전 - move_made와 유사하지만 AI 전용)
    // 주의: 650번 줄에 이미 간단한 버전이 있지만, 여기서는 더 완전한 처리
    // 중복 방지를 위해 기존 핸들러는 제거하고 여기서 처리하거나, 여기서는 제거
    // 일단 주석 처리하고, 필요한 경우 나중에 활성화
    /*
    socket.on('ai_move', (data) => {
        if (!window.game || !data.move) return;
        
        // Handle captured stones
        const capturedStones = data.capturedStones || [];
        window.game.makeMove(data.move, capturedStones);
        
        // Update captured stones count
        if (data.capturedBlack !== undefined || data.capturedWhite !== undefined) {
            const gameData = {
                game: data.game || data.gameState?.game || {},
                finalCaptureTarget: data.finalCaptureTarget || data.gameState?.finalCaptureTarget || window.gameState?.finalCaptureTarget,
                blackCaptureTarget: data.blackCaptureTarget || data.gameState?.blackCaptureTarget || window.gameState?.blackCaptureTarget,
                whiteCaptureTarget: data.whiteCaptureTarget || data.gameState?.whiteCaptureTarget || window.gameState?.whiteCaptureTarget
            };
            if (data.capturedBlack !== undefined) {
                updateCapturedCount('blackCaptured', data.capturedBlack, gameData);
            }
            if (data.capturedWhite !== undefined) {
                updateCapturedCount('whiteCaptured', data.capturedWhite, gameData);
            }
        }
        
        // 모바일 착수 버튼 초기화
        if (typeof resetPendingMove === 'function') {
            resetPendingMove();
        }
        
        // 타이머 업데이트
        if (data.timers) {
            updateByoyomiDisplay('black', data.timers.blackByoyomiPeriods, data.timers.blackInByoyomi, data.timers.blackByoyomiTime);
            updateByoyomiDisplay('white', data.timers.whiteByoyomiPeriods, data.timers.whiteInByoyomi, data.timers.whiteByoyomiTime);
        }
        
        // AI 이동 후 내 턴인지 업데이트
        const nextColor = data.currentColor || (data.move.color === 'black' ? 'white' : 'black');
        let isMyTurn = false;
        if (data.game && currentUser) {
            isMyTurn = (nextColor === 'black' && data.game.blackId === currentUser.id) ||
                       (nextColor === 'white' && data.game.whiteId === currentUser.id);
        }
        
        window.game.isMyTurn = isMyTurn;
        window.game.currentColor = nextColor;
        
        // AI 통과 확인
        if (data.move.isPass) {
            updateGameNotice('AI가 통과했습니다.');
        }
        
        updateTurnIndicator(data.move.moveNumber || window.game.moveNumber, nextColor);
        });
    */



    // 따내기바둑 입찰 업데이트
    socket.on('capture_bid_update', (data) => {
        // 타이머 재시작
        if (typeof startBidTimer === 'function') {
            startBidTimer();
        }
        hideCaptureBidModal();
        // 게임 시작 모달 표시 또는 바로 게임 시작
        if (window.gameState) {
            // window.gameState 업데이트
            window.gameState.captureBidding = data;
        }
        biddingState = data;
        const bidStatusInfo = document.getElementById('bidStatusInfo');
        if (bidStatusInfo) {
            bidStatusInfo.textContent = '입찰이 완료되었습니다. 게임을 시작합니다.';
        }
        
        // window.gameState 업데이트 (입찰 정보 저장)
        setTimeout(() => {
            socket.emit('get_game_state');
        }, 500);
        });
    
    // 입찰 완료 이벤트
    socket.on('capture_bid_completed', (data) => {
        // window.gameState 업데이트
        if (window.gameState) {
            window.gameState.finalCaptureTarget = data.finalCaptureTarget;
            window.gameState.captureBidding = null;
        }
        // 게임 상태 업데이트 후 게임 시작
        socket.emit('get_game_state');
        });
    
    // 입찰 에러 이벤트
    socket.on('capture_bid_error', (data) => {
        const errorMessage = data.error || '입찰 오류가 발생했습니다.';
        if (typeof updateGameNotice === 'function') {
            updateGameNotice(errorMessage);
        }
        });

    // 따내기바둑 입찰 모달 표시 (새로운 모달 사용)
    // 기존 함수는 위에서 이미 정의됨 (showCaptureBidModal)

    // 따내기바둑 입찰 모달 생성
    function createCaptureBidModal() {
        const modal = document.createElement('div');
        modal.id = 'captureBidModal';
        modal.className = 'stats-modal';
        modal.style.display = 'none';
        modal.innerHTML = `
                <div class="stats-modal-header">
                    <div class="stats-modal-title" id="captureBidTitle">흑선 가져오기</div>
                    <button class="close-modal" onclick="document.getElementById('captureBidModal').style.display='none'">&times;</button>
                </div>
                    <div id="captureBidContent">
                            흑(선수)을 잡기 위해 추가로 몇 개의 돌을 더 따낼지 설정하세요. 
                            더 높은 숫자를 제시하는 쪽이 흑이 됩니다.
                        </p>
                            </div>
                                    <span id="baseTargetDisplay">20</span> + <span id="bidDisplay">1</span>개
                                </div>
                            </div>
                        </div>
                            <button class="btn btn-secondary" onclick="adjustBid(10)">+10</button>
                            <button class="btn btn-secondary" onclick="adjustBid(5)">+5</button>
                            <button class="btn btn-secondary" onclick="adjustBid(3)">+3</button>
                            <button class="btn btn-secondary" onclick="adjustBid(1)">+1</button>
                            <button class="btn btn-secondary" onclick="adjustBid(-10)">-10</button>
                            <button class="btn btn-secondary" onclick="adjustBid(-5)">-5</button>
                            <button class="btn btn-secondary" onclick="adjustBid(-3)">-3</button>
                            <button class="btn btn-secondary" onclick="adjustBid(-1)">-1</button>
                        </div>
                            설정하기
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        captureBidModal = modal;
    }

    // 입찰 모달 업데이트
    function updateCaptureBidModal(state) {
        if (!captureBidModal) return;
        
        const baseTarget = state.captureTarget || 20;
        const myBid = state.bids && state.bids[currentUser.id];
        const opponentBid = state.bids && Object.keys(state.bids).find(id => id !== currentUser.id && state.bids[id]);
        
        document.getElementById('baseTarget').textContent = baseTarget;
        document.getElementById('baseTargetDisplay').textContent = baseTarget;
        document.getElementById('bidDisplay').textContent = localBid;
        
        const bidStatusEl = document.getElementById('bidStatus');
        if (bidStatusEl) {
            if (myBid && opponentBid) {
                bidStatusEl.textContent = '';
            } else {
                bidStatusEl.style.color = '#ff6b6b';
            }
        }
        
        // 카운트다운 업데이트
        if (state.deadline) {
            updateBidCountdown(state.deadline);
        }
    }

    // 입찰 카운트다운 업데이트
    function updateBidCountdown(deadline) {
        const countdownEl = document.getElementById('bidCountdown');
        if (!countdownEl) return;
        
        const update = () => {
            const now = Date.now();
            const remaining = Math.max(0, deadline - now);
            const seconds = Math.ceil(remaining / 1000);
            
            if (countdownEl) {
                countdownEl.textContent = `${seconds}초`;
            }
            
            if (remaining > 0) {
                setTimeout(update, 1000);
            }
        };
        update();
    }

    // 입찰 조정
    function adjustBid(amount) {
        localBid = Math.max(1, Math.min(50, localBid + amount));
        const bidDisplay = document.getElementById('bidDisplay');
        if (bidDisplay) {
            bidDisplay.textContent = localBid;
        }
    }

    // 입찰 제출
    function submitCaptureBid() {
        if (typeof socket !== 'undefined' && socket) {
            socket.emit('submit_capture_bid', { bid: localBid });
        }
    }

    // 베이스바둑 베이스돌 배치 모달 표시
    function showBasePlacementModal(state) {
        basePlacementState = state;
        if (!basePlacementModal) {
            createBasePlacementModal();
        }
        updateBasePlacementModal(state);
        if (basePlacementModal) {
            basePlacementModal.style.display = 'flex';
        }
    }

    // 베이스바둑 베이스돌 배치 모달 생성
    function createBasePlacementModal() {
        const modal = document.createElement('div');
        modal.id = 'basePlacementModal';
        modal.className = 'stats-modal';
        modal.style.display = 'none';
        modal.innerHTML = `
                <div class="stats-modal-header">
                    <div class="stats-modal-title">베이스돌 배치</div>
                    <button class="close-modal" onclick="document.getElementById('basePlacementModal').style.display='none'">&times;</button>
                </div>
                        상대에게 보이지 않는 베이스돌을 <span id="baseStoneCountDisplay">${(window.gameState && window.gameState.baseStoneCount) ? window.gameState.baseStoneCount : 4}</span>개 배치하세요.
                    </p>
                        배치된 돌: <span id="placedBaseStones">0</span> / <span id="totalBaseStones">${(window.gameState && window.gameState.baseStoneCount) ? window.gameState.baseStoneCount : 4}</span>
                    </p>
                    </div>
                        남은 돌 무작위 배치
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        basePlacementModal = modal;
        
        // 바둑판 클릭으로 베이스돌 배치
        const canvas = document.getElementById('goBoard');
        if (canvas) {
            const handleBasePlacement = (e) => {
                if (!window.game || !basePlacementState) return;
                
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                const boardX = Math.floor(x / window.game.cellSize) - 1;
                const boardY = Math.floor(y / window.game.cellSize) - 1;
                
                if (boardX >= 0 && boardX < window.game.boardSize && 
                    boardY >= 0 && boardY < window.game.boardSize) {
                    if (typeof socket !== 'undefined' && socket) {
                        socket.emit('place_base_stone', { x: boardX, y: boardY });
                    }
                }
            };
            
            canvas.addEventListener('click', handleBasePlacement);
            // 모달이 닫힐 때 이벤트 리스너 제거를 위해 저장
            modal._basePlacementHandler = handleBasePlacement;
        }
    }

    // 베이스돌 배치 모달 업데이트
    function updateBasePlacementModal(state) {
        if (!basePlacementModal) return;
        
        // baseStoneCount는 window.gameState에서 우선 가져오고, 없으면 state에서, 없으면 기본값 4
        const totalCount = (window.gameState?.baseStoneCount !== undefined && window.gameState?.baseStoneCount !== null)
            ? window.gameState.baseStoneCount
            : (state.baseStoneCount || 4);
        const placedCount = (state.baseStones?.black?.length || 0) + (state.baseStones?.white?.length || 0);
        
        const baseStoneCountDisplay = document.getElementById('baseStoneCountDisplay');
        const totalBaseStones = document.getElementById('totalBaseStones');
        const placedBaseStones = document.getElementById('placedBaseStones');
        const randomPlaceBaseBtn = document.getElementById('randomPlaceBaseBtn');
        
        if (baseStoneCountDisplay) baseStoneCountDisplay.textContent = totalCount;
        if (totalBaseStones) totalBaseStones.textContent = totalCount;
        if (placedBaseStones) placedBaseStones.textContent = placedCount;
        
        if (randomPlaceBaseBtn) {
            randomPlaceBaseBtn.disabled = placedCount >= totalCount;
        }
    }

    // 베이스돌 배치 카운트다운
    function updateBasePlacementCountdown(deadline) {
        const countdownEl = document.getElementById('basePlacementCountdown');
        if (!countdownEl) return;
        
        const update = () => {
            const now = Date.now();
            const remaining = Math.max(0, deadline - now);
            const seconds = Math.ceil(remaining / 1000);
            
            if (countdownEl) {
                countdownEl.textContent = `${seconds}초`;
            }
            
            if (remaining > 0) {
                setTimeout(update, 1000);
            }
        };
        update();
        }

    // 남은 베이스돌 무작위 배치
    function placeRandomRemainingBaseStones(basePlacementState) {
        if (!basePlacementState) return;
        
        const placedCount = (basePlacementState.baseStones?.black?.length || 0) + 
                            (basePlacementState.baseStones?.white?.length || 0);
        // baseStoneCount는 window.gameState에서 우선 가져오고, 없으면 basePlacementState에서, 없으면 기본값 4
        const totalCount = (window.gameState?.baseStoneCount !== undefined && window.gameState?.baseStoneCount !== null)
            ? window.gameState.baseStoneCount
            : (basePlacementState.baseStoneCount || 4);
        const remaining = totalCount - placedCount;
        
        if (remaining <= 0) return;
        
        // 빈 위치 찾기
        const allBaseStones = [
            ...(basePlacementState.baseStones?.black || []),
            ...(basePlacementState.baseStones?.white || [])
        ];
        
        const emptyPositions = [];
        const boardSize = window.game?.boardSize || 19;
        
        for (let x = 0; x < boardSize; x++) {
            for (let y = 0; y < boardSize; y++) {
                const isOccupied = allBaseStones.some(stone => stone.x === x && stone.y === y);
                if (!isOccupied) {
                    emptyPositions.push({ x, y });
                }
            }
        }
        
        // 무작위로 남은 개수만큼 배치
        const toPlace = Math.min(remaining, emptyPositions.length);
        for (let i = 0; i < toPlace; i++) {
            const randomIndex = Math.floor(Math.random() * emptyPositions.length);
            const position = emptyPositions.splice(randomIndex, 1)[0];
            // 실제 배치는 서버에서 처리
            if (typeof socket !== 'undefined' && socket) {
                socket.emit('place_base_stone', { x: position.x, y: position.y });
            }
        }
        }

    // 베이스바둑 색상 선택 모달 변수
    let colorSelectionModal = null;
    
    // 베이스바둑 덤 입찰 모달 변수
    let komiBiddingModal = null;
    let komiBiddingState = null;
    let localKomi = 0;
    
    // 베이스바둑 색상 선택 모달 표시
    function showColorSelectionModal(selectionData) {
        console.log('[Client] showColorSelectionModal called with:', selectionData);
        
        // 모달이 없으면 생성
        if (!colorSelectionModal) {
            const existingModal = document.getElementById('colorSelectionModal');
            if (existingModal) {
                colorSelectionModal = existingModal;
            } else {
                createColorSelectionModal();
            }
        }
        
        // 모달이 여전히 없으면 재시도
        if (!colorSelectionModal) {
            const modal = document.getElementById('colorSelectionModal');
            if (modal) {
                colorSelectionModal = modal;
            } else {
                console.error('[Client] colorSelectionModal not found after creation!');
                return;
            }
        }
        
        // 다른 모달 숨기기
        if (gameStartModal) {
            gameStartModal.style.display = 'none';
            gameStartModal.classList.remove('show');
        }
        
        // 색상 선택 모달 표시
        colorSelectionModal.style.display = 'flex';
        colorSelectionModal.style.visibility = 'visible';
        colorSelectionModal.style.opacity = '1';
        colorSelectionModal.style.zIndex = '10000';
        colorSelectionModal.classList.add('show');
        
        // 모달 상태 업데이트
        updateColorSelectionModal(selectionData);
        
        // 타이머 시작
        const deadline = selectionData.colorSelectionDeadline || (Date.now() + 30000);
        startColorSelectionTimer(deadline);
        
        console.log('[Client] Color selection modal displayed');
    }
    
    // 색상 선택 모달 업데이트
    function updateColorSelectionModal(selectionData) {
        if (!colorSelectionModal) return;
        
        // 선택 상태 표시
        const colorSelections = selectionData.colorSelections || {};
        const mySelection = colorSelections[currentUser.id];
        const opponentSelection = Object.values(colorSelections).find(sel => sel.userId !== currentUser.id);
        
        const statusInfo = document.getElementById('colorSelectionStatusInfo');
        if (statusInfo) {
            if (mySelection) {
                statusInfo.textContent = `선택 완료: ${mySelection.color === 'black' ? '흑' : '백'}. 상대방을 기다리는 중...`;
            } else {
                statusInfo.textContent = '상대방의 선택을 기다리는 중...';
            }
        }
    }

    // 색상 선택 모달 생성
    function createColorSelectionModal() {
        const modal = document.createElement('div');
        modal.id = 'colorSelectionModal';
        modal.className = 'game-start-modal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="game-start-modal-content">
                <div class="game-start-modal-header">
                    <div class="game-start-modal-title">흑/백 선택</div>
                    <div class="game-start-modal-subtitle">배치된 베이스돌을 보고 흑 또는 백을 선택하세요</div>
                </div>
                        바둑판에 배치된 베이스돌의 모양을 보고 흑 또는 백을 선택하세요.
                    </p>
                        <strong>💎 베이스돌 안내:</strong> 베이스돌은 각각 5점의 가치를 가집니다. 베이스돌을 따내면 5점을 획득하고, 계가 시 사석으로 남아있으면 5점으로 계산됩니다.
                    </div>
                            흑으로 대국하기
                        </button>
                            백으로 대국하기
                        </button>
                    </div>
                        </div>
                    </div>
                        상대방의 선택을 기다리는 중...
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        colorSelectionModal = modal;
        console.log('[Client] Color selection modal created');
    }

    // 색상 선택 타이머
    let colorSelectionTimerInterval = null;
    function startColorSelectionTimer(deadline) {
        if (colorSelectionTimerInterval) {
            clearInterval(colorSelectionTimerInterval);
        }
        
        const updateTimer = () => {
            const now = Date.now();
            const remaining = Math.max(0, deadline - now);
            const seconds = Math.ceil(remaining / 1000);
            
            const timerEl = document.getElementById('colorSelectionTimer');
            if (timerEl) {
                timerEl.textContent = `${seconds}초`;
            }
            
            if (remaining <= 0) {
                if (colorSelectionTimerInterval) {
                    clearInterval(colorSelectionTimerInterval);
                }
            }
        };
        
        updateTimer();
        colorSelectionTimerInterval = setInterval(updateTimer, 100);
    }

    // 색상 선택 제출
    function submitColorSelection(color) {
        // 버튼 비활성화
        const blackBtn = document.getElementById('selectBlackColorBtn');
        const whiteBtn = document.getElementById('selectWhiteColorBtn');
        if (blackBtn) blackBtn.disabled = true;
        if (whiteBtn) whiteBtn.disabled = true;
        
        // 상태 업데이트
        const statusInfo = document.getElementById('colorSelectionStatusInfo');
        if (statusInfo) {
            statusInfo.textContent = '선택이 제출되었습니다. 상대방을 기다리는 중...';
        }
        
        if (typeof socket !== 'undefined' && socket) {
            socket.emit('submit_color_selection', { color });
        }
    }

    // 베이스바둑 덤 입찰 모달 표시
    function showKomiBiddingModal(state) {
        console.log('[Client] showKomiBiddingModal called with:', state);
        
        komiBiddingState = state;
        localKomi = 0;
        
        // 모달이 없으면 생성
        if (!komiBiddingModal) {
            const existingModal = document.getElementById('komiBiddingModal');
            if (existingModal) {
                komiBiddingModal = existingModal;
            } else {
                createKomiBiddingModal();
            }
        }
        
        // 모달이 여전히 없으면 재시도
        if (!komiBiddingModal) {
            const modal = document.getElementById('komiBiddingModal');
            if (modal) {
                komiBiddingModal = modal;
            } else {
                console.error('[Client] komiBiddingModal not found after creation!');
                return;
            }
        }
        
        // 다른 모달 숨기기
        if (gameStartModal) {
            gameStartModal.style.display = 'none';
            gameStartModal.classList.remove('show');
        }
        if (colorSelectionModal) {
            colorSelectionModal.style.display = 'none';
            colorSelectionModal.classList.remove('show');
        }
        
        // 덤 입찰 모달 업데이트 및 표시
        updateKomiBiddingModal(state);
        komiBiddingModal.style.display = 'flex';
        komiBiddingModal.style.visibility = 'visible';
        komiBiddingModal.style.opacity = '1';
        komiBiddingModal.style.zIndex = '10000';
        komiBiddingModal.classList.add('show');
        
        console.log('[Client] Komi bidding modal displayed');
    }

    // 덤 입찰 모달 생성
    function createKomiBiddingModal() {
        const modal = document.createElement('div');
        modal.id = 'komiBiddingModal';
        modal.className = 'stats-modal';
        modal.style.display = 'none';
        modal.innerHTML = `
                <div class="stats-modal-header">
                    <div class="stats-modal-title" id="komiBidTitle">흑백 및 덤 입찰</div>
                    <button class="close-modal" onclick="document.getElementById('komiBiddingModal').style.display='none'">&times;</button>
                </div>
                        같은 색상을 선택하셨습니다. 해당 색상으로 대국하기 위해 덤을 입찰하세요 (0~50집).
                    </p>
                        <strong>💎 베이스돌 안내:</strong> 베이스돌은 각각 5점의 가치를 가집니다. 베이스돌을 따내면 5점을 획득하고, 계가 시 사석으로 남아있으면 5점으로 계산됩니다.
                    </div>
                        </div>
                            <button class="btn btn-secondary" onclick="adjustKomi(10)">+10</button>
                            <button class="btn btn-secondary" onclick="adjustKomi(5)">+5</button>
                            <button class="btn btn-secondary" onclick="adjustKomi(1)">+1</button>
                            <button class="btn btn-secondary" onclick="adjustKomi(-1)">-1</button>
                            <button class="btn btn-secondary" onclick="adjustKomi(-5)">-5</button>
                            <button class="btn btn-secondary" onclick="adjustKomi(-10)">-10</button>
                            <button class="btn btn-secondary" onclick="adjustKomi(0)">0</button>
                            <button class="btn btn-secondary" onclick="adjustKomi(50)">MAX</button>
                        </div>
                    </div>
                        </div>
                    </div>
                        입찰하기
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        komiBiddingModal = modal;
    }

    // 덤 입찰 모달 업데이트
    function updateKomiBiddingModal(state) {
        if (!komiBiddingModal) return;
        
        const myBid = state.komiBids && state.komiBids[currentUser.id];
        const deadline = state.komiBiddingDeadline || (Date.now() + 30000);
        
        // 타이머 시작
        startKomiBidTimer(deadline);
        
        // 슬라이더 설정
        const komiSlider = document.getElementById('komiSlider');
        if (komiSlider) {
            komiSlider.value = localKomi;
        }
        
        const bidStatusEl = document.getElementById('komiBidStatus');
        if (bidStatusEl) {
            bidStatusEl.textContent = '';
        }
    }

    // 덤 입찰 타이머
    let komiBidTimerInterval = null;
    function startKomiBidTimer(deadline) {
        if (komiBidTimerInterval) {
            clearInterval(komiBidTimerInterval);
        }
        
        const updateTimer = () => {
            const now = Date.now();
            const remaining = Math.max(0, deadline - now);
            const seconds = Math.ceil(remaining / 1000);
            
            const timerEl = document.getElementById('komiBidTimer');
            if (timerEl) {
                timerEl.textContent = `${seconds}초`;
            }
            
            if (remaining <= 0) {
                if (komiBidTimerInterval) {
                    clearInterval(komiBidTimerInterval);
                }
            }
        };
        
        updateTimer();
        komiBidTimerInterval = setInterval(updateTimer, 100);
    }

    // 덤 조정
    function adjustKomi(amount) {
        localKomi = Math.max(0, Math.min(50, localKomi + amount));
        const komiSlider = document.getElementById('komiSlider');
        if (komiSlider) {
            komiSlider.value = localKomi;
        }
        const komiDisplay = document.getElementById('komiDisplay');
        if (komiDisplay) {
            komiDisplay.textContent = localKomi;
        }
    }

    // 덤 입찰 제출
    function submitKomiBid() {
        if (typeof socket !== 'undefined' && socket) {
            socket.emit('submit_komi_bid', { komi: localKomi });
        }
    }
    
    // 베이스바둑 AI 게임용 모달 변수는 파일 상단으로 이동됨 (TDZ 문제 방지)
    // 함수는 파일 상단에 선언됨 (호이스팅)
    
    // 베이스바둑 AI 게임 전역 함수들
    window.selectBaseColor = function(color) {
        selectedBaseColor = color;
        updateBaseColorSelectionModal();
    };
    
    window.confirmBaseColorSelection = function() {
        if (!baseColorSelectionModal) return;
        
        // 색상 선택 모달 닫기
        baseColorSelectionModal.style.display = 'none';
        baseColorSelectionModal.classList.remove('show');
        
        // 덤 설정 모달 표시
        showBaseKomiSelectionModal();
    };
    
    window.adjustBaseKomi = function(amount) {
        selectedBaseKomi = Math.max(0, Math.min(50, selectedBaseKomi + amount));
        updateBaseKomiSelectionModal();
    };
    
    window.confirmBaseSelection = function() {
        if (!baseKomiSelectionModal) return;
        
        // 덤 설정 모달 닫기
        baseKomiSelectionModal.style.display = 'none';
        baseKomiSelectionModal.classList.remove('show');
        
        // 서버에 색상 및 덤 전송
        if (typeof socket !== 'undefined' && socket) {
            console.log('[Client] Sending base game settings:', {
                color: selectedBaseColor,
                komi: 0.5 + selectedBaseKomi
            });
            socket.emit('set_base_game_settings', {
                color: selectedBaseColor,
                komi: 0.5 + selectedBaseKomi // 기본 0.5집 + 추가 덤
            });
        }
    };

    // 베이스돌 배치 업데이트


    // 덤 입찰 업데이트
    socket.on('komi_bidding_update', (data) => {
        // 서버에서 자동으로 상태를 보내므로 요청하지 않음
        if (typeof updateKomiBiddingModal === 'function') {
            updateKomiBiddingModal(data);
        }
        });
    
    // 덤 입찰 완료
    socket.on('komi_bidding_complete', (data) => {
        // 플레이어 패널 내용 업데이트 (설정 완료 후)
        if (data.game) {
            const hasBlackId = data.game.blackId && data.game.blackId !== '';
            const hasWhiteId = data.game.whiteId && data.game.whiteId !== '';
            const hasFinalKomi = data.finalKomi !== undefined && data.finalKomi !== null;
            
            if (hasBlackId && hasWhiteId && hasFinalKomi) {
                // game_state 이벤트를 기다려서 플레이어 정보 업데이트
                console.log('[Client] Player panel will be updated after komi_bidding_complete');
            }
        }
        
        if (komiBiddingModal) {
            komiBiddingModal.style.display = 'none';
        }
        // 게임 상태 업데이트
        if (window.gameState) {
            window.gameState.finalKomi = data.finalKomi;
        }
        });
    
    // 돌가리기 이벤트
    socket.on('stone_picking', (data) => {
        if (typeof showStonePickingModal === 'function') {
            showStonePickingModal(data);
        }
        });
    
    // 미니게임 이벤트
    socket.on('minigame', (data) => {
        if (typeof showMinigameModal === 'function') {
            showMinigameModal(data);
        }
        });
    
    // 베이스바둑 색상 선택 이벤트
    socket.on('base_color_selection', (data) => {
        if (typeof showColorSelectionModal === 'function') {
            showColorSelectionModal(data);
        }
        });
    
    // 베이스바둑 AI 게임 설정 완료
    socket.on('base_game_settings_set', (data) => {
        console.log('[Client] base_game_settings_set received:', data);
        
        // gameReady 상태를 game.startedAt을 단일 소스로 사용하여 업데이트
        const isGameReady = data.game && data.game.startedAt !== null;
        
        // window.gameState 업데이트
        if (window.gameState) {
            window.gameState.gameReady = isGameReady;
            if (data.game) {
                window.gameState.game = window.gameState.game || {};
                window.gameState.game.startedAt = data.game.startedAt;
                window.gameState.game.id = data.game.id;
            }
            if (data.color) {
                // 색상 정보 업데이트 (서버에서 받은 색상 사용)
                const selectedColor = data.color;
                if (selectedColor === 'black') {
                    window.gameState.game.blackId = currentUser.id;
                    window.gameState.game.whiteId = '';
                } else {
                    window.gameState.game.blackId = '';
                    window.gameState.game.whiteId = currentUser.id;
                }
                // window.game 객체도 업데이트
                if (window.game) {
                    // 현재 사용자의 색상 확인
                    const isUserBlack = currentUser.id === window.gameState.game.blackId;
                    window.game.isMyTurn = isUserBlack; // 흑이 먼저 시작하므로
                }
            }
            if (data.komi !== undefined) {
                window.gameState.finalKomi = data.komi;
            }
            // currentColor 설정 (항상 흑부터 시작)
            window.gameState.currentColor = 'black';
        }
        
        // timer와 gameReady 동기화
        if (window.timer) {
            window.timer.gameReady = isGameReady;
        }
        gameReady = isGameReady;
        
        // 베이스 돌 유지 (설정 완료 후에도 베이스 돌이 보이도록)
        if (window.game && window.game.baseStones) {
            window.game.drawBoard();
        }
        
        // 모달 닫기
        if (baseColorSelectionModal) {
            baseColorSelectionModal.style.display = 'none';
            baseColorSelectionModal.classList.remove('show');
        }
        if (baseKomiSelectionModal) {
            baseKomiSelectionModal.style.display = 'none';
            baseKomiSelectionModal.classList.remove('show');
        }
        
        // 게임 상태 즉시 요청 (gameReady 업데이트 후 즉시)
        if (typeof socket !== 'undefined' && socket) {
            socket.emit('get_game_state');
        }
        
        // 게임 보드 업데이트를 위해 잠시 후 다시 그리기
        setTimeout(() => {
            if (window.game) {
                window.game.drawBoard();
            }
        }, 200);
    });
    
    // 타이머 업데이트 이벤트
    socket.on('timer_update', (data) => {
        if (!window.timer) return;
        
        window.timer.updateTimers(data);
        
        // currentColor와 isMyTurn 동기화 (timer.currentTurn을 단일 소스로 사용)
        if (data.currentTurn !== undefined) {
            if (window.game) {
                window.game.currentColor = data.currentTurn;
            }
            if (window.gameState) {
                window.gameState.currentColor = data.currentTurn;
            }
            
            // isMyTurn 업데이트
            if (window.game && window.gameState && window.gameState.game) {
                const game = window.gameState.game;
                if (game.isAiGame) {
                    const aiColor = game.aiColor || 'white';
                    if (data.currentTurn === 'black' && aiColor !== 'black' && game.blackId === currentUser.id) {
                        window.game.isMyTurn = true;
                    } else if (data.currentTurn === 'white' && aiColor !== 'white' && game.whiteId === currentUser.id) {
                        window.game.isMyTurn = true;
                    } else {
                        window.game.isMyTurn = false;
                    }
                } else {
                    window.game.isMyTurn = (data.currentTurn === 'black' && game.blackId === currentUser.id) ||
                                           (data.currentTurn === 'white' && game.whiteId === currentUser.id);
                }
            }
        }
        
        // 게임 상태에서 초읽기 설정값 가져오기 (window.gameState 우선, 없으면 data, 없으면 timer에서, 없으면 기본값)
        const byoyomiSeconds = (window.gameState && window.gameState.byoyomiSeconds !== undefined && window.gameState.byoyomiSeconds !== null)
            ? window.gameState.byoyomiSeconds
            : ((data.byoyomiSeconds !== undefined && data.byoyomiSeconds !== null)
                ? data.byoyomiSeconds
                : ((window.timer && window.timer.byoyomiSeconds !== undefined && window.timer.byoyomiSeconds !== null)
                    ? window.timer.byoyomiSeconds
                    : 30));
        // timeLimit은 window.gameState에서 가져오거나 data에서 가져오거나 기본값 30분
        const timeLimit = (window.gameState && window.gameState.timeLimit) || data.timeLimit || 30;
        const totalTime = timeLimit * 60;
        
        // initialTotalTime이 없으면 설정 (게임 시작 시 한 번만)
        if (typeof initialTotalTime === 'undefined' || initialTotalTime === null) {
            initialTotalTime = totalTime;
        }
        // window.initialTotalTime도 설정 (updateTimerBar에서 사용)
        if (typeof window !== 'undefined' && (!window.initialTotalTime || window.initialTotalTime === 0)) {
            window.initialTotalTime = totalTime;
        }
        
        // 제한시간이 0분이거나 모두 소진된 경우 초읽기 모드로 처리
        const isTimeLimitZero = totalTime === 0;
        const blackInByoyomi = data.blackInByoyomi || isTimeLimitZero || ((data.blackTime || 0) <= 0 && totalTime > 0);
        const whiteInByoyomi = data.whiteInByoyomi || isTimeLimitZero || ((data.whiteTime || 0) <= 0 && totalTime > 0);
        
        // 타이머 바 업데이트는 timer.js의 updateDisplay에서 처리하므로 여기서는 서버 동기화만 수행
        // timer.js가 100ms마다 업데이트하므로 여기서는 중복 호출하지 않음
        // 단, 서버에서 받은 값으로 window.timer를 업데이트하여 다음 updateDisplay에서 사용되도록 함
        
        // 초읽기 정보 업데이트
        if (typeof updateByoyomiDisplay === 'function') {
            updateByoyomiDisplay('black', data.blackByoyomiPeriods, data.blackInByoyomi, data.blackByoyomiTime);
            updateByoyomiDisplay('white', data.whiteByoyomiPeriods, data.whiteInByoyomi, data.whiteByoyomiTime);
        }
        
        // 초읽기 정보 업데이트
        if (typeof updateByoyomiDisplay === 'function') {
            updateByoyomiDisplay('black', data.blackByoyomiPeriods, data.blackInByoyomi, data.blackByoyomiTime);
            updateByoyomiDisplay('white', data.whiteByoyomiPeriods, data.whiteInByoyomi, data.whiteByoyomiTime);
        }
        });


    // 게임 정보 저장 (재대국 신청용)
    let currentGameInfo = null;

    // 게임 종료 이벤트
    socket.on('game_ended', (data) => {
        console.log('[Client] ========== game_ended event received ==========');
        console.log('[Client] game_ended data:', {
            result: data.result,
            hasRewards: !!data.rewards,
            hasGame: !!data.game,
            reason: data.reason,
            fullData: data
        });
        
        gameEnded = true;
        
        // 계가중 오버레이 숨기기
        if (typeof hideScoringOverlay === 'function') {
            hideScoringOverlay();
        }
        
        // 계가 진행 중 모달 제거 (로컬 환경에서 표시된 데모 모달)
        const existingScoringModal = document.getElementById('gameResultModal');
        if (existingScoringModal) {
            // 계가 진행 중 모달인지 확인 (제목에 "계가 진행 중"이 포함된 경우)
            const modalTitle = existingScoringModal.querySelector('.result-title');
            if (modalTitle && (modalTitle.textContent.includes('계가 진행 중') || modalTitle.textContent.includes('데모'))) {
                console.log('[Client] Removing existing scoring modal');
                existingScoringModal.remove();
            }
        }
        
        // Extract current user rewards
        const isBlack = currentUser.id === window.game?.blackId;
        
        // Get current ratings for display
        if (data.blackRating !== undefined && data.whiteRating !== undefined) {
            // 레이팅 정보 업데이트
            const blackRatingEl = document.getElementById('blackRating');
            const whiteRatingEl = document.getElementById('whiteRating');
            if (blackRatingEl && data.blackRating) blackRatingEl.textContent = `레이팅: ${data.blackRating}`;
            if (whiteRatingEl && data.whiteRating) whiteRatingEl.textContent = `레이팅: ${data.whiteRating}`;
        }
        
        // 결과 모달 표시
        console.log('[Client] Calling showResultModal with data:', {
            result: data.result,
            hasRewards: !!data.rewards,
            hasGame: !!data.game,
            reason: data.reason
        });
        
        // showResultModal 함수가 정의되어 있는지 확인
        if (typeof showResultModal === 'function') {
            console.log('[Client] showResultModal function found, calling it...');
            try {
                showResultModal(data);
                console.log('[Client] showResultModal called successfully');
            } catch (error) {
                console.error('[Client] Error in showResultModal:', error);
                console.error('[Client] Error stack:', error.stack);
            }
        } else {
            console.error('[Client] showResultModal function not found!');
            console.error('[Client] Available functions:', Object.keys(window).filter(k => typeof window[k] === 'function' && k.includes('Result')));
        }
        });

    function showResultModal(data) {
        // data.game에서 blackId와 whiteId 가져오기 (window.game은 GoGame 객체이므로 사용하지 않음)
        // 함수 전체에서 사용할 변수이므로 함수 상단에서 한 번만 선언
        const gameBlackId = (data.game && data.game.blackId) || (window.game && window.game.blackId);
        const gameWhiteId = (data.game && data.game.whiteId) || (window.game && window.game.whiteId);
        
        const isWinner = (data.result === 'black_win' && currentUser.id === gameBlackId) || 
                         (data.result === 'white_win' && currentUser.id === gameWhiteId);
        const isDraw = data.result === 'draw';
        
        let resultTitle = '';
        if (isDraw) {
            resultTitle = '무승부';
        } else if (isWinner) {
            resultTitle = '승리';
        } else {
            resultTitle = '패배';
        }

        // 승리/패배 이유 파싱
        let winReasonText = '';
        if (data.reason) {
            const reason = data.reason;
            if (reason === 'resign_black' || reason === 'resign_white') {
                const isBlackResigned = reason === 'resign_black';
                if (isWinner) {
                    // 상대방이 기권하여 내가 승리
                    winReasonText = isBlackResigned ? '상대방(흑)이 기권하여 승리했습니다' : '상대방(백)이 기권하여 승리했습니다';
                } else {
                    // 내가 기권하여 패배
                    winReasonText = '기권하여 패배했습니다';
                }
            } else if (reason === 'time_black' || reason === 'time_white' || reason === 'time_loss_black' || reason === 'time_loss_white') {
                const isBlackTimeOut = reason === 'time_black' || reason === 'time_loss_black';
                if (isWinner) {
                    winReasonText = isBlackTimeOut ? '상대방(흑)의 시간 초과로 승리했습니다' : '상대방(백)의 시간 초과로 승리했습니다';
                } else {
                    winReasonText = '시간 초과로 패배했습니다';
                }
            } else if (reason === 'disconnect_black' || reason === 'disconnect_white') {
                const isBlackDisconnected = reason === 'disconnect_black';
                if (isWinner) {
                    winReasonText = isBlackDisconnected ? '상대방(흑)의 연결 끊김으로 승리했습니다' : '상대방(백)의 연결 끊김으로 승리했습니다';
                } else {
                    winReasonText = isBlackDisconnected ? '연결이 끊겨 패배했습니다' : '연결이 끊겨 패배했습니다';
                }
            } else if (reason === 'capture_target') {
                winReasonText = isWinner ? '목표 따내기 점수를 달성하여 승리했습니다' : '상대방이 목표 따내기 점수를 달성하여 패배했습니다';
            } else if (reason.includes('자동 계가') || reason.includes('제한 턴수')) {
                winReasonText = reason;
            } else {
                winReasonText = reason;
            }
        }

        // 레이팅 변화 표시
        const isRanked = data.game && data.game.matchType === 'RANKED';
        // gameBlackId는 함수 상단에서 이미 선언됨
        const isBlack = currentUser.id === gameBlackId;
        
        let ratingDisplay = '';
        let ratingChange = 0;
        let currentRating = 0;
        let newRating = 0;
        let hasRatingChange = false;
        
        // rewards에서 레이팅 변화 및 골드 획득량 추출
        if (data.rewards) {
            const userRewards = isBlack ? data.rewards.black : data.rewards.white;
            if (userRewards) {
                if (userRewards.ratingChange !== undefined) {
                    ratingChange = userRewards.ratingChange;
                    currentRating = userRewards.previousRating || 0;
                    newRating = userRewards.currentRating || currentRating;
                    hasRatingChange = true;
                }
            }
        }
        
        // 골드 획득량 (rewards에서 가져오거나 직접 전달된 값 사용)
        let goldEarned = 0;
        if (data.rewards) {
            const userRewards = isBlack ? data.rewards.black : data.rewards.white;
            if (userRewards && userRewards.gold !== undefined) {
                goldEarned = userRewards.gold || 0;
            }
        } else if (data.goldEarned !== undefined) {
            goldEarned = data.goldEarned || 0;
        }
        
        // 점수 정보 (game 객체나 score에서 가져오기)
        let capturedBlack = 0;
        let capturedWhite = 0;
        if (data.game && data.game.capturedBlack !== undefined) {
            capturedBlack = data.game.capturedBlack || 0;
        } else if (data.capturedBlack !== undefined) {
            capturedBlack = data.capturedBlack || 0;
        }
        if (data.game && data.game.capturedWhite !== undefined) {
            capturedWhite = data.game.capturedWhite || 0;
        } else if (data.capturedWhite !== undefined) {
            capturedWhite = data.capturedWhite || 0;
        }
        
        // titleClass와 winnerText 설정
        const titleClass = isWinner ? 'win' : (isDraw ? 'draw' : 'lose');
        const winnerText = isDraw ? '무승부' : (isWinner ? '승리했습니다!' : '패배했습니다.');
        
        // 레이팅 변화 표시 (랭크 게임인 경우만)
        if (isRanked && hasRatingChange) {
            const changeText = ratingChange > 0 ? `+${ratingChange}` : `${ratingChange}`;
            ratingDisplay = `${currentRating} → ${newRating} (${changeText})`;
        }

        const modalHtml = `
            <div class="result-modal-content">
                <div class="result-header">
                    <div class="result-title ${titleClass}">${resultTitle}</div>
                    <div class="result-winner">${winnerText}</div>
                    ${winReasonText ? `<div class="result-reason">${winReasonText}</div>` : ''}
                </div>
                <div class="result-body">
                    <div class="result-stats-grid">
                        <div class="result-stat-item">
                            <div class="stat-label">흑 따낸 돌</div>
                            <div class="stat-value">${capturedBlack}개</div>
                        </div>
                        <div class="result-stat-item">
                            <div class="stat-label">백 따낸 돌</div>
                            <div class="stat-value">${capturedWhite}개</div>
                        </div>
                    </div>
                    
                    ${data.score ? `
                        <div class="result-score-section" style="margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px;">
                            <div class="result-score-title" style="font-weight: bold; margin-bottom: 10px; text-align: center;">계가 결과</div>
                            ${data.score.scoreDetails ? `
                                <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                                    <tr style="background-color: #f5f5f5;">
                                        <th style="padding: 5px; text-align: center;">구분</th>
                                        <th style="padding: 5px; text-align: center;">흑</th>
                                        <th style="padding: 5px; text-align: center;">백</th>
                                    </tr>
                                    <tr>
                                        <td style="padding: 5px; text-align: center;">집</td>
                                        <td style="padding: 5px; text-align: center;">${(data.score.scoreDetails.black.territory || 0).toFixed(1)}</td>
                                        <td style="padding: 5px; text-align: center;">${(data.score.scoreDetails.white.territory || 0).toFixed(1)}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 5px; text-align: center;">사석</td>
                                        <td style="padding: 5px; text-align: center;">${data.score.scoreDetails.black.captured || 0}</td>
                                        <td style="padding: 5px; text-align: center;">${data.score.scoreDetails.white.captured || 0}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 5px; text-align: center;">덤</td>
                                        <td style="padding: 5px; text-align: center;">-</td>
                                        <td style="padding: 5px; text-align: center;">${data.score.scoreDetails.white.komi || 0}</td>
                                    </tr>
                                    <tr style="border-top: 1px solid #ddd; font-weight: bold;">
                                        <td style="padding: 5px; text-align: center;">총점</td>
                                        <td style="padding: 5px; text-align: center;">${(data.score.areaScore.black || 0).toFixed(1)}</td>
                                        <td style="padding: 5px; text-align: center;">${(data.score.areaScore.white || 0).toFixed(1)}</td>
                                    </tr>
                                </table>
                            ` : `
                                <div style="display: flex; justify-content: space-around; text-align: center;">
                                    <div>
                                        <div style="font-size: 0.8em; color: #666;">흑 총점</div>
                                        <div style="font-weight: bold;">${(data.score.areaScore.black || 0).toFixed(1)}</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 0.8em; color: #666;">백 총점</div>
                                        <div style="font-weight: bold;">${(data.score.areaScore.white || 0).toFixed(1)}</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 0.8em; color: #666;">차이</div>
                                        <div style="font-weight: bold; color: #d32f2f;">${Math.abs((data.score.areaScore.black || 0) - (data.score.areaScore.white || 0)).toFixed(1)}집</div>
                                    </div>
                                </div>
                            `}
                        </div>
                    ` : ''}

                    ${isRanked && hasRatingChange ? `
                        <div class="rating-change-section">
                            <div class="rating-change-label">레이팅 변화</div>
                            <div class="rating-change-value">${ratingDisplay}</div>
                        </div>
                    ` : ''}
                    ${goldEarned > 0 ? `
                        <div class="reward-section">
                            <div class="reward-label">획득 골드</div>
                            <div class="reward-value">${goldEarned}G</div>
                        </div>
                    ` : ''}
                </div>
                <div class="result-actions">
                    <button class="btn btn-confirm" onclick="closeResultModal()">확인</button>
                </div>
            </div>
        `;

        // 게임 결과 모달 표시
        console.log('[Client] showResultModal: Attempting to show result modal', {
            hasShowGameResultModal: typeof showGameResultModal === 'function',
            modalHtmlLength: modalHtml ? modalHtml.length : 0
        });
        
        if (typeof showGameResultModal === 'function') {
            console.log('[Client] showResultModal: Calling showGameResultModal...');
            try {
                showGameResultModal(modalHtml);
                console.log('[Client] showResultModal: showGameResultModal called successfully');
            } catch (error) {
                console.error('[Client] showResultModal: Error calling showGameResultModal:', error);
                console.error('[Client] showResultModal: Error stack:', error.stack);
                // 대체 방법: 직접 모달 생성
                const existingModal = document.getElementById('gameResultModal');
                if (existingModal) {
                    existingModal.remove();
                }
                const modal = document.createElement('div');
                modal.id = 'gameResultModal';
                modal.className = 'result-modal';
                modal.innerHTML = modalHtml;
                document.body.appendChild(modal);
                modal.style.display = 'flex';
            }
        } else {
            console.error('[Client] showResultModal: showGameResultModal function not found!');
            // 대체 방법: 직접 모달 생성
            const existingModal = document.getElementById('gameResultModal');
            if (existingModal) {
                existingModal.remove();
            }
            const modal = document.createElement('div');
            modal.id = 'gameResultModal';
            modal.className = 'result-modal';
            modal.innerHTML = modalHtml;
            document.body.appendChild(modal);
            modal.style.display = 'flex';
            console.log('[Client] showResultModal: Modal created directly, display:', modal.style.display);
        }
        
        // 게임 종료 후 버튼 패널 업데이트
        if (typeof updateButtonPanelAfterGameEnd === 'function') {
            updateButtonPanelAfterGameEnd(data);
        }
        }
    
    function closeResultModal() {
        const modal = document.getElementById('gameResultModal');
        if (modal) {
            modal.remove();
        }
        }

    // 게임 종료 후 버튼 패널 업데이트
    function updateButtonPanelAfterGameEnd(data) {
        const buttonPanel = document.querySelector('.button-panel');
        if (!buttonPanel) return;

        // 기존 버튼들 숨기기
        const passBtn = document.getElementById('passBtn');
        const resignBtn = document.getElementById('resignBtn');
        const specialButtons = document.getElementById('specialButtons');
        if (passBtn) passBtn.style.display = 'none';
        if (resignBtn) resignBtn.style.display = 'none';
        if (specialButtons) specialButtons.style.display = 'none';

        // 게임 종료 후 버튼들 생성
        const endGameButtons = document.getElementById('endGameButtons');

        const endButtonsContainer = document.createElement('div');
        endButtonsContainer.id = 'endGameButtons';
        endButtonsContainer.className = 'end-game-buttons';

        // 재대국 신청 버튼
        const rematchBtn = document.createElement('button');
        rematchBtn.className = 'game-btn btn-rematch';
        rematchBtn.textContent = '재대국 신청';
        rematchBtn.id = 'rematchBtn';
        rematchBtn.addEventListener('click', () => {
            if (typeof sendRematchRequest === 'function') {
                sendRematchRequest();
            }
        });

        // 결과 보기 버튼
        const viewResultBtn = document.createElement('button');
        viewResultBtn.className = 'game-btn btn-view-result';
        viewResultBtn.textContent = '결과 보기';
        viewResultBtn.id = 'viewResultBtn';
        viewResultBtn.addEventListener('click', () => {
            // 결과 모달이 이미 표시되어 있으므로 추가 처리 불필요
        });

        // 나가기 버튼
        const leaveGameBtn = document.createElement('button');
        leaveGameBtn.className = 'game-btn btn-leave-game';
        leaveGameBtn.textContent = '나가기';
        leaveGameBtn.id = 'leaveGameBtn';

        endButtonsContainer.appendChild(rematchBtn);
        endButtonsContainer.appendChild(viewResultBtn);
        endButtonsContainer.appendChild(leaveGameBtn);

        const buttonGroupContainer = buttonPanel.querySelector('.button-group-container');
        if (buttonGroupContainer) {
            if (endGameButtons) {
                endGameButtons.remove();
            }
            buttonGroupContainer.appendChild(endButtonsContainer);
        }
        }

    // 재대국 신청 함수
    function sendRematchRequest() {
        if (!currentGameInfo) {
            currentGameInfo = {
                gameId: gameId,
                mode: window.gameState?.game?.mode || 'CLASSIC',
                boardSize: window.gameState?.boardSize || 19,
                timeLimit: window.gameState?.timeLimit || 30
            };
        }
        
        // 게임 정보를 localStorage에 저장하고 대기실로 이동
        const rematchData = {
            opponentId: opponentId,
            gameInfo: currentGameInfo
        };
        
        localStorage.setItem('rematchRequest', JSON.stringify(rematchData));
        window.location.href = '/waiting-room';
        }

    // 상대방이 나갔을 때 재대국 신청 버튼 비활성화
    socket.on('player_left', (data) => {
        const rematchBtn = document.getElementById('rematchBtn');
        if (rematchBtn) {
            rematchBtn.disabled = true;
            rematchBtn.textContent = '상대방이 나갔습니다';
        }
        });

    // 재연결 플래그
    let reconnectFlag = false;
    
    // 재연결 시 자동 복구
    socket.on('reconnect', () => {
        reconnectFlag = true;
        if (gameId) {
            socket.emit('join_game', gameId);
            socket.emit('get_game_state');
        } else {
            console.error('[Client] Cannot reconnect: gameId is null or undefined');
        }
        });
    
    // 상대방이 게임 룸을 떠났을 때
    socket.on('opponent_left', (data) => {
        if (typeof updateGameNotice === 'function') {
            updateGameNotice('상대방이 게임을 떠났습니다.');
        }
        });

    // 게임 결과 모달 표시 함수
    function showGameResultModal(html) {
        console.log('[Client] showGameResultModal called with html length:', html ? html.length : 0);
        
        // 기존 모달이 있으면 제거
        const existingModal = document.getElementById('gameResultModal');
        if (existingModal) {
            console.log('[Client] Removing existing result modal');
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'gameResultModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            display: flex !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            z-index: 10000 !important;
            justify-content: center !important;
            align-items: center !important;
            background-color: rgba(0, 0, 0, 0.5) !important;
            pointer-events: auto !important;
            visibility: visible !important;
            opacity: 1 !important;
        `;
        // 배경 blur 제거하고 투명도 낮춤 (바둑판이 보이도록)
        
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        modalContent.style.cssText = `
            position: relative !important;
            z-index: 10001 !important;
            pointer-events: auto !important;
        `;
        modalContent.innerHTML = html;
        
        // 드래그 기능 추가
        let isDragging = false;
        let currentX = 0;
        let currentY = 0;
        let initialX = 0;
        let initialY = 0;
        let xOffset = 0;
        let yOffset = 0;
        
        const resultModalContent = modalContent.querySelector('.result-modal-content');
        if (resultModalContent) {
            const dragStart = (e) => {
                if (e.target.closest('.btn')) return; // 버튼 클릭 시 드래그 방지
                
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;
                
                if (e.target === resultModalContent || resultModalContent.contains(e.target)) {
                    isDragging = true;
                }
            };
            
            const drag = (e) => {
                if (!isDragging) return;
                
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                
                xOffset = currentX;
                yOffset = currentY;
                
                setTranslate(currentX, currentY, resultModalContent);
            };
            
            const dragEnd = () => {
                initialX = currentX;
                initialY = currentY;
                isDragging = false;
            };
            
            const setTranslate = (xPos, yPos, el) => {
                el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
            };
            
            // 이벤트 리스너 추가
            resultModalContent.addEventListener('mousedown', dragStart);
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', dragEnd);
            resultModalContent.addEventListener('touchstart', dragStart);
            document.addEventListener('touchmove', drag);
            document.addEventListener('touchend', dragEnd);
        }
        
        modal.appendChild(modalContent);
        
        // 애니메이션 스타일 추가
        const style = document.createElement('style');
        style.textContent = `
            .result-modal-content {
                transition: transform 0.1s ease-out;
            }
        `;
        document.head.appendChild(style);
        
        // 배경 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
        document.body.appendChild(modal);
        console.log('[Client] ========== Result modal appended to body ==========');
        console.log('[Client] Modal element:', modal);
        console.log('[Client] Modal display style:', modal.style.display);
        console.log('[Client] Modal computed style:', window.getComputedStyle(modal).display);
        console.log('[Client] Modal z-index:', window.getComputedStyle(modal).zIndex);
        console.log('[Client] Modal visibility:', window.getComputedStyle(modal).visibility);
        console.log('[Client] Modal opacity:', window.getComputedStyle(modal).opacity);
        console.log('[Client] Modal position:', window.getComputedStyle(modal).position);
        console.log('[Client] ModalContent element:', modalContent);
        console.log('[Client] ModalContent display:', window.getComputedStyle(modalContent).display);
        console.log('[Client] ResultModalContent element:', resultModalContent);
        if (resultModalContent) {
            console.log('[Client] ResultModalContent display:', window.getComputedStyle(resultModalContent).display);
        }
        
        // 모달이 실제로 보이는지 확인
        setTimeout(() => {
            const checkModal = document.getElementById('gameResultModal');
            if (checkModal) {
                const rect = checkModal.getBoundingClientRect();
                console.log('[Client] Modal bounding rect:', rect);
                console.log('[Client] Modal is visible:', rect.width > 0 && rect.height > 0);
            } else {
                console.error('[Client] Modal not found in DOM after append!');
            }
        }, 100);
        }

    // 계가 시작 이벤트
    socket.on('scoring_started', (data) => {
        console.log('[Client] scoring_started event received:', data);
        // 계가중 오버레이 표시
        showScoringOverlay();
        
        // 로컬 환경 확인 (localhost 또는 127.0.0.1)
        const isLocal = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' ||
                       window.location.hostname === '';
        
        if (isLocal) {
            // 로컬 환경: 데모버전 계가 모달
            console.log('[Client] Local environment detected, showing demo scoring modal');
            const scoringHtml = `
                <div class="result-modal-content">
                    <div class="result-header">
                        <div class="result-title">계가 진행 중 (데모)</div>
                    </div>
                    <div class="result-body">
                        <p>계가가 진행되고 있습니다...</p>
                        <p style="margin-top: 10px; font-size: 0.9em; color: #666;">로컬 환경에서는 데모버전 계가가 진행됩니다.</p>
                        <p style="margin-top: 10px; font-size: 0.9em; color: #666;">잠시 후 결과가 표시됩니다.</p>
                    </div>
                </div>
            `;
            if (typeof showGameResultModal === 'function') {
                showGameResultModal(scoringHtml);
            } else {
                console.warn('[Client] showGameResultModal function not found');
            }
        } else {
            // 배포 환경: 카타고 계가 진행 (모달은 표시하지 않음, 오버레이만 표시)
            console.log('[Client] Production environment, Katago scoring in progress');
        }
        });
    
    // 돌가리기 업데이트 이벤트
    socket.on('stone_picking_update', (data) => {
        if (typeof updateStonePickingModal === 'function') {
            updateStonePickingModal(data);
        }
        });
    
    // 돌가리기 완료 이벤트
    socket.on('stone_picking_completed', (data) => {
        const resultMessage = data.result ? '돌가리기가 완료되었습니다.' : '돌가리기 중 오류가 발생했습니다.';
        if (typeof updateGameNotice === 'function') {
            updateGameNotice(resultMessage);
        }
        
        // 게임 상태 새로고침
        socket.emit('get_game_state');
        });
    
    // 돌가리기 오류 이벤트
    socket.on('stone_picking_error', (data) => {
        const errorMessage = data.error || '돌가리기 중 오류가 발생했습니다.';
        if (typeof updateGameNotice === 'function') {
            updateGameNotice(errorMessage);
        }
        });

    // 미사일바둑 관련 변수
    let missileMode = false;
    let selectedMissileStone = null;
    let isMissileMode = false;

    // 미사일바둑 모드 토글은 메인 game_state 핸들러에서 처리됨

    // 미사일바둑 컨트롤 표시 함수 제거됨 - 하단 버튼 패널에서 처리

    // 미사일 이동 업데이트
    socket.on('missile_move', (data) => {
        if (!window.game || !data.move) return;
        
        // 애니메이션이 필요한 경우 (path가 있고 길이가 1보다 큰 경우)
        if (data.path && data.path.length > 1) {
            const animateMissile = () => {
                // 미사일 애니메이션 로직 (간단한 구현)
                let currentIndex = 0;
                const animateStep = () => {
                    if (currentIndex < data.path.length - 1) {
                        // 바둑판에 미사일 이동 표시
                        if (window.game && window.game.drawBoard) {
                            window.game.drawBoard();
                        }
                        currentIndex++;
                        setTimeout(animateStep, 100);
                    } else {
                        // 애니메이션 완료 이벤트 전송
                        if (typeof socket !== 'undefined' && socket) {
                            socket.emit('missile_animation_complete');
                        }
                    }
                };
                animateStep();
            };
            
            // 애니메이션 시작
            animateMissile();
        } else {
            // 애니메이션 없이 바로 완료
            if (typeof socket !== 'undefined' && socket) {
                socket.emit('missile_animation_complete');
            }
        }
        });
    
    // 미사일 아이템 종료 이벤트
    socket.on('missile_item_ended', (data) => {
        isMissileMode = false;
        const missileBtn = document.getElementById('missileBtn');
        if (missileBtn) {
            missileBtn.disabled = false;
        }
        // 버튼 카운트 업데이트
        if (typeof updateButtonCounts === 'function') {
            updateButtonCounts(window.gameState);
        }
        });

    // 미사일 아이템 시작 이벤트
    socket.on('missile_item_started', (data) => {
        isMissileMode = true;
        if (typeof updateGameNotice === 'function') {
            updateGameNotice('미사일 모드가 활성화되었습니다.');
        }
        });

    // 히든 아이템 시작 이벤트
    socket.on('hidden_item_started', (data) => {
        hiddenItemActive = true;
        hiddenItemDeadline = data.deadline || (Date.now() + 30000);
        if (typeof startHiddenItemTimer === 'function') {
            startHiddenItemTimer(hiddenItemDeadline);
        }
        updateHiddenButton();
        });

    // 히든 돌 배치 이벤트
    socket.on('hidden_stone_placed', (data) => {
        if (window.game && window.game.loadState) {
            window.game.loadState({ hiddenStones: data.hiddenStones });
        }
        updateHiddenButton();
        });

    // 스캔 결과 이벤트
    socket.on('scan_result', (data) => {
        if (window.game && window.game.loadState && data.scannedStones) {
            window.game.loadState({ scannedStones: data.scannedStones });
        }
        updateScanButton();
        });

    // 믹스바둑: 모드 전환 알림
    socket.on('mix_mode_switched', (data) => {
        const modeNames = {
            'CLASSIC': '일반',
            'CAPTURE': '따내기',
            'SPEED': '스피드',
            'BASE': '베이스',
            'HIDDEN': '히든',
            'MISSILE': '미사일'
        };
        const modeName = modeNames[data.currentMixMode] || data.currentMixMode;
        const moveNumber = data.moveNumber || 0;
        
        // 모드 전환 알림 표시
        if (typeof updateGameNotice === 'function') {
            updateGameNotice(`${moveNumber}수에서 ${modeName} 모드로 전환되었습니다.`);
        }
        // 현재 모드 정보 업데이트
        window.currentMixMode = data.currentMixMode;
        
        // 버튼 업데이트 (믹스바둑 모드 전환 시)
        if (typeof updateSpecialButtons === 'function') {
            updateSpecialButtons('MIX', window.gameState);
        }
        
        // 3초 후 일반 차례 메시지로 복원
        setTimeout(() => {
            if (typeof updateGameNotice === 'function') {
                const nextColor = data.currentColor || 'black';
                updateGameNotice(`${nextColor === 'black' ? '흑' : '백'} 차례입니다.`);
            }
        }, 3000);
        });

    // 채팅 기능
    let activeChatTab = 'game';
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    
    // 탭별 메시지 저장
    const gameChatMessages = [];
    const globalChatMessages = [];

    function addChatMessage(username, message, isSystem = false, tab = null) {
        if (!chatMessages) return;
        
        // 탭이 지정되지 않으면 현재 활성 탭 사용
        const targetTab = tab || activeChatTab;
        
        const messageData = {
            username,
            message,
            isSystem,
            timestamp: Date.now()
        };
        
        // 탭별로 메시지 저장
        if (targetTab === 'game') {
            gameChatMessages.push(messageData);
        } else {
            globalChatMessages.push(messageData);
        }
        
        // 현재 활성 탭이면 화면에 표시
        if (targetTab === activeChatTab) {
            displayMessage(messageData);
        }
        }
    
    function displayMessage(messageData) {
        if (!chatMessages) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = messageData.isSystem ? 'chat-message chat-message-system' : 'chat-message';
        
        if (messageData.isSystem) {
            messageDiv.textContent = messageData.message;
        } else {
            messageDiv.innerHTML = `<span class="chat-username">${escapeHtml(messageData.username)}:</span> <span class="chat-text">${escapeHtml(messageData.message)}</span>`;
        }
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    
    function switchChatTab(tabName) {
        if (activeChatTab === tabName) return;
        
        activeChatTab = tabName;
        
        // 탭 UI 업데이트
        const chatTabs = document.querySelectorAll('.chat-tab');
        chatTabs.forEach(tab => {
            if (tab.getAttribute('data-tab') === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
        
        // 메시지 영역 초기화
        if (chatMessages) {
            chatMessages.innerHTML = '';
        }
        
        // 선택된 탭의 메시지 표시
        const messagesToShow = tabName === 'game' ? gameChatMessages : globalChatMessages;
        messagesToShow.forEach(msg => {
            displayMessage(msg);
        });
        
        // 플레이스홀더 업데이트
        if (chatInput) {
            chatInput.placeholder = tabName === 'game' ? '메시지 입력...' : '전체 채팅 메시지 입력...';
        }
        }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
        }

    // 채팅 도배 방지 변수
    let lastChatTime = 0;
    let lastChatMessage = '';
    let chatCooldownInterval = null;
    const CHAT_COOLDOWN = 3000; // 3초

    // 채팅 쿨타임 카운트다운
    function startChatCooldown() {
        const countdownEl = document.getElementById('chatCountdown');
        if (!countdownEl) return;

        let remaining = 3;
        countdownEl.textContent = remaining;
        countdownEl.style.display = 'block';
        
        if (chatCooldownInterval) {
            clearInterval(chatCooldownInterval);
        }
        
        chatCooldownInterval = setInterval(() => {
            remaining--;
            if (countdownEl) {
                countdownEl.textContent = remaining;
            }
            
            if (remaining <= 0) {
                clearInterval(chatCooldownInterval);
                chatCooldownInterval = null;
                if (countdownEl) {
                    countdownEl.style.display = 'none';
                }
            }
        }, 1000);
        }

    function sendChatMessage() {
        if (!chatInput) return;
        
        const message = chatInput.value.trim();
        if (!message) return;

        const currentTime = Date.now();
        
        // 쿨타임 체크
        if (currentTime - lastChatTime < CHAT_COOLDOWN) {
            return;
        }
        
        // 같은 말 2회 연속 방지
        if (message === lastChatMessage) {
            return;
        }
        
        // 서버에 메시지 전송 (활성 탭에 따라 다른 이벤트 전송)
        if (typeof socket !== 'undefined' && socket) {
            if (activeChatTab === 'game') {
                socket.emit('game_chat', { message: message });
            } else {
                socket.emit('chat_message', {
                    message: message,
                    timestamp: currentTime
                });
            }
        }
        
        // 마지막 전송 시간과 메시지 저장
        lastChatTime = currentTime;
        lastChatMessage = message;
        
        chatInput.value = '';
        
        // 쿨타임 시작
        startChatCooldown();
        }

    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', sendChatMessage);
        }
    
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });
        }

    // 대국실 채팅 메시지 수신
    socket.on('game_chat', (data) => {
        if (typeof addChatMessage === 'function' && data.message) {
            const username = data.nickname || data.user || 'Unknown';
            addChatMessage(username, data.message, false, 'game');
        }
        });

    // 전체채팅 메시지 수신 (대기실과 동일)
    socket.on('chat_message', (data) => {
        if (typeof addChatMessage === 'function' && data.message) {
            const username = data.user || data.nickname || 'Unknown';
            const isSystem = data.isSystem || false;
            addChatMessage(username, data.message, isSystem, 'global');
        }
        });
    
    // 채팅 탭 전환 이벤트
    const chatTabs = document.querySelectorAll('.chat-tab');
    chatTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            if (tabName) {
                switchChatTab(tabName);
            }
        });
    });

    // 이모지 버튼 클릭 핸들러
    const emojiBtn = document.getElementById('emojiBtn');
    const emojiPopup = document.getElementById('emojiPopup');

    if (emojiBtn && emojiPopup) {
        // 팝업 위치 업데이트 함수
        function updatePopupPosition() {
            const rect = emojiBtn.getBoundingClientRect();
            emojiPopup.style.left = `${rect.left}px`;
            emojiPopup.style.top = `${rect.bottom + 5}px`;
            
            // 화면 오른쪽으로 넘어가지 않도록 조정
            const popupRect = emojiPopup.getBoundingClientRect();
            if (popupRect.right > window.innerWidth) {
                emojiPopup.style.left = `${window.innerWidth - popupRect.width - 10}px`;
            }
            
            // 화면 왼쪽으로 넘어가지 않도록 조정
            if (popupRect.left < 0) {
                emojiPopup.style.left = '10px';
            }
        }
        
        emojiBtn.addEventListener('click', () => {
            if (emojiPopup.style.display === 'flex') {
                emojiPopup.style.display = 'none';
            } else {
                emojiPopup.style.display = 'flex';
                updatePopupPosition();
            }
        });

        // 창 크기 변경 시 위치 업데이트
        let popupResizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(popupResizeTimeout);
            popupResizeTimeout = setTimeout(() => {
                if (emojiPopup.style.display === 'flex') {
                    updatePopupPosition();
                }
            }, 100);
        });

        // 스크롤 시 위치 업데이트
        let popupScrollTimeout;
        window.addEventListener('scroll', () => {
            clearTimeout(popupScrollTimeout);
            popupScrollTimeout = setTimeout(() => {
                if (emojiPopup.style.display === 'flex') {
                    updatePopupPosition();
                }
            }, 100);
        }, true);

        // 팝업 외부 클릭 시 닫기
        document.addEventListener('click', (e) => {
            if (!emojiPopup.contains(e.target) && e.target !== emojiBtn && emojiPopup.style.display === 'flex') {
                emojiPopup.style.display = 'none';
            }
        });

        // 탭 전환
        const emojiTabs = document.querySelectorAll('.emoji-tab');
        emojiTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                emojiTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                const emojiSection = document.getElementById('emojiSection');
                const quickSection = document.getElementById('quickSection');
                if (tabName === 'emoji') {
                    if (emojiSection) emojiSection.classList.add('active');
                    if (quickSection) quickSection.classList.remove('active');
                } else {
                    if (emojiSection) emojiSection.classList.remove('active');
                    if (quickSection) quickSection.classList.add('active');
                }
            });
        });

        // 이모지 클릭 (이벤트 위임 사용)
        emojiPopup.addEventListener('click', (e) => {
            // 퀵 메시지 클릭
            const quickBtn = e.target.closest('.quick-message-btn');
            if (quickBtn) {
                const message = quickBtn.dataset.message;
                if (message && chatInput) {
                    chatInput.value = message;
                    sendChatMessage();
                    emojiPopup.style.display = 'none';
                }
                return;
            }
            
            // 이모지 클릭
            const emojiItem = e.target.closest('.emoji-item');
            if (emojiItem) {
                const emoji = emojiItem.textContent;
                if (emoji && chatInput) {
                    chatInput.value += emoji;
                    chatInput.focus();
                }
            }
        });
        }

    // Button handlers
    
    // 통과 확인 모달 표시 함수
    function showPassConfirmModal() {
        // 기존 모달이 있으면 제거
        const existingModal = document.getElementById('passConfirmModal');

        const modal = document.createElement('div');
        modal.id = 'passConfirmModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>통과 확인</h2>
                    <button class="close-modal" onclick="this.closest('.modal-overlay').remove()">×</button>
                </div>
                <div class="modal-body">
                    <p>정말 통과하시겠습니까?</p>
                    <div class="modal-buttons">
                        <button id="confirmPassBtn" class="btn btn-primary">확인</button>
                        <button id="cancelPassBtn" class="btn btn-secondary">취소</button>
                    </div>
                </div>
            </div>
        `;
        
        // 배경 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
        // 확인 버튼 클릭
        const confirmPassBtn = modal.querySelector('#confirmPassBtn');
        if (confirmPassBtn) {
            confirmPassBtn.addEventListener('click', () => {
                if (typeof socket !== 'undefined' && socket) {
                    socket.emit('make_move', { move: { isPass: true } });
                }
                modal.remove();
            });
        }
        
        // 취소 버튼 클릭
        const cancelPassBtn = modal.querySelector('#cancelPassBtn');
        if (cancelPassBtn) {
            cancelPassBtn.addEventListener('click', () => {
                modal.remove();
            });
        }
        
        document.body.appendChild(modal);
    }

    // 매너액션 시스템 (게임 중에도 사용 가능)
    let mannerActionCount = 0;
    const MAX_MANNER_ACTIONS = 10;
    function updateMannerActions() {
        const mannerActions = document.getElementById('mannerActions');
        if (!mannerActions) return;
        
        // 남은 사용 횟수 업데이트
        const remainingEl = document.getElementById('mannerActionsRemaining');
        if (remainingEl) {
            const remaining = MAX_MANNER_ACTIONS - mannerActionCount;
            remainingEl.textContent = `남은 횟수: ${remaining}`;
        }
        
        // 사용 횟수 제한에 따라 버튼 비활성화
        const allMannerBtns = document.querySelectorAll('.manner-btn');
        allMannerBtns.forEach(btn => {
            if (mannerActionCount >= MAX_MANNER_ACTIONS) {
                btn.disabled = true;
                btn.style.opacity = '0.5';
            } else {
                btn.disabled = false;
                btn.style.opacity = '1';
                // 쿨타임 확인
                const action = btn.dataset.action;
                if (mannerActionCooldown && mannerActionCooldown[action] && Date.now() < mannerActionCooldown[action]) {
                    btn.disabled = true;
                    btn.style.opacity = '0.5';
                }
            }
        });
    }
    
    // 매너 액션 버튼 이벤트 리스너 (중복 방지)
    let mannerButtonsInitialized = false;
    let mannerActionCooldown = {}; // 액션별 쿨타임 저장
    let opponentId = null; // 상대방 ID
    
    function setupMannerActionButtons() {
        // opponentId가 아직 설정되지 않았으면 나중에 다시 시도
        if (opponentId === null || opponentId === undefined) {
            // opponentId는 game_state 이벤트에서 설정됨
            return;
        }
        
        // 이미 초기화되었으면 스킵
        if (mannerButtonsInitialized) return;
        
        const mannerBtns = document.querySelectorAll('.manner-btn[data-action]');
        const actionMessages = {
            'good_move': '좋은 수입니다!',
            'bad_move': '아쉽네요',
            'thinking': '생각 중이에요',
            'hurry': '서두르세요',
            'thanks': '감사합니다'
        };
        
        mannerBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                const delta = parseInt(btn.dataset.delta) || 0;
                
                // 쿨타임 확인 (30초)
                if (mannerActionCooldown[action] && Date.now() < mannerActionCooldown[action]) {
                    return;
                }
                
                // 매너 액션 전송
                if (typeof socket !== 'undefined' && socket && opponentId) {
                    socket.emit('manner_action', {
                        targetUserId: opponentId,
                        action: action,
                        delta: delta
                    });
                }
                
                // 사용 횟수 증가
                mannerActionCount++;
                
                // 쿨타임 설정 (30초)
                mannerActionCooldown[action] = Date.now() + 30000;
                
                // UI 업데이트
                updateMannerActions();
                
                // 액션별 메시지 (채팅창에 텍스트로 표시)
                const message = actionMessages[action] || '매너 액션을 사용했습니다.';
                if (typeof updateGameNotice === 'function') {
                    updateGameNotice(message);
                }
                // 채팅창에 매너액션 텍스트 표시
                if (typeof addChatMessage === 'function') {
                    addChatMessage(currentUser.nickname, message);
                }
            });
        });
        
        mannerButtonsInitialized = true;
    }
    
    // 매너 액션 버튼 초기화 (게임 상태 로드 후)
    // game_state 이벤트에서도 호출됨
    function initializeMannerActions() {
        if (window.gameState && window.gameState.game) {
            const game = window.gameState.game;
            // 상대방 ID 설정
            if (currentUser && currentUser.id) {
                opponentId = game.blackId === currentUser.id ? game.whiteId : game.blackId;
            } else if (config.game) {
                // currentUser가 없으면 config에서 가져오기 시도
                const currentUserId = currentUser.id || config.currentUser?.id || '';
                if (currentUserId) {
                    opponentId = config.game.blackId === currentUserId ? config.game.whiteId : config.game.blackId;
                }
            }
        }
        // opponentId가 설정된 후에만 setupMannerActionButtons 호출
        if (opponentId) {
            setupMannerActionButtons();
        }
        if (typeof updateMannerActions === 'function') {
            updateMannerActions();
        }
    }
    
    // 초기 설정 (gameState가 있을 때만)
    if (window.gameState && window.gameState.game) {
        initializeMannerActions();
    }

    // 매너점수 업데이트 수신
    socket.on('manner_score_updated', (data) => {
        if (data.userId && data.mannerScore !== undefined) {
            // 매너 점수 업데이트 처리
            const userId = data.userId;
            if (window.gameState && window.gameState.players) {
                const player = window.gameState.players.find(p => p.id === userId);
                if (player) {
                    player.mannerScore = data.mannerScore;
                }
            }
        }
    });

    // 나가기 버튼 설정
    function setupLeaveButton() {
        const leaveBtn = document.getElementById('leaveBtn');
        if (leaveBtn) {
            // 기존 이벤트 리스너 제거 후 새로 추가
            const newLeaveBtn = leaveBtn.cloneNode(true);
            leaveBtn.parentNode.replaceChild(newLeaveBtn, leaveBtn);
            
            newLeaveBtn.addEventListener('click', () => {
                if (confirm('정말 게임을 나가시겠습니까?')) {
                    if (typeof socket !== 'undefined' && socket) {
                        socket.emit('leave_game');
                    }
                    window.location.href = '/waiting-room';
                }
            });
            console.log('[Client] Leave button event listener added');
        }
    }
    setupLeaveButton();

    // 나가기 버튼 (게임 종료 후)
    function updateLeaveButton() {
        const leaveGameBtn = document.getElementById('leaveGameBtn');
        if (leaveGameBtn) {
            leaveGameBtn.addEventListener('click', () => {
                if (confirm('정말 게임을 나가시겠습니까?')) {
                    if (typeof socket !== 'undefined' && socket) {
                        socket.emit('leave_game');
                    }
                    window.location.href = '/waiting-room';
                }
            });
        }
    }
    updateLeaveButton();

    // 일시정지 버튼
    function setupPauseButton() {
        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => {
                if (!isPaused) {
                    isPaused = true;
                    pauseBtn.textContent = '재개';
                    if (typeof socket !== 'undefined' && socket) {
                        socket.emit('pause_game');
                    }
                } else {
                    isPaused = false;
                    pauseBtn.textContent = '일시정지';
                    if (typeof socket !== 'undefined' && socket) {
                        socket.emit('resume_game');
                    }
                }
            });
        }
    }
    setupPauseButton();



    // 설정 버튼 클릭 이벤트

    // 시간 포맷팅 함수 (밀리초를 MM:SS 형식으로)
    function formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // 기권 버튼 설정
    function setupResignButton() {
        const resignBtn = document.getElementById('resignBtn');
        if (resignBtn) {
            // 기존 이벤트 리스너 제거 후 새로 추가
            const newResignBtn = resignBtn.cloneNode(true);
            resignBtn.parentNode.replaceChild(newResignBtn, resignBtn);
            
            newResignBtn.addEventListener('click', () => {
                if (confirm('정말 기권하시겠습니까?')) {
                    if (typeof socket !== 'undefined' && socket) {
                        socket.emit('resign');
                        console.log('[Client] Resign event emitted');
                    }
                }
            });
            console.log('[Client] Resign button event listener added');
        }
    }
    setupResignButton();

    // 통과 버튼 설정
    function setupPassButton() {
        const passBtn = document.getElementById('passBtn');
        if (passBtn) {
            // 기존 이벤트 리스너 제거 후 새로 추가
            const newPassBtn = passBtn.cloneNode(true);
            passBtn.parentNode.replaceChild(newPassBtn, passBtn);
            
            newPassBtn.addEventListener('click', () => {
                if (typeof showPassConfirmModal === 'function') {
                    showPassConfirmModal();
                } else {
                    // showPassConfirmModal이 없으면 직접 확인
                    if (confirm('정말 통과하시겠습니까?')) {
                        if (typeof socket !== 'undefined' && socket) {
                            socket.emit('make_move', { move: { isPass: true } });
                            console.log('[Client] Pass move emitted');
                        }
                    }
                }
            });
            console.log('[Client] Pass button event listener added');
        }
    }
    setupPassButton();

    // 초기 설정
    updateSpecialButtons('standard'); // 기본 모드로 시작, 게임 상태 받으면 업데이트
    setupLeaveButton();
    setupResignButton();
    setupPassButton();

    // Request initial game state (한 번만, 연결 후 즉시)
    // 자동 호출 제거 - 서버에서 join_game 시 자동으로 보내도록 변경 필요
}
})();

// 베이스바둑 AI 게임 전역 함수들은 이벤트 리스너로 처리하므로 제거됨