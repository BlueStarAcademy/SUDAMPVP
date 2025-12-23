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

    async initializeTimer(gameId, timePerPlayer = 30 * 60, options = {}) {
        const timerData = {
            blackTime: timePerPlayer,
            whiteTime: timePerPlayer,
            currentTurn: 'black',
            lastUpdate: Date.now(),
            isRunning: true,
            isFischer: options.isFischer || false, // 피셔 방식 여부 (스피드바둑)
            fischerIncrement: options.fischerIncrement || 5, // 피셔 방식 추가 시간 (초)
            // 초읽기 모드 설정
            byoyomiSeconds: options.byoyomiSeconds || 30, // 초읽기 시간 (기본 30초)
            byoyomiPeriods: options.byoyomiPeriods || 5, // 초읽기 횟수 (기본 5회)
            // 초읽기 모드 상태
            blackByoyomiPeriods: options.byoyomiPeriods || 5, // 흑의 남은 초읽기 횟수
            whiteByoyomiPeriods: options.byoyomiPeriods || 5, // 백의 남은 초읽기 횟수
            blackInByoyomi: false, // 흑이 초읽기 모드인지
            whiteInByoyomi: false, // 백이 초읽기 모드인지
            blackByoyomiTime: options.byoyomiSeconds || 30, // 흑의 현재 초읽기 시간
            whiteByoyomiTime: options.byoyomiSeconds || 30 // 백의 현재 초읽기 시간
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

    async switchTurn(gameId, gameMode = 'CLASSIC') {
        const timer = await this.getTimer(gameId);
        const previousTurn = timer.currentTurn;
        
        // 이전 턴의 시간 처리
        if (previousTurn === 'black') {
            // 스피드바둑(피셔 방식)이 아닐 때는 시간 회복하지 않음
            if (!timer.isFischer) {
                // 제한시간이 0이 되면 초읽기 모드로 전환
                if (timer.blackTime <= 0 && !timer.blackInByoyomi) {
                    timer.blackInByoyomi = true;
                    timer.blackByoyomiTime = timer.byoyomiSeconds;
                }
                // 초읽기 모드에서는 착수 후 시간 회복
                if (timer.blackInByoyomi) {
                    timer.blackByoyomiTime = timer.byoyomiSeconds; // 초읽기 시간 회복
                }
            } else {
                // 스피드바둑: 피셔 방식으로 시간 추가
                timer.blackTime += timer.fischerIncrement;
            }
        } else {
            // 스피드바둑(피셔 방식)이 아닐 때는 시간 회복하지 않음
            if (!timer.isFischer) {
                // 제한시간이 0이 되면 초읽기 모드로 전환
                if (timer.whiteTime <= 0 && !timer.whiteInByoyomi) {
                    timer.whiteInByoyomi = true;
                    timer.whiteByoyomiTime = timer.byoyomiSeconds;
                }
                // 초읽기 모드에서는 착수 후 시간 회복
                if (timer.whiteInByoyomi) {
                    timer.whiteByoyomiTime = timer.byoyomiSeconds; // 초읽기 시간 회복
                }
            } else {
                // 스피드바둑: 피셔 방식으로 시간 추가
                timer.whiteTime += timer.fischerIncrement;
            }
        }
        
        timer.currentTurn = previousTurn === 'black' ? 'white' : 'black';
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
                if (timer.blackInByoyomi) {
                    // 초읽기 모드: 초읽기 시간 감소
                    timer.blackByoyomiTime = Math.max(0, timer.blackByoyomiTime - elapsed);
                    
                    // 초읽기 시간이 0이 되면 횟수 감소
                    if (timer.blackByoyomiTime <= 0) {
                        timer.blackByoyomiPeriods = Math.max(0, timer.blackByoyomiPeriods - 1);
                        if (timer.blackByoyomiPeriods > 0) {
                            // 아직 횟수가 남아있으면 초읽기 시간 회복
                            timer.blackByoyomiTime = timer.byoyomiSeconds;
                        }
                    }
                } else {
                    // 일반 모드: 제한시간 감소
                    timer.blackTime = Math.max(0, timer.blackTime - elapsed);
                    
                    // 제한시간이 0이 되면 초읽기 모드로 전환
                    if (timer.blackTime <= 0 && timer.blackByoyomiPeriods > 0) {
                        timer.blackInByoyomi = true;
                        timer.blackByoyomiTime = timer.byoyomiSeconds;
                    }
                }
            } else {
                if (timer.whiteInByoyomi) {
                    // 초읽기 모드: 초읽기 시간 감소
                    timer.whiteByoyomiTime = Math.max(0, timer.whiteByoyomiTime - elapsed);
                    
                    // 초읽기 시간이 0이 되면 횟수 감소
                    if (timer.whiteByoyomiTime <= 0) {
                        timer.whiteByoyomiPeriods = Math.max(0, timer.whiteByoyomiPeriods - 1);
                        if (timer.whiteByoyomiPeriods > 0) {
                            // 아직 횟수가 남아있으면 초읽기 시간 회복
                            timer.whiteByoyomiTime = timer.byoyomiSeconds;
                        }
                    }
                } else {
                    // 일반 모드: 제한시간 감소
                    timer.whiteTime = Math.max(0, timer.whiteTime - elapsed);
                    
                    // 제한시간이 0이 되면 초읽기 모드로 전환
                    if (timer.whiteTime <= 0 && timer.whiteByoyomiPeriods > 0) {
                        timer.whiteInByoyomi = true;
                        timer.whiteByoyomiTime = timer.byoyomiSeconds;
                    }
                }
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
                    currentTurn: timer.currentTurn,
                    blackInByoyomi: timer.blackInByoyomi,
                    whiteInByoyomi: timer.whiteInByoyomi,
                    blackByoyomiTime: timer.blackByoyomiTime,
                    whiteByoyomiTime: timer.whiteByoyomiTime,
                    blackByoyomiPeriods: timer.blackByoyomiPeriods,
                    whiteByoyomiPeriods: timer.whiteByoyomiPeriods
                });

                // Check for expiration (초읽기 횟수도 모두 소진된 경우)
                if (timer.currentTurn === 'black') {
                    if (timer.blackInByoyomi && timer.blackByoyomiPeriods <= 0 && timer.blackByoyomiTime <= 0) {
                        timer.isRunning = false;
                        io.to(`game-${gameId}`).emit('timer_expired', { color: 'black' });
                    }
                } else {
                    if (timer.whiteInByoyomi && timer.whiteByoyomiPeriods <= 0 && timer.whiteByoyomiTime <= 0) {
                        timer.isRunning = false;
                        io.to(`game-${gameId}`).emit('timer_expired', { color: 'white' });
                    }
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

