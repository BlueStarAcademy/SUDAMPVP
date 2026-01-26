// Go Game Logic
class GoGame {
    constructor(canvasId, socket, currentUser, gameId, initialBoardSize = 19) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error('Canvas not found:', canvasId);
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        this.socket = socket;
        this.currentUser = currentUser;
        this.gameId = gameId;

        this.boardSize = initialBoardSize || 19;
        this.stones = Array(this.boardSize).fill(null).map(() => Array(this.boardSize).fill(null));
        this.currentColor = 'black';
        this.moveNumber = 0;
        this.moves = [];
        this.capturedBlack = 0;
        this.capturedWhite = 0;
        this.isMyTurn = false;
        this.cellSize = 0;
        this.hoverX = null;
        this.hoverY = null;
        this.hoverPixelX = null;
        this.hoverPixelY = null;
        this.lastMoveX = null;
        this.lastMoveY = null;
        this.lastCapturedStones = []; // 마지막 수에서 딴 돌들 (패 규칙 체크용)
        this.isMovePending = false; // 요청 중 플래그 (연속 클릭 방지)
        this.isScoring = false; // 계가 진행 중 플래그
        this.baseStones = null; // 베이스바둑 베이스돌
        this.baseImageCache = null; // 베이스돌 이미지 캐시

        this.init();
    }
    
    updateCellSize() {
        if (!this.canvas) {
            console.warn('[GoGame] updateCellSize: canvas not found');
            return;
        }
        
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            console.warn('[GoGame] updateCellSize: canvas has zero size');
            return;
        }
        
        const size = Math.min(rect.width, rect.height);
        this.cellSize = size / (this.boardSize + 1);
        
        const dpr = window.devicePixelRatio || 1;
        const pixelSize = size * dpr;
        
        if (this.canvas.width !== pixelSize || this.canvas.height !== pixelSize) {
            this.canvas.width = pixelSize;
            this.canvas.height = pixelSize;
            if (this.ctx) {
                this.ctx.scale(dpr, dpr);
            }
        }
    }

    init() {
        console.log('[GoGame] init() called, canvas:', this.canvas, 'canvas exists:', !!this.canvas);
        // 약간의 지연 후 초기화 (DOM이 완전히 로드되도록)
        setTimeout(() => {
            console.log('[GoGame] Initializing after delay, canvas:', this.canvas, 'cellSize:', this.cellSize);
            this.updateCellSize();
            if (this.cellSize > 0) {
                this.drawBoard();
                console.log('[GoGame] Board drawn, cellSize:', this.cellSize);
            } else {
                // cellSize가 0이면 재시도
                console.warn('[GoGame] cellSize is 0, retrying...');
                setTimeout(() => {
                    this.updateCellSize();
                    this.drawBoard();
                    console.log('[GoGame] Retry: cellSize:', this.cellSize);
                }, 100);
            }
            console.log('[GoGame] Setting up event listeners...');
            this.setupEventListeners();
            console.log('[GoGame] Event listeners setup complete');
        }, 50);
        
        window.addEventListener('resize', () => {
            setTimeout(() => {
                this.updateCellSize();
                this.drawBoard();
            }, 100);
        });
    }
    
    getBoardPosition(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;
        
        if (!this.cellSize || this.cellSize === 0) {
            this.updateCellSize();
        }
        
        const boardX = Math.round((x / this.cellSize) - 1);
        const boardY = Math.round((y / this.cellSize) - 1);
        
        return { boardX, boardY };
    }

    setupEventListeners() {
        if (!this.canvas) {
            console.error('[GoGame] Cannot setup event listeners: canvas is null');
            return;
        }
        console.log('[GoGame] setupEventListeners() called, canvas:', this.canvas, 'canvas ID:', this.canvas.id);
        
        // 클릭 이벤트 - 바둑돌 놓기
        this.canvas.addEventListener('click', (e) => {
            console.log('[GoGame] Canvas click event fired:', {
                isMyTurn: this.isMyTurn,
                isMovePending: this.isMovePending,
                currentColor: this.currentColor,
                boardSize: this.boardSize,
                gameReady: window.gameState?.game?.startedAt !== null,
                gameMode: window.gameState?.game?.mode,
                clientX: e.clientX,
                clientY: e.clientY
            });
            
            // 요청 중이면 즉시 무시 (가장 먼저 체크)
            if (this.isMovePending) {
                console.log('[GoGame] Move already pending, ignoring click');
                return;
            }
            
            console.log('[GoGame] Canvas clicked:', {
                isMyTurn: this.isMyTurn,
                isMovePending: this.isMovePending,
                currentColor: this.currentColor,
                boardSize: this.boardSize,
                clientX: e.clientX,
                clientY: e.clientY
            });
            
            const { boardX, boardY } = this.getBoardPosition(e.clientX, e.clientY);
            console.log('[GoGame] Board position:', { boardX, boardY, boardSize: this.boardSize });
            
            // 히든바둑: 히든 아이템 사용 모드
            if (window.hiddenItemActive && this.isMyTurn) {
                if (this.isValidMove(boardX, boardY)) {
                    this.isMovePending = true;
                    this.isMyTurn = false;
                    this.socket.emit('place_hidden_stone', { x: boardX, y: boardY });
                }
                return;
            }
            
            // 히든바둑: 스캔 아이템 사용 모드
            if (window.scanMode && window.scanItemActive) {
                if (this.stones[boardY]?.[boardX] === null) {
                    this.socket.emit('scan_hidden_stones', { x: boardX, y: boardY });
                }
                return;
            }
            
            // 미사일바둑: 미사일 아이템 사용 모드
            if (window.missileItemActive && this.isMyTurn) {
                const playerColor = this.currentColor;
                const stoneColor = this.stones[boardY]?.[boardX];
                
                // 돌 선택 단계
                if (!window.missileMode) {
                    if (stoneColor === playerColor) {
                        window.selectedMissileStone = { x: boardX, y: boardY };
                        window.missileMode = true;
                        // 방향 선택 UI 표시
                        this.showMissileDirectionSelector(boardX, boardY);
                    }
                    return;
                }
                
                // 방향 선택 단계 (이미 선택된 돌이 있는 경우)
                if (window.selectedMissileStone) {
                    const fromX = window.selectedMissileStone.x;
                    const fromY = window.selectedMissileStone.y;
                    const direction = this.getMissileDirection(fromX, fromY, boardX, boardY);
                    
                    if (direction) {
                        this.socket.emit('move_missile', { fromX, fromY, direction });
                        window.missileMode = false;
                        window.selectedMissileStone = null;
                        this.hideMissileDirectionSelector();
                    }
                }
                return;
            }
            
            // 차례 확인
            if (!this.isMyTurn) {
                console.log('[GoGame] Not my turn, skipping move');
                return;
            }
            
            // 게임 준비 상태 확인 (gameReady는 game.startedAt을 기준으로 확인)
            const gameMode = window.gameState && window.gameState.game && window.gameState.game.mode;
            const isGameReady = window.gameState && window.gameState.game && window.gameState.game.startedAt !== null;
            
            // 베이스바둑: 게임 준비가 완료되지 않았으면 수순 금지
            if (gameMode === 'BASE' && !isGameReady) {
                if (!window.baseBadukWarningShown) {
                    showAlertModal('베이스바둑: 색상 선택 및 덤 설정을 완료해주세요.', '안내', 'warning');
                    window.baseBadukWarningShown = true;
                    setTimeout(() => {
                        window.baseBadukWarningShown = false;
                    }, 5000);
                }
                return;
            }
            
            // 클래식 모드: 게임 준비가 완료되지 않았으면 수순 금지 (서버 측 체크와 동기화)
            if (gameMode === 'CLASSIC' && !isGameReady) {
                console.log('[GoGame] Classic mode game not ready, waiting for both players to be ready');
                return;
            }
            
            // 게임이 종료되었는지 확인 (경쟁 조건 방지)
            const isGameEnded = typeof gameEnded !== 'undefined' ? gameEnded : 
                               (window.gameState && window.gameState.game && window.gameState.game.endedAt !== null);
            if (isGameEnded) {
                console.log('[GoGame] Game already ended, ignoring move attempt');
                return;
            }
            
            // 게임 준비 상태 확인 (디버깅)
            console.log('[GoGame] Move attempt check:', {
                boardX,
                boardY,
                isMyTurn: this.isMyTurn,
                isGameReady,
                gameMode,
                currentColor: this.currentColor,
                startedAt: window.gameState?.game?.startedAt,
                isValidMove: this.isValidMove(boardX, boardY),
                isGameEnded
            });
            
            if (this.isValidMove(boardX, boardY)) {
                console.log('[GoGame] Valid move, emitting make_move:', {
                    x: boardX,
                    y: boardY,
                    color: this.currentColor,
                    gameMode,
                    isGameReady
                });
                // 요청 중 플래그를 즉시 설정 (socket.emit 전에)
                this.isMovePending = true;
                this.isMyTurn = false;
                
                // 타임아웃 보호: 일정 시간 내 응답이 없으면 자동 복구
                const moveTimeout = setTimeout(() => {
                    if (this.isMovePending) {
                        console.warn('[GoGame] Move timeout: No response from server, resetting isMovePending');
                        this.isMovePending = false;
                        // game_state 이벤트에서 isMyTurn이 복구될 수 있으므로 여기서는 복구하지 않음
                    }
                }, 5000); // 5초 타임아웃
                
                // move_made나 move_error 이벤트가 오면 타임아웃 취소
                const clearTimeoutOnResponse = () => {
                    clearTimeout(moveTimeout);
                    this.socket.off('move_made', clearTimeoutOnResponse);
                    this.socket.off('move_error', clearTimeoutOnResponse);
                };
                this.socket.once('move_made', clearTimeoutOnResponse);
                this.socket.once('move_error', clearTimeoutOnResponse);
                
                // 약간의 지연을 두고 요청 전송 (동기적으로 플래그 설정)
                this.socket.emit('make_move', {
                    move: { x: boardX, y: boardY, color: this.currentColor }
                });
            } else {
                // 패 규칙 위반인 경우
                if (this.isKo && this.isKo(boardX, boardY)) {
                    console.log('[GoGame] Ko rule violation detected at client side');
                    // 전광판에 에러 메시지 표시
                    if (typeof window !== 'undefined' && window.updateGameNotice && typeof window.updateGameNotice === 'function') {
                        window.updateGameNotice('패 모양입니다. 연속으로 다시 따낼 수 없습니다.');
                    } else if (typeof updateGameNotice === 'function') {
                        updateGameNotice('패 모양입니다. 연속으로 다시 따낼 수 없습니다.');
                    } else {
                        // updateGameNotice 함수가 없으면 직접 호출 시도
                        const noticeBoard = document.getElementById('gameNoticeBoard');
                        if (noticeBoard) {
                            noticeBoard.textContent = '패 모양입니다. 연속으로 다시 따낼 수 없습니다.';
                        }
                    }
                    // 차례 유지 (이미 클라이언트에서 차례 유지 상태이므로 별도 처리 불필요)
                    return;
                }
                
                // 자살자리 위반인 경우
                if (this.hasLiberties && !this.hasLiberties(boardX, boardY, this.currentColor)) {
                    console.log('[GoGame] Suicide move detected at client side');
                    // 전광판에 에러 메시지 표시
                    if (typeof window !== 'undefined' && window.updateGameNotice && typeof window.updateGameNotice === 'function') {
                        window.updateGameNotice('착수 금지 자리입니다');
                    } else if (typeof updateGameNotice === 'function') {
                        updateGameNotice('착수 금지 자리입니다');
                    } else {
                        // updateGameNotice 함수가 없으면 직접 호출 시도
                        const noticeBoard = document.getElementById('gameNoticeBoard');
                        if (noticeBoard) {
                            noticeBoard.textContent = '착수 금지 자리입니다';
                        }
                    }
                    // 차례 유지 (이미 클라이언트에서 차례 유지 상태이므로 별도 처리 불필요)
                    return;
                }
                
                console.log('[GoGame] Invalid move:', {
                    boardX,
                    boardY,
                    boardSize: this.boardSize,
                    stonesAtPos: this.stones[boardY]?.[boardX],
                    isValidMove: this.isValidMove(boardX, boardY),
                    isKo: this.isKo ? this.isKo(boardX, boardY) : false,
                    hasLiberties: this.hasLiberties ? this.hasLiberties(boardX, boardY, this.currentColor) : 'N/A'
                });
            }
        });

        // 마우스 이동 - 호버 효과
        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isMyTurn) {
                this.hoverX = null;
                this.hoverY = null;
                this.hoverPixelX = null;
                this.hoverPixelY = null;
                this.drawBoard();
                return;
            }
            
            // 가장 가까운 교차점 계산
            const { boardX, boardY } = this.getBoardPosition(e.clientX, e.clientY);
            
            if (this.isValidMove(boardX, boardY)) {
                // 교차점 위치 계산 (바둑돌이 놓여지는 곳)
                const intersectionX = (boardX + 1) * this.cellSize;
                const intersectionY = (boardY + 1) * this.cellSize;
                
                // 실제 마우스 픽셀 좌표 계산 (화살표 끝부분)
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = this.canvas.width / rect.width;
                const scaleY = this.canvas.height / rect.height;
                const pixelX = (e.clientX - rect.left) * scaleX;
                const pixelY = (e.clientY - rect.top) * scaleY;
                
                // 교차점과 마우스 사이의 거리 계산
                const dx = pixelX - intersectionX;
                const dy = pixelY - intersectionY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // 교차점에서 반경 이내에 있으면 마우스 위치에 표시 (화살표 끝부분)
                const snapRadius = this.cellSize * 0.6; // 교차점 주변 반경
                
                if (distance <= snapRadius) {
                    // 마우스 커서 위치에 정확히 표시 (화살표 끝부분)
                    if (this.hoverX !== boardX || this.hoverY !== boardY || 
                        Math.abs(this.hoverPixelX - pixelX) > 0.5 || Math.abs(this.hoverPixelY - pixelY) > 0.5) {
                        this.hoverX = boardX;
                        this.hoverY = boardY;
                        this.hoverPixelX = pixelX;
                        this.hoverPixelY = pixelY;
                        this.drawBoard();
                    }
                } else {
                    // 교차점에서 멀리 떨어져 있으면 호버 효과 숨김
                    if (this.hoverX !== null || this.hoverY !== null) {
                        this.hoverX = null;
                        this.hoverY = null;
                        this.hoverPixelX = null;
                        this.hoverPixelY = null;
                        this.drawBoard();
                    }
                }
            } else {
                if (this.hoverX !== null || this.hoverY !== null) {
                    this.hoverX = null;
                    this.hoverY = null;
                    this.hoverPixelX = null;
                    this.hoverPixelY = null;
                    this.drawBoard();
                }
            }
        });

        // 마우스가 캔버스를 벗어날 때
        this.canvas.addEventListener('mouseleave', () => {
            this.hoverX = null;
            this.hoverY = null;
            this.hoverPixelX = null;
            this.hoverPixelY = null;
            this.drawBoard();
        });
    }

    isValidMove(x, y) {
        if (x < 0 || x >= this.boardSize || y < 0 || y >= this.boardSize) return false;
        if (this.stones[y][x] !== null) return false;
        
        // 베이스바둑: 베이스돌 위치에는 돌을 놓을 수 없음
        if (this.baseStones) {
            const allBaseStones = [...(this.baseStones.black || []), ...(this.baseStones.white || [])];
            if (allBaseStones.some(bs => bs.x === x && bs.y === y)) {
                return false;
            }
        }
        
        // 패 규칙 체크: 단순 패 (돌 1개씩 딴 경우 바로 되따내기 금지)
        if (this.isKo(x, y)) {
            return false;
        }
        
        // 자살자리 체크: 돌을 놓은 후 자유도가 없으면 자살자리
        if (!this.hasLiberties(x, y, this.currentColor)) {
            return false;
        }
        
        return true;
    }
    
    /**
     * 패(ko) 규칙 체크 (클라이언트 측)
     * 단순 패: 돌 1개를 무한 반복해서 서로 잡아내는 경우 (금지)
     */
    isKo(x, y) {
        // 마지막 수에서 딴 돌이 정확히 1개인 경우만 체크
        if (!this.lastCapturedStones || this.lastCapturedStones.length !== 1) {
            return false;
        }
        
        // 마지막 수에서 딴 돌의 위치
        const lastCapturedStone = this.lastCapturedStones[0];
        
        // 현재 수가 마지막 수에서 딴 돌의 위치에 두려고 하는지 확인
        if (x === lastCapturedStone.x && y === lastCapturedStone.y) {
            // 단순 패: 돌 1개씩 딴 경우 (1개 vs 1개)는 단순 패로 바로 되따내는 것을 금지
            return true;
        }
        
        return false;
    }
    
    /**
     * 자유도 체크 (클라이언트 측)
     * 돌을 놓은 후 자유도가 있는지 확인
     */
    hasLiberties(x, y, color) {
        // 임시로 보드 상태 복사
        const tempBoard = this.stones.map(row => [...row]);
        
        // 먼저 돌을 임시로 놓음 (패 모양이 처음 생겨났을 때 따낼 수 있도록)
        tempBoard[y][x] = color;
        
        // 돌을 놓은 후 상대 돌을 따낼 수 있는지 확인하고 따냄
        const capturedStones = this.getCapturedStones(tempBoard, x, y, color);
        if (capturedStones.length > 0) {
            capturedStones.forEach(stone => {
                tempBoard[stone.y][stone.x] = null;
            });
        }
        
        // 자유도 체크를 위한 checked 배열
        const checked = Array(this.boardSize).fill(null).map(() => Array(this.boardSize).fill(false));
        
        // 재귀적으로 자유도 확인
        return this.hasLibertiesRecursive(tempBoard, x, y, color, checked, []);
    }
    
    /**
     * 자유도 재귀 체크
     */
    hasLibertiesRecursive(board, x, y, color, checked, group) {
        const boardSize = board.length;
        if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) return false;
        if (checked[y][x]) return false;
        
        checked[y][x] = true;
        group.push({ x, y });
        
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        let hasLib = false;
        
        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize) {
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
    
    /**
     * 따낼 수 있는 돌 확인 (클라이언트 측)
     */
    getCapturedStones(board, x, y, color) {
        const opponentColor = color === 'black' ? 'white' : 'black';
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        const captured = [];
        const checked = Array(this.boardSize).fill(null).map(() => Array(this.boardSize).fill(false));
        
        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < this.boardSize && ny >= 0 && ny < this.boardSize) {
                if (board[ny][nx] === opponentColor && !checked[ny][nx]) {
                    const group = [];
                    const hasLib = this.checkGroupLiberties(board, nx, ny, opponentColor, checked, group);
                    
                    if (!hasLib) {
                        captured.push(...group);
                    }
                }
            }
        }
        
        return captured;
    }
    
    /**
     * 그룹의 자유도 확인
     */
    checkGroupLiberties(board, x, y, color, checked, group) {
        const boardSize = board.length;
        if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) return false;
        if (checked[y][x]) return false;
        if (board[y][x] !== color) return false;
        
        checked[y][x] = true;
        group.push({ x, y });
        
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        let hasLib = false;
        
        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize) {
                if (board[ny][nx] === null) {
                    hasLib = true;
                } else if (board[ny][nx] === color) {
                    if (this.checkGroupLiberties(board, nx, ny, color, checked, group)) {
                        hasLib = true;
                    }
                }
            }
        }
        
        return hasLib;
    }

    makeMove(move, capturedStones = []) {
        // 요청 중 플래그 리셋 (서버 응답 받음)
        this.isMovePending = false;
        
        if (move.isPass) {
            this.moveNumber = move.moveNumber || (this.moveNumber + 1);
            this.moves.push(move);
            // 패스 시 마지막 수 위치 초기화
            this.lastMoveX = null;
            this.lastMoveY = null;
            this.lastCapturedStones = []; // 패스 시 패 규칙 정보 초기화
            this.drawBoard();
            return;
        }

        const { x, y, color } = move;
        if (x >= 0 && x < this.boardSize && y >= 0 && y < this.boardSize) {
            // Remove captured stones first
            if (capturedStones && capturedStones.length > 0) {
                capturedStones.forEach(stone => {
                    if (stone.x >= 0 && stone.x < this.boardSize && stone.y >= 0 && stone.y < this.boardSize) {
                        this.stones[stone.y][stone.x] = null;
                        // 따낸 돌이 마지막 수였으면 마지막 수 위치 초기화
                        if (stone.x === this.lastMoveX && stone.y === this.lastMoveY) {
                            this.lastMoveX = null;
                            this.lastMoveY = null;
                        }
                    }
                });
            }
            
            // Place the new stone
            this.stones[y][x] = color;
            this.moveNumber = move.moveNumber || (this.moveNumber + 1);
            this.moves.push(move);
            
            // 마지막 수 위치 업데이트
            this.lastMoveX = x;
            this.lastMoveY = y;
            
            // 패 규칙 체크를 위해 마지막 수에서 딴 돌 정보 저장
            if (capturedStones && capturedStones.length === 1) {
                this.lastCapturedStones = [{ x: capturedStones[0].x, y: capturedStones[0].y }];
            } else {
                this.lastCapturedStones = [];
            }
            
            this.drawBoard();
            return true;
        }
        return false;
    }

    loadState(state) {
        // 베이스돌 설정 (베이스바둑)
        if (state.baseStones) {
            this.baseStones = state.baseStones;
            // 로그 제거 (너무 많은 콘솔 메시지 방지)
            // console.log('[GoGame] loadState: baseStones loaded:', {
            //     black: this.baseStones?.black?.length || 0,
            //     white: this.baseStones?.white?.length || 0,
            //     baseStonesRevealed: state.baseStonesRevealed
            // });
        }
        
        // 히든 돌 설정 (히든바둑)
        if (state.hiddenStones) {
            this.hiddenStones = state.hiddenStones;
        }
        if (state.scannedStones) {
            this.scannedStones = state.scannedStones;
        }
        if (state.revealedStones) {
            this.revealedStones = state.revealedStones;
        }
        
        // 로그 제거 (너무 많은 콘솔 메시지 방지)
        // console.log('[GoGame] loadState called with:', {
        //     boardSize: state.boardSize,
        //     currentBoardSize: this.boardSize,
        //     hasStones: !!state.stones,
        //     stonesSize: state.stones ? `${state.stones.length}x${state.stones[0]?.length || 0}` : 'null',
        //     isMyTurn: state.isMyTurn,
        //     currentColor: state.currentColor
        // });
        
        // boardSize를 먼저 확인하고 업데이트 (반드시 업데이트)
        if (state.boardSize !== undefined && state.boardSize !== null) {
            if (state.boardSize !== this.boardSize) {
                // 로그 제거 (너무 많은 콘솔 메시지 방지)
                // console.log(`[GoGame] Board size changed from ${this.boardSize} to ${state.boardSize}`);
                this.boardSize = parseInt(state.boardSize);
                this.stones = Array(this.boardSize).fill(null).map(() => Array(this.boardSize).fill(null));
                // 보드 크기가 변경되면 cellSize도 업데이트
                this.updateCellSize();
            }
        } else {
            console.warn('[GoGame] No boardSize in state, keeping current:', this.boardSize);
        }
        
        // currentColor와 isMyTurn 업데이트
        if (state.currentColor !== undefined) {
            this.currentColor = state.currentColor;
        }
        if (state.isMyTurn !== undefined) {
            this.isMyTurn = state.isMyTurn;
        }
        
        // stones를 로드 (boardSize와 일치하는 경우에만)
        if (state.stones) {
            // stones 배열의 크기가 boardSize와 일치하는지 확인
            if (state.stones.length === this.boardSize && 
                state.stones[0] && state.stones[0].length === this.boardSize) {
                this.stones = state.stones;
            } else {
                console.warn(`[GoGame] Stones array size (${state.stones.length}x${state.stones[0]?.length || 0}) doesn't match boardSize (${this.boardSize}), ignoring`);
                // boardSize에 맞게 stones 배열 재생성
                this.stones = Array(this.boardSize).fill(null).map(() => Array(this.boardSize).fill(null));
            }
        }
        if (state.currentColor !== undefined) {
            this.currentColor = state.currentColor;
        }
        if (state.moveNumber !== undefined) {
            this.moveNumber = state.moveNumber;
        }
        if (state.moves) {
            this.moves = state.moves;
            // 마지막 수 찾기 (패스가 아닌 마지막 수)
            this.lastMoveX = null;
            this.lastMoveY = null;
            for (let i = this.moves.length - 1; i >= 0; i--) {
                const move = this.moves[i];
                if (!move.isPass && move.x !== undefined && move.y !== undefined) {
                    this.lastMoveX = move.x;
                    this.lastMoveY = move.y;
                    break;
                }
            }
        }
        if (state.capturedBlack !== undefined) {
            this.capturedBlack = state.capturedBlack;
        }
        if (state.capturedWhite !== undefined) {
            this.capturedWhite = state.capturedWhite;
        }
        if (state.isMyTurn !== undefined) {
            this.isMyTurn = state.isMyTurn;
        }
        
        setTimeout(() => {
            this.updateCellSize();
            if (this.cellSize > 0) {
                this.drawBoard();
            } else {
                // cellSize가 0이면 재시도
                setTimeout(() => {
                    this.updateCellSize();
                    this.drawBoard();
                }, 100);
            }
        }, 50);
    }

    drawBoard() {
        if (!this.canvas || !this.ctx) {
            console.warn('[GoGame] drawBoard: canvas or ctx not initialized');
            return;
        }
        
        if (!this.cellSize) {
            this.updateCellSize();
        }
        
        if (!this.cellSize || this.cellSize === 0) {
            console.warn('[GoGame] drawBoard: cellSize is 0, cannot draw');
            return;
        }
        
        const ctx = this.ctx;
        const rect = this.canvas.getBoundingClientRect();
        
        if (rect.width === 0 || rect.height === 0) {
            console.warn('[GoGame] drawBoard: canvas has zero size');
            return;
        }
        
        const canvasDisplaySize = Math.min(rect.width, rect.height);
        const dpr = window.devicePixelRatio || 1;
        const canvasPixelSize = canvasDisplaySize * dpr;
        
        // 바둑판 크기 계산 (선과 배경이 항상 동일한 비율)
        const boardSizePixels = this.cellSize * (this.boardSize + 1);
        const size = Math.min(boardSizePixels, canvasPixelSize / dpr);
        
        // Clear entire canvas first
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw background only for the board area (바둑판 크기에 맞춰)
        ctx.fillStyle = '#e0b484';
        const offsetX = (canvasPixelSize / dpr - size) / 2;
        const offsetY = (canvasPixelSize / dpr - size) / 2;
        ctx.fillRect(offsetX, offsetY, size, size);
        
        // Draw grid
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        
        for (let i = 0; i < this.boardSize; i++) {
            const linePos = (i + 1) * this.cellSize;
            // 세로선 (vertical lines)
            ctx.beginPath();
            ctx.moveTo(offsetX + linePos, offsetY + this.cellSize);
            ctx.lineTo(offsetX + linePos, offsetY + size - this.cellSize);
            ctx.stroke();
            
            // 가로선 (horizontal lines)
            ctx.beginPath();
            ctx.moveTo(offsetX + this.cellSize, offsetY + linePos);
            ctx.lineTo(offsetX + size - this.cellSize, offsetY + linePos);
            ctx.stroke();
        }
        
        // Draw hoshi points (보드 크기에 따라)
        let hoshiPositions = [];
        if (this.boardSize === 19) {
            hoshiPositions = [
                [3, 3], [3, 9], [3, 15],
                [9, 3], [9, 9], [9, 15],
                [15, 3], [15, 9], [15, 15]
            ];
        } else if (this.boardSize === 13) {
            hoshiPositions = [
                [3, 3], [3, 9],
                [6, 6],
                [9, 3], [9, 9]
            ];
        } else if (this.boardSize === 9) {
            hoshiPositions = [
                [2, 2], [2, 6],
                [4, 4],
                [6, 2], [6, 6]
            ];
        }
        
        if (hoshiPositions.length > 0) {
            ctx.fillStyle = '#000';
            hoshiPositions.forEach(([x, y]) => {
                if (x < this.boardSize && y < this.boardSize) {
                    ctx.beginPath();
                    ctx.arc(offsetX + (x + 1) * this.cellSize, offsetY + (y + 1) * this.cellSize, 4, 0, 2 * Math.PI);
                    ctx.fill();
                }
            });
        }
        
        // Draw stones (일반 돌 먼저 그리기)
        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                if (this.stones[y][x]) {
                    this.drawStone(x, y, this.stones[y][x], offsetX, offsetY);
                }
            }
        }
        
        // Draw base stones (베이스바둑) - 일반 돌 위에 그려서 항상 보이도록
        if (this.baseStones) {
            const blackCount = this.baseStones.black && Array.isArray(this.baseStones.black) ? this.baseStones.black.length : 0;
            const whiteCount = this.baseStones.white && Array.isArray(this.baseStones.white) ? this.baseStones.white.length : 0;
            // 로그 제거 (너무 많은 콘솔 메시지 방지)
            // console.log('[GoGame] Drawing base stones:', { black: blackCount, white: whiteCount });
            
            if (this.baseStones.black && Array.isArray(this.baseStones.black) && this.baseStones.black.length > 0) {
                this.baseStones.black.forEach(stone => {
                    if (stone && typeof stone.x === 'number' && typeof stone.y === 'number' && 
                        stone.x >= 0 && stone.x < this.boardSize && 
                        stone.y >= 0 && stone.y < this.boardSize) {
                        // 베이스돌은 항상 그리기 (일반 돌이 있어도 베이스돌 표시)
                        this.drawStone(stone.x, stone.y, 'black', offsetX, offsetY, true); // isBaseStone = true
                    }
                });
            }
            if (this.baseStones.white && Array.isArray(this.baseStones.white) && this.baseStones.white.length > 0) {
                this.baseStones.white.forEach(stone => {
                    if (stone && typeof stone.x === 'number' && typeof stone.y === 'number' && 
                        stone.x >= 0 && stone.x < this.boardSize && 
                        stone.y >= 0 && stone.y < this.boardSize) {
                        // 베이스돌은 항상 그리기 (일반 돌이 있어도 베이스돌 표시)
                        this.drawStone(stone.x, stone.y, 'white', offsetX, offsetY, true); // isBaseStone = true
                    }
                });
            }
        }
        
        // Draw hidden stones (히든바둑) - 일반 돌 위에 그려서 표시
        if (this.hiddenStones) {
            const playerKey = this.currentUser === this.gameData?.game?.blackId ? 'black' : 'white';
            const opponentKey = playerKey === 'black' ? 'white' : 'black';
            
            // 자신의 히든 돌 (항상 반투명으로 표시)
            if (this.hiddenStones[playerKey]) {
                this.hiddenStones[playerKey].forEach(stone => {
                    if (!stone.revealed) {
                        this.drawStone(stone.x, stone.y, playerKey === 'black' ? 'black' : 'white', offsetX, offsetY, false, true, false); // isHidden = true, isScanned = false
                    }
                });
            }
            
            // 상대방의 히든 돌 (스캔으로 발견했거나 전체 공개된 경우만 표시)
            if (this.hiddenStones[opponentKey]) {
                this.hiddenStones[opponentKey].forEach(stone => {
                    const isRevealed = this.revealedStones && this.revealedStones.some(rs => rs.x === stone.x && rs.y === stone.y);
                    const isScanned = this.scannedStones && this.scannedStones.some(ss => ss.x === stone.x && ss.y === stone.y);
                    
                    if (isRevealed || isScanned) {
                        this.drawStone(stone.x, stone.y, opponentKey === 'black' ? 'black' : 'white', offsetX, offsetY, false, true, isScanned && !isRevealed); // isHidden = true, isScanned = true (전체 공개가 아닌 경우만)
                    }
                });
            }
        }

        // Draw hover effect (딱 놓여지는 자리에 표시)
        if (this.isMyTurn && this.hoverX !== null && this.hoverY !== null && 
            this.hoverPixelX !== null && this.hoverPixelY !== null) {
            // 바둑판 크기에 따라 호버 효과 크기 조정 (돌 크기와 동일하게)
            const baseRadius = this.cellSize * 0.4;
            const minRadius = 8;
            const maxRadius = this.cellSize * 0.45;
            const radius = Math.max(minRadius, Math.min(baseRadius, maxRadius));
            
            ctx.fillStyle = this.currentColor === 'black' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.3)';
            ctx.beginPath();
            ctx.arc(offsetX + this.hoverPixelX, offsetY + this.hoverPixelY, radius, 0, 2 * Math.PI);
            ctx.fill();
        }

        // Draw missile direction selector (미사일바둑 방향 선택 UI)
        if (this.missileSelectorX !== null && this.missileSelectorY !== null) {
            const centerX = offsetX + (this.missileSelectorX + 1) * this.cellSize;
            const centerY = offsetY + (this.missileSelectorY + 1) * this.cellSize;
            const arrowLength = this.cellSize * 0.6;
            const arrowHeadSize = this.cellSize * 0.15;
            
            ctx.strokeStyle = '#ff0000';
            ctx.fillStyle = '#ff0000';
            ctx.lineWidth = 3;
            
            // 4방향 화살표 그리기
            const directions = [
                { dx: 0, dy: -1, name: 'up' },      // 위
                { dx: 0, dy: 1, name: 'down' },      // 아래
                { dx: -1, dy: 0, name: 'left' },     // 왼쪽
                { dx: 1, dy: 0, name: 'right' }      // 오른쪽
            ];
            
            directions.forEach(dir => {
                const endX = centerX + dir.dx * arrowLength;
                const endY = centerY + dir.dy * arrowLength;
                
                // 화살표 선 그리기
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
                
                // 화살표 머리 그리기
                ctx.beginPath();
                if (dir.name === 'up') {
                    ctx.moveTo(endX, endY);
                    ctx.lineTo(endX - arrowHeadSize, endY + arrowHeadSize);
                    ctx.lineTo(endX + arrowHeadSize, endY + arrowHeadSize);
                } else if (dir.name === 'down') {
                    ctx.moveTo(endX, endY);
                    ctx.lineTo(endX - arrowHeadSize, endY - arrowHeadSize);
                    ctx.lineTo(endX + arrowHeadSize, endY - arrowHeadSize);
                } else if (dir.name === 'left') {
                    ctx.moveTo(endX, endY);
                    ctx.lineTo(endX + arrowHeadSize, endY - arrowHeadSize);
                    ctx.lineTo(endX + arrowHeadSize, endY + arrowHeadSize);
                } else if (dir.name === 'right') {
                    ctx.moveTo(endX, endY);
                    ctx.lineTo(endX - arrowHeadSize, endY - arrowHeadSize);
                    ctx.lineTo(endX - arrowHeadSize, endY + arrowHeadSize);
                }
                ctx.closePath();
                ctx.fill();
            });
        }
    }

    drawStone(x, y, color, offsetX = 0, offsetY = 0, isBaseStone = false, isHidden = false, isScanned = false) {
        const ctx = this.ctx;
        const centerX = offsetX + (x + 1) * this.cellSize;
        const centerY = offsetY + (y + 1) * this.cellSize;
        // 바둑판 크기에 따라 돌 크기 조정 (13줄/9줄에서도 적절한 크기 유지)
        // cellSize의 40%를 기본으로 하되, 최소 8px 보장
        const baseRadius = this.cellSize * 0.4;
        const minRadius = 8;
        const maxRadius = this.cellSize * 0.45;
        const radius = Math.max(minRadius, Math.min(baseRadius, maxRadius));
        
        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.beginPath();
        ctx.arc(centerX + 2, centerY + 2, radius, 0, 2 * Math.PI);
        ctx.fill();
        
        // Stone
        if (color === 'black') {
            const gradient = ctx.createRadialGradient(centerX - radius/3, centerY - radius/3, 0, centerX, centerY, radius);
            gradient.addColorStop(0, '#666');
            gradient.addColorStop(1, '#000');
            ctx.fillStyle = gradient;
        } else {
            const gradient = ctx.createRadialGradient(centerX - radius/3, centerY - radius/3, 0, centerX, centerY, radius);
            gradient.addColorStop(0, '#fff');
            gradient.addColorStop(1, '#ddd');
            ctx.fillStyle = gradient;
        }
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.strokeStyle = color === 'black' ? '#333' : '#999';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // 베이스돌 문양 (Base.webp) - 문양만 표시
        if (isBaseStone) {
            // 베이스돌 이미지 로드 (캐시된 이미지 사용)
            if (!this.baseImageCache) {
                this.baseImageCache = new Image();
                this.baseImageCache.onload = () => {
                    // 로그 제거 (너무 많은 콘솔 메시지 방지)
                    // console.log('[GoGame] Base.webp 이미지 로드 완료');
                    // 이미지가 로드되면 다시 그리기
                    this.drawBoard();
                };
                this.baseImageCache.onerror = () => {
                    console.warn('[GoGame] Base.webp 이미지 로드 실패');
                };
                this.baseImageCache.src = '/images/Base.webp';
            }
            
            // 이미지가 이미 로드된 경우 즉시 그리기
            if (this.baseImageCache && this.baseImageCache.complete && this.baseImageCache.naturalWidth > 0) {
                // 이미지 크기를 돌 크기의 120%로 설정
                const imageSize = radius * 1.2;
                const imageX = centerX - imageSize / 2;
                const imageY = centerY - imageSize / 2;
                
                // 베이스 이미지 그리기 (순수하게 문양만)
                ctx.globalCompositeOperation = 'source-over';
                ctx.drawImage(this.baseImageCache, imageX, imageY, imageSize, imageSize);
            } else if (this.baseImageCache && !this.baseImageCache.complete) {
                // 이미지가 아직 로드 중이면 로드 완료를 기다림
                // 로그 제거 (너무 많은 콘솔 메시지 방지)
                // console.log('[GoGame] Base.webp 이미지 로드 중...');
            }
        }
        
        // 히든 돌 문양 (hidden.webp)
        if (isHidden) {
            const hiddenImage = new Image();
            hiddenImage.onload = () => {
                // 이미지 크기를 돌 크기의 60%로 설정
                const imageSize = radius * 1.2;
                const imageX = centerX - imageSize / 2;
                const imageY = centerY - imageSize / 2;
                ctx.drawImage(hiddenImage, imageX, imageY, imageSize, imageSize);
                // 이미지가 로드된 후 다시 그리기
                this.drawBoard();
            };
            hiddenImage.onerror = () => {
                // 이미지 로드 실패 시 대체 표시 (원형 테두리)
                ctx.strokeStyle = '#FF00FF'; // 마젠타색
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius * 0.7, 0, 2 * Math.PI);
                ctx.stroke();
            };
            hiddenImage.src = '/images/hidden.webp';
        }
        
        // 히든 돌 처리 복원
        if (isHidden) {
            ctx.restore();
        }
        
        // 마지막 수에 붉은 점 표시 (베이스돌이 아닐 때만)
        if (!isBaseStone && this.lastMoveX === x && this.lastMoveY === y) {
            const dotRadius = Math.max(3, radius * 0.25);
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(centerX, centerY, dotRadius, 0, 2 * Math.PI);
            ctx.fill();
        }
    }

    // 미사일바둑: 방향 선택 UI 표시
    showMissileDirectionSelector(x, y) {
        if (!this.cellSize) this.updateCellSize();
        
        // 방향 선택 UI 상태 저장
        this.missileSelectorX = x;
        this.missileSelectorY = y;
        
        // 보드 다시 그리기 (방향 화살표 표시)
        this.drawBoard();
    }

    // 미사일바둑: 방향 선택 UI 제거
    hideMissileDirectionSelector() {
        this.missileSelectorX = null;
        this.missileSelectorY = null;
        this.drawBoard();
    }

    // 미사일바둑: 클릭 위치를 기반으로 방향 계산
    getMissileDirection(fromX, fromY, toX, toY) {
        const dx = toX - fromX;
        const dy = toY - fromY;
        
        // 대각선 방향은 허용하지 않음
        if (dx !== 0 && dy !== 0) {
            return null;
        }
        
        // 같은 위치는 허용하지 않음
        if (dx === 0 && dy === 0) {
            return null;
        }
        
        // 방향 결정
        if (dy < 0) return 'up';
        if (dy > 0) return 'down';
        if (dx < 0) return 'left';
        if (dx > 0) return 'right';
        
        return null;
    }
}
