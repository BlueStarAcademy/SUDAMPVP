// Game Timer with Server Synchronization
class GameTimer {
    constructor(socket, options = {}) {
        this.socket = socket;
        this.blackTimerEl = document.getElementById(options.blackTimer || 'blackTimer');
        this.whiteTimerEl = document.getElementById(options.whiteTimer || 'whiteTimer');
        this.blackPlayerEl = document.getElementById(options.blackPlayer || 'blackPlayer');
        this.whitePlayerEl = document.getElementById(options.whitePlayer || 'whitePlayer');

        this.blackTime = 30 * 60; // 30 minutes in seconds
        this.whiteTime = 30 * 60;
        this.currentTurn = 'black';
        this.serverTimeOffset = 0;
        this.lastSyncTime = Date.now();
        this.updateInterval = null;

        this.init();
    }

    init() {
        // Request time sync
        this.syncTime();

        // Sync time every 5 seconds
        setInterval(() => {
            this.syncTime();
        }, 5000);

        // Update timers every 100ms for smooth display
        this.updateInterval = setInterval(() => {
            this.updateDisplay();
        }, 100);

        // Listen for server timer updates
        this.socket.on('timer_update', (data) => {
            this.updateFromServer(data);
        });

        this.socket.on('time_sync', (data) => {
            this.calculateTimeOffset(data.serverTime);
        });
    }

    syncTime() {
        const clientTime = Date.now();
        this.socket.emit('time_sync_request', { clientTime });
    }

    calculateTimeOffset(serverTime) {
        const now = Date.now();
        const rtt = now - this.lastSyncTime;
        this.serverTimeOffset = serverTime - now + (rtt / 2); // Account for half RTT
        this.lastSyncTime = now;
    }

    updateFromServer(data) {
        this.blackTime = data.blackTime || this.blackTime;
        this.whiteTime = data.whiteTime || this.whiteTime;
        this.currentTurn = data.currentTurn || this.currentTurn;
        this.updateActivePlayer();
    }

    updateActivePlayer() {
        if (this.blackPlayerEl && this.whitePlayerEl) {
            if (this.currentTurn === 'black') {
                this.blackPlayerEl.classList.add('active');
                this.whitePlayerEl.classList.remove('active');
            } else {
                this.whitePlayerEl.classList.add('active');
                this.blackPlayerEl.classList.remove('active');
            }
        }
    }

    updateDisplay() {
        // Decrement current player's time
        if (this.currentTurn === 'black' && this.blackTime > 0) {
            this.blackTime -= 0.1;
        } else if (this.currentTurn === 'white' && this.whiteTime > 0) {
            this.whiteTime -= 0.1;
        }

        // Update black timer
        if (this.blackTimerEl) {
            const time = Math.max(0, Math.floor(this.blackTime));
            const minutes = Math.floor(time / 60);
            const seconds = time % 60;
            this.blackTimerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

            // Add warning classes
            this.blackTimerEl.classList.remove('warning', 'danger');
            if (time < 60) {
                this.blackTimerEl.classList.add('danger');
            } else if (time < 300) {
                this.blackTimerEl.classList.add('warning');
            }
        }

        // Update white timer
        if (this.whiteTimerEl) {
            const time = Math.max(0, Math.floor(this.whiteTime));
            const minutes = Math.floor(time / 60);
            const seconds = time % 60;
            this.whiteTimerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

            // Add warning classes
            this.whiteTimerEl.classList.remove('warning', 'danger');
            if (time < 60) {
                this.whiteTimerEl.classList.add('danger');
            } else if (time < 300) {
                this.whiteTimerEl.classList.add('warning');
            }
        }

        // Check for time expiration
        if (this.blackTime <= 0 && this.currentTurn === 'black') {
            this.socket.emit('timer_expired', { color: 'black' });
        } else if (this.whiteTime <= 0 && this.currentTurn === 'white') {
            this.socket.emit('timer_expired', { color: 'white' });
        }
    }

    updateTimers(data) {
        if (data.blackTime !== undefined) {
            this.blackTime = data.blackTime;
        }
        if (data.whiteTime !== undefined) {
            this.whiteTime = data.whiteTime;
        }
        if (data.currentTurn) {
            this.currentTurn = data.currentTurn;
            this.updateActivePlayer();
        }
    }

    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }
}

