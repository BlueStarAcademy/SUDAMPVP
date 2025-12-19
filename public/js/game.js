// Go Game Logic
class GoGame {
    constructor(canvasId, socket, currentUser, gameId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.socket = socket;
        this.currentUser = currentUser;
        this.gameId = gameId;

        this.boardSize = 19;
        this.cellSize = this.canvas.width / (this.boardSize + 1);
        this.stones = Array(this.boardSize).fill(null).map(() => Array(this.boardSize).fill(null));
        this.currentColor = 'black';
        this.moveNumber = 0;
        this.moves = [];
        this.capturedBlack = 0;
        this.capturedWhite = 0;

        this.init();
    }

    init() {
        this.drawBoard();
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const boardX = Math.round((x / this.cellSize) - 1);
            const boardY = Math.round((y / this.cellSize) - 1);

            if (this.isValidMove(boardX, boardY)) {
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
    }

    drawBoard() {
        const ctx = this.ctx;
        const size = this.boardSize;
        const cellSize = this.cellSize;

        // Clear canvas
        ctx.fillStyle = '#deb887';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

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
    }

    drawStone(x, y, color) {
        const ctx = this.ctx;
        const centerX = (x + 1) * this.cellSize;
        const centerY = (y + 1) * this.cellSize;
        const radius = this.cellSize * 0.4;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);

        if (color === 'black') {
            ctx.fillStyle = '#000';
        } else {
            ctx.fillStyle = '#fff';
        }

        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
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

