const { getRedisClient } = require('../config/redis');

class TimerService {
    constructor() {
        this.timers = new Map();
    }

    async initializeTimer(gameId, timePerPlayer = 30 * 60, options = {}) {
        const timerData = {
            gameId: gameId,
            blackTime: timePerPlayer,
            whiteTime: timePerPlayer,
            currentTurn: 'black',
            blackInByoyomi: false,
            whiteInByoyomi: false,
            blackByoyomiPeriods: options.byoyomiPeriods !== undefined ? options.byoyomiPeriods : 5,
            whiteByoyomiPeriods: options.byoyomiPeriods !== undefined ? options.byoyomiPeriods : 5,
            blackByoyomiTime: options.byoyomiSeconds !== undefined ? options.byoyomiSeconds : 30,
            whiteByoyomiTime: options.byoyomiSeconds !== undefined ? options.byoyomiSeconds : 30,
            byoyomiSeconds: options.byoyomiSeconds !== undefined ? options.byoyomiSeconds : 30,
            isFischer: options.isFischer || false,
            fischerIncrement: options.fischerIncrement || 5,
            isPaused: true, // 초기화 시 일시정지 상태로 시작
            lastUpdate: 0 // 게임 시작 전까지는 0으로 유지 (타이머가 시작될 때 설정됨)
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
        console.log(`[TimerService] Timer initialized for game ${gameId}:`, {
            timePerPlayer: timePerPlayer,
            byoyomiSeconds: timerData.byoyomiSeconds,
            byoyomiPeriods: timerData.byoyomiPeriods
        });
        return timerData;
    }

    async getTimer(gameId) {
        // 먼저 메모리 캐시 확인
        const cachedTimer = this.timers.get(gameId);
        if (cachedTimer) {
            return cachedTimer;
        }
        const redis = getRedisClient();
        if (redis) {
            try {
                const cached = await redis.get(`timer:${gameId}`);
                if (cached) {
                    const timerData = JSON.parse(cached);
                    // 메모리 캐시에도 저장 (다음 호출 시 빠른 접근)
                    this.timers.set(gameId, timerData);
                    return timerData;
                }
            } catch (error) {
                console.error('Redis timer get error:', error);
            }
        }

        // Initialize if not exists - 메모리 캐시에서 설정 가져오기
        console.log(`[TimerService] Timer not found for game ${gameId}, initializing timer with settings from cache`);
        
        // gameService의 메모리 캐시에서 설정 가져오기
        const gameService = require('./gameService');
        const memorySettings = gameService.gameSettingsCache?.get(gameId);
        
        if (memorySettings) {
            console.log(`[TimerService] Found settings in memory cache:`, memorySettings);
            const timePerPlayer = (memorySettings.timeLimit || 30) * 60; // 분을 초로 변환
            const defaultTimer = await this.initializeTimer(gameId, timePerPlayer, {
                isFischer: false,
                fischerIncrement: memorySettings.timeIncrement !== undefined ? memorySettings.timeIncrement : 5,
                byoyomiSeconds: memorySettings.byoyomiSeconds !== undefined ? memorySettings.byoyomiSeconds : 30,
                byoyomiPeriods: memorySettings.byoyomiPeriods !== undefined ? memorySettings.byoyomiPeriods : 5
            });
            return defaultTimer;
        } else {
            console.log(`[TimerService] No settings in memory cache, using default timer`);
            const defaultTimer = await this.initializeTimer(gameId);
            return defaultTimer;
        }
    }

    async switchTurn(gameId, gameMode = 'CLASSIC') {
        const timer = await this.getTimer(gameId);
        if (!timer) {
            console.error(`[TimerService] switchTurn: Timer not found for game ${gameId}`);
            return null;
        }
        
        const previousTurn = timer.currentTurn;
        const now = Date.now();
        
        // 이전 턴의 경과 시간 계산 및 차감
        if (timer.lastUpdate) {
            const elapsed = (now - timer.lastUpdate) / 1000; // 초 단위
            
            if (previousTurn === 'black') {
                if (timer.blackInByoyomi) {
                    timer.blackByoyomiTime = Math.max(0, timer.blackByoyomiTime - elapsed);
                    if (timer.blackByoyomiTime <= 0) {
                        timer.blackByoyomiPeriods = Math.max(0, timer.blackByoyomiPeriods - 1);
                        if (timer.blackByoyomiPeriods > 0) {
                            timer.blackByoyomiTime = timer.byoyomiSeconds;
                        }
                    }
                } else {
                    timer.blackTime = Math.max(0, timer.blackTime - elapsed);
                    if (timer.blackTime <= 0 && !timer.blackInByoyomi && timer.blackByoyomiPeriods > 0) {
                        timer.blackInByoyomi = true;
                        timer.blackByoyomiTime = timer.byoyomiSeconds;
                    }
                }
            } else {
                if (timer.whiteInByoyomi) {
                    timer.whiteByoyomiTime = Math.max(0, timer.whiteByoyomiTime - elapsed);
                    if (timer.whiteByoyomiTime <= 0) {
                        timer.whiteByoyomiPeriods = Math.max(0, timer.whiteByoyomiPeriods - 1);
                        if (timer.whiteByoyomiPeriods > 0) {
                            timer.whiteByoyomiTime = timer.byoyomiSeconds;
                        }
                    }
                } else {
                    timer.whiteTime = Math.max(0, timer.whiteTime - elapsed);
                    if (timer.whiteTime <= 0 && !timer.whiteInByoyomi && timer.whiteByoyomiPeriods > 0) {
                        timer.whiteInByoyomi = true;
                        timer.whiteByoyomiTime = timer.byoyomiSeconds;
                    }
                }
            }
        }
        
        // 스피드바둑(피셔 방식) 처리
        // 스피드바둑은 피셔 방식만 사용 (초읽기 없음)
        if (timer.isFischer) {
            if (previousTurn === 'black') {
                timer.blackTime += timer.fischerIncrement;
            } else {
                timer.whiteTime += timer.fischerIncrement;
            }
        }
        
        // 스피드바둑에서는 초읽기 비활성화 확인
        if (timer.isFischer && (timer.byoyomiPeriods === 0 || timer.byoyomiSeconds === 0)) {
            // 초읽기 관련 상태 초기화
            timer.blackInByoyomi = false;
            timer.whiteInByoyomi = false;
            timer.blackByoyomiPeriods = 0;
            timer.whiteByoyomiPeriods = 0;
            timer.blackByoyomiTime = 0;
            timer.whiteByoyomiTime = 0;
        }
        
        // 턴 전환
        timer.currentTurn = previousTurn === 'black' ? 'white' : 'black';
        timer.lastUpdate = now;
        
        // 중요: 제한시간(blackTime, whiteTime)은 절대 리셋하지 않음 - 턴이 바뀌어도 유지
        // 초읽기는 초읽기 모드에 들어갔을 때만 리셋됨 (위의 로직에서 이미 처리됨)
        // 초읽기 모드가 아닐 때는 초읽기 시간을 변경하지 않음
        
        // Redis에 저장
        const redis = getRedisClient();
        if (redis) {
            try {
                await redis.setEx(`timer:${gameId}`, 7200, JSON.stringify(timer));
            } catch (error) {
                console.error('Redis timer update error:', error);
            }
        }
        
        this.timers.set(gameId, timer);
        
        console.log(`[TimerService] switchTurn: ${previousTurn} -> ${timer.currentTurn}`, {
            blackTime: timer.blackTime,
            whiteTime: timer.whiteTime,
            blackInByoyomi: timer.blackInByoyomi,
            whiteInByoyomi: timer.whiteInByoyomi
        });
        
        return timer;
    }

    async updateTimer(gameId, elapsedTime) {
        const timer = await this.getTimer(gameId);
        if (!timer) {
            console.log(`[TimerService] updateTimer: Timer not found for game ${gameId}`);
            return null;
        }
        
        // 일시정지 상태일 때는 시간 감소하지 않음 (lastUpdate도 업데이트하지 않음)
        if (timer.isPaused === true) {
            return timer;
        }
        
        const now = Date.now();
        // lastUpdate가 없거나 0이면 현재 시간으로 설정 (첫 업데이트)
        if (!timer.lastUpdate || timer.lastUpdate === 0) {
            timer.lastUpdate = now;
            return timer;
        }
        
        const delta = (now - timer.lastUpdate) / 1000; // 초 단위
        
        // delta가 음수이거나 너무 크면 (시스템 시간 변경 등) 무시
        if (delta < 0 || delta > 10) {
            timer.lastUpdate = now;
            return timer;
        }
        
        let timeExpired = false;
        let expiredColor = null;

        if (timer.currentTurn === 'black') {
                if (timer.blackInByoyomi) {
                    timer.blackByoyomiTime = Math.max(0, timer.blackByoyomiTime - delta);
                    if (timer.blackByoyomiTime <= 0) {
                        timer.blackByoyomiPeriods = Math.max(0, timer.blackByoyomiPeriods - 1);
                        if (timer.blackByoyomiPeriods > 0) {
                            timer.blackByoyomiTime = timer.byoyomiSeconds;
                        } else {
                            // 시간 초과 (초읽기까지 모두 소진)
                            timeExpired = true;
                            expiredColor = 'black';
                        }
                    }
                } else {
                    timer.blackTime = Math.max(0, timer.blackTime - delta);
                    if (timer.blackTime <= 0) {
                        if (timer.blackByoyomiPeriods > 0) {
                            console.log(`[TimerService] Black entered byoyomi in game ${gameId}`);
                            timer.blackInByoyomi = true;
                            timer.blackByoyomiTime = timer.byoyomiSeconds;
                        } else {
                             // 시간 초과 (초읽기 없음)
                            console.log(`[TimerService] Black time expired (no byoyomi) in game ${gameId}`);
                            timeExpired = true;
                            expiredColor = 'black';
                        }
                    }
                }
            } else {
                if (timer.whiteInByoyomi) {
                    timer.whiteByoyomiTime = Math.max(0, timer.whiteByoyomiTime - delta);
                    if (timer.whiteByoyomiTime <= 0) {
                        timer.whiteByoyomiPeriods = Math.max(0, timer.whiteByoyomiPeriods - 1);
                        if (timer.whiteByoyomiPeriods > 0) {
                            timer.whiteByoyomiTime = timer.byoyomiSeconds;
                        } else {
                            // 시간 초과 (초읽기까지 모두 소진)
                            timeExpired = true;
                            expiredColor = 'white';
                        }
                    }
                } else {
                    timer.whiteTime = Math.max(0, timer.whiteTime - delta);
                    if (timer.whiteTime <= 0) {
                        if (timer.whiteByoyomiPeriods > 0) {
                            console.log(`[TimerService] White entered byoyomi in game ${gameId}`);
                            timer.whiteInByoyomi = true;
                            timer.whiteByoyomiTime = timer.byoyomiSeconds;
                        } else {
                            // 시간 초과 (초읽기 없음)
                            console.log(`[TimerService] White time expired (no byoyomi) in game ${gameId}`);
                            timeExpired = true;
                            expiredColor = 'white';
                        }
                    }
                }
            }
        
        timer.lastUpdate = now;
        
        // 시간 초과 시 상태 반환
        if (timeExpired) {
            return { ...timer, timeExpired: true, expiredColor };
        }
        
        // Redis에 저장
        const redis = getRedisClient();
        if (redis) {
            try {
                await redis.setEx(`timer:${gameId}`, 7200, JSON.stringify(timer));
            } catch (error) {
                console.error('Redis timer update error:', error);
            }
        }
        
        this.timers.set(gameId, timer);
        return timer;
    }

    async pauseTimer(gameId) {
        const timer = await this.getTimer(gameId);
        if (!timer) {
            console.error(`[TimerService] pauseTimer: Timer not found for game ${gameId}`);
            return null;
        }
        
        // 일시정지 상태 저장
        timer.isPaused = true;
        timer.pausedAt = Date.now();
        
        // Redis에 저장
        const redis = getRedisClient();
        if (redis) {
            try {
                await redis.setEx(`timer:${gameId}`, 7200, JSON.stringify(timer));
            } catch (error) {
                console.error('Redis timer pause error:', error);
            }
        }
        
        this.timers.set(gameId, timer);
        return timer;
    }

    async resumeTimer(gameId) {
        const timer = await this.getTimer(gameId);
        if (!timer) {
            console.error(`[TimerService] resumeTimer: Timer not found for game ${gameId}`);
            return null;
        }
        
        // 일시정지 상태 해제
        timer.isPaused = false;
        timer.lastUpdate = Date.now(); // 재개 시점으로 업데이트
        
        // Redis에 저장
        const redis = getRedisClient();
        if (redis) {
            try {
                await redis.setEx(`timer:${gameId}`, 7200, JSON.stringify(timer));
            } catch (error) {
                console.error('Redis timer resume error:', error);
            }
        }
        
        this.timers.set(gameId, timer);
        return timer;
    }

    async startTimer(gameId) {
        // startTimer는 resumeTimer와 동일하게 동작
        // 게임이 시작될 때 타이머를 시작하는 용도
        const timer = await this.getTimer(gameId);
        if (!timer) {
            console.error(`[TimerService] startTimer: Timer not found for game ${gameId}`);
            return null;
        }
        
        // 일시정지 상태 해제 (게임 시작)
        timer.isPaused = false;
        timer.lastUpdate = Date.now(); // 시작 시점으로 업데이트
        
        // Redis에 저장
        const redis = getRedisClient();
        if (redis) {
            try {
                await redis.setEx(`timer:${gameId}`, 7200, JSON.stringify(timer));
            } catch (error) {
                console.error('Redis timer start error:', error);
            }
        }
        
        this.timers.set(gameId, timer);
        console.log(`[TimerService] Timer started for game ${gameId}`);
        return timer;
    }
}

module.exports = new TimerService();
