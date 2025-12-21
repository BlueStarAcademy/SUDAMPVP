const { getRedisClient } = require('../config/redis');

class TimerService {
    constructor() {
        this.timers = new Map(); // gameId -> timer data
        this.updateInterval = null;
        this.startTimerLoop();
    }

    startTimerLoop() {
        // Update all timers every second
        this.updateInterval = setInterval(() => {
            this.updateAllTimers();
        }, 1000);
    }

    async initializeTimer(gameId, timePerPlayer = 30 * 60) {
        const timerData = {
            blackTime: timePerPlayer,
            whiteTime: timePerPlayer,
            currentTurn: 'black',
            lastUpdate: Date.now(),
            isRunning: true
        };

        const redis = getRedisClient();
        if (redis) {
            try {
                await redis.setEx(`timer:${gameId}`, 7200, JSON.stringify(timerData)); // 2 hour TTL
            } catch (error) {
                console.error('Redis timer init error:', error);
            }
        }

        this.timers.set(gameId, timerData);
        return timerData;
    }

    async getTimer(gameId) {
        const redis = getRedisClient();
        if (redis) {
            try {
                const cached = await redis.get(`timer:${gameId}`);
                if (cached) {
                    return JSON.parse(cached);
                }
            } catch (error) {
                console.error('Redis timer get error:', error);
            }
        }

        // Initialize if not exists
        return await this.initializeTimer(gameId);
    }

    async switchTurn(gameId) {
        const timer = await this.getTimer(gameId);
        timer.currentTurn = timer.currentTurn === 'black' ? 'white' : 'black';
        timer.lastUpdate = Date.now();

        const redis = getRedisClient();
        if (redis) {
            try {
                await redis.setEx(`timer:${gameId}`, 7200, JSON.stringify(timer));
            } catch (error) {
                console.error('Redis timer switch error:', error);
            }
        }

        this.timers.set(gameId, timer);
        return timer;
    }

    async updateAllTimers() {
        const redis = getRedisClient();
        
        for (const [gameId, timer] of this.timers.entries()) {
            if (!timer.isRunning) continue;

            const now = Date.now();
            const elapsed = (now - timer.lastUpdate) / 1000; // seconds

            if (timer.currentTurn === 'black') {
                timer.blackTime = Math.max(0, timer.blackTime - elapsed);
            } else {
                timer.whiteTime = Math.max(0, timer.whiteTime - elapsed);
            }

            timer.lastUpdate = now;

            // Save to Redis
            if (redis) {
                try {
                    await redis.setEx(`timer:${gameId}`, 7200, JSON.stringify(timer));
                } catch (error) {
                    console.error('Redis timer save error:', error);
                }
            }

            // Emit update to game room
            const io = require('../server').io;
            if (io) {
                io.to(`game-${gameId}`).emit('timer_update', {
                    blackTime: timer.blackTime,
                    whiteTime: timer.whiteTime,
                    currentTurn: timer.currentTurn
                });

                // Check for expiration
                if (timer.blackTime <= 0 && timer.currentTurn === 'black') {
                    timer.isRunning = false;
                    io.to(`game-${gameId}`).emit('timer_expired', { color: 'black' });
                } else if (timer.whiteTime <= 0 && timer.currentTurn === 'white') {
                    timer.isRunning = false;
                    io.to(`game-${gameId}`).emit('timer_expired', { color: 'white' });
                }
            }
        }
    }

    async pauseTimer(gameId) {
        const timer = await this.getTimer(gameId);
        timer.isRunning = false;
        
        const redis = getRedisClient();
        if (redis) {
            try {
                await redis.setEx(`timer:${gameId}`, 7200, JSON.stringify(timer));
            } catch (error) {
                console.error('Redis timer pause error:', error);
            }
        }
        this.timers.set(gameId, timer);
    }

    async resumeTimer(gameId) {
        const timer = await this.getTimer(gameId);
        timer.isRunning = true;
        timer.lastUpdate = Date.now();
        
        const redis = getRedisClient();
        if (redis) {
            try {
                await redis.setEx(`timer:${gameId}`, 7200, JSON.stringify(timer));
            } catch (error) {
                console.error('Redis timer resume error:', error);
            }
        }
        this.timers.set(gameId, timer);
    }

    async stopTimer(gameId) {
        this.timers.delete(gameId);
        const redis = getRedisClient();
        if (redis) {
            try {
                await redis.del(`timer:${gameId}`);
            } catch (error) {
                console.error('Redis timer stop error:', error);
            }
        }
    }
}

module.exports = new TimerService();

