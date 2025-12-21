// Go Game Logic
class GoGame {
    constructor(canvasId, socket, currentUser, gameId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.socket = socket;
        this.currentUser = currentUser;
        this.gameId = gameId;

        this.boardSize = 19;
        this.stones = Array(this.boardSize).fill(null).map(() => Array(this.boardSize).fill(null));
        this.currentColor = 'black';
        this.moveNumber = 0;
        this.moves = [];
        this.capturedBlack = 0;
        this.capturedWhite = 0;
        
        // 호버 위치 추적
        this.hoverX = null;
        this.hoverY = null;
        this.isMyTurn = false;

        this.init();
    }
    
    updateCellSize() {
        // canvas의 실제 렌더링 크기를 가져옴
        const rect = this.canvas.getBoundingClientRect();
        const actualWidth = rect.width;
        const actualHeight = rect.height;
        
        // 정사각형을 유지하기 위해 작은 쪽을 기준으로
        const size = Math.min(actualWidth, actualHeight);
        this.cellSize = size / (this.boardSize + 1);
        
        // canvas의 실제 픽셀 크기도 조정 (고해상도 디스플레이 대응)
        const dpr = window.devicePixelRatio || 1;
        const pixelSize = size * dpr;
        
        // canvas의 실제 크기와 CSS 크기를 동기화
        if (this.canvas.width !== pixelSize || this.canvas.height !== pixelSize) {
            this.canvas.width = pixelSize;
            this.canvas.height = pixelSize;
            this.ctx.scale(dpr, dpr);
        }
        
        // CSS 크기는 CSS로 이미 설정되어 있으므로 변경하지 않음
    }

    init() {
        this.updateCellSize();
        this.drawBoard();
        this.setupEventListeners();
        
        // 리사이즈 이벤트 리스너 추가
        window.addEventListener('resize', () => {
            this.updateCellSize();
            this.drawBoard();
        });
    }
    
    // 마우스 위치를 보드 좌표로 변환
    getBoardPosition(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;
        
        // cellSize가 0이거나 undefined인 경우 업데이트
        if (!this.cellSize || this.cellSize === 0) {
            this.updateCellSize();
        }
        
        const boardX = Math.round((x / this.cellSize) - 1);
        const boardY = Math.round((y / this.cellSize) - 1);
        
        return { boardX, boardY };
    }

    setupEventListeners() {
        // 클릭 이벤트
        this.canvas.addEventListener('click', (e) => {
            if (!this.isMyTurn) return;
            
            const { boardX, boardY } = this.getBoardPosition(e.clientX, e.clientY);

            if (this.isValidMove(boardX, boardY)) {
                this.hoverX = null;
                this.hoverY = null;
                this.makeMove({ x: boardX, y: boardY, color: this.currentColor });
                this.socket.emit('make_move', {
                    move: {
                        x: boardX,
                        y: boardY,
                        color: this.currentColor,
                        moveNumber: this.moveNumber + 1
                    }
                });
            }
        });
        
        // 마우스 이동 이벤트 (호버 효과)
        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isMyTurn) {
                this.hoverX = null;
                this.hoverY = null;
                this.drawBoard();
                return;
            }
            
            const { boardX, boardY } = this.getBoardPosition(e.clientX, e.clientY);
            
            // 유효한 위치인지 확인
            if (this.isValidMove(boardX, boardY)) {
                // 위치가 변경되었을 때만 업데이트
                if (this.hoverX !== boardX || this.hoverY !== boardY) {
                    this.hoverX = boardX;
                    this.hoverY = boardY;
                    this.drawBoard();
                }
            } else {
                // 유효하지 않은 위치면 호버 제거
                if (this.hoverX !== null || this.hoverY !== null) {
                    this.hoverX = null;
                    this.hoverY = null;
                    this.drawBoard();
                }
            }
        });
        
        // 마우스가 캔버스를 벗어날 때 호버 제거
        this.canvas.addEventListener('mouseleave', () => {
            this.hoverX = null;
            this.hoverY = null;
            this.drawBoard();
        });
    }

    drawBoard() {
        // cellSize가 없으면 업데이트
        if (!this.cellSize || this.cellSize === 0) {
            this.updateCellSize();
        }
        
        const ctx = this.ctx;
        const size = this.boardSize;
        const cellSize = this.cellSize;
        
        // canvas 크기 확인 및 조정
        const rect = this.canvas.getBoundingClientRect();
        const canvasSize = Math.min(rect.width, rect.height);
        const dpr = window.devicePixelRatio || 1;
        if (Math.abs(this.canvas.width / dpr - canvasSize) > 1) {
            this.updateCellSize();
            // 다시 가져오기
            const newRect = this.canvas.getBoundingClientRect();
            const newSize = Math.min(newRect.width, newRect.height);
            this.cellSize = newSize / (this.boardSize + 1);
        }

        // Clear canvas
        ctx.fillStyle = '#deb887';
        ctx.fillRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);

        // Draw grid
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;

        for (let i = 0; i < size; i++) {
            const pos = (i + 1) * cellSize;

            // Horizontal lines
            ctx.beginPath();
            ctx.moveTo(cellSize, pos);
            ctx.lineTo(size * cellSize, pos);
            ctx.stroke();

            // Vertical lines
            ctx.beginPath();
            ctx.moveTo(pos, cellSize);
            ctx.lineTo(pos, size * cellSize);
            ctx.stroke();
        }

        // Draw star points
        const starPoints = [
            [3, 3], [3, 9], [3, 15],
            [9, 3], [9, 9], [9, 15],
            [15, 3], [15, 9], [15, 15]
        ];

        ctx.fillStyle = '#000';
        starPoints.forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc((x + 1) * cellSize, (y + 1) * cellSize, 4, 0, 2 * Math.PI);
            ctx.fill();
        });

        // Draw stones
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (this.stones[y][x]) {
                    this.drawStone(x, y, this.stones[y][x]);
                }
            }
        }
        
        // Draw hover preview stone
        if (this.hoverX !== null && this.hoverY !== null && this.isMyTurn) {
            this.drawStone(this.hoverX, this.hoverY, this.currentColor, true);
        }
    }

    drawStone(x, y, color, isPreview = false) {
        const ctx = this.ctx;
        const centerX = (x + 1) * this.cellSize;
        const centerY = (y + 1) * this.cellSize;
        const radius = this.cellSize * 0.4;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);

        if (isPreview) {
            // 호버 미리보기는 반투명하게 (더 명확하게 보이도록)
            if (color === 'black') {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
            }
            ctx.lineWidth = 2;
        } else {
            if (color === 'black') {
                ctx.fillStyle = '#000';
            } else {
                ctx.fillStyle = '#fff';
            }
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
        }

        ctx.fill();
        ctx.stroke();
    }

    isValidMove(x, y) {
        // Check bounds
        if (x < 0 || x >= this.boardSize || y < 0 || y >= this.boardSize) {
            return false;
        }

        // Check if position is empty
        if (this.stones[y][x] !== null) {
            return false;
        }

        // TODO: Add ko rule and suicide rule checks
        return true;
    }

    makeMove(move) {
        if (move.isPass) {
            this.moveNumber++;
            this.currentColor = this.currentColor === 'black' ? 'white' : 'black';
            this.moves.push(move);
            return;
        }

        const { x, y, color } = move;

        if (!this.isValidMove(x, y)) {
            return false;
        }

        // Place stone
        this.stones[y][x] = color;
        this.moveNumber++;
        this.currentColor = color === 'black' ? 'white' : 'black';
        this.moves.push(move);

        // TODO: Handle captures
        // TODO: Check for ko

        this.drawBoard();
        return true;
    }

    loadState(state) {
        this.stones = state.stones || this.stones;
        this.currentColor = state.currentColor || 'black';
        this.moveNumber = state.moveNumber || 0;
        this.moves = state.moves || [];
        this.capturedBlack = state.capturedBlack || 0;
        this.capturedWhite = state.capturedWhite || 0;
        
        // cellSize 업데이트
        this.updateCellSize();

        this.drawBoard();
    }

    getState() {
        return {
            stones: this.stones,
            currentColor: this.currentColor,
            moveNumber: this.moveNumber,
            moves: this.moves,
            capturedBlack: this.capturedBlack,
            capturedWhite: this.capturedWhite
        };
    }
}

