const { getRedisClient } = require('../config/redis');

class TimerService {
    constructor() {
        this.timers = new Map();
    }

    async initializeTimer(gameId, timePerPlayer = 30 * 60, options = {}) {
        const byoyomiSeconds = options.byoyomiSeconds !== undefined ? options.byoyomiSeconds : 30;
        const byoyomiPeriods = options.byoyomiPeriods !== undefined ? options.byoyomiPeriods : 5;
        
        // 제한시간이 0이면 처음부터 초읽기 모드로 시작
        const isTimeLimitZero = timePerPlayer === 0;
        const shouldStartInByoyomi = isTimeLimitZero && byoyomiPeriods > 0;
        
        const timerData = {
            gameId: gameId,
            blackTime: timePerPlayer,
            whiteTime: timePerPlayer,
            currentTurn: 'black',
            blackInByoyomi: shouldStartInByoyomi,
            whiteInByoyomi: shouldStartInByoyomi,
            blackByoyomiPeriods: byoyomiPeriods,
            whiteByoyomiPeriods: byoyomiPeriods,
            blackByoyomiTime: shouldStartInByoyomi ? byoyomiSeconds : byoyomiSeconds,
            whiteByoyomiTime: shouldStartInByoyomi ? byoyomiSeconds : byoyomiSeconds,
            byoyomiSeconds: byoyomiSeconds,
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
        
        // 제한시간이 0이면 초읽기 모드로 처리
        const isTimeLimitZero = (timer.blackTime === 0 && timer.whiteTime === 0);
        
        // 이전 턴의 경과 시간 계산 및 차감
        // 초읽기 시간 회복: 이전 턴의 플레이어가 초읽기 모드에 있었고 시간 내에 두었으면 초읽기 시간 회복
        // 중요: 수를 두기 전의 초읽기 시간을 확인해야 함 (차감 전 시간)
        let shouldRecoverBlackByoyomi = false;
        let shouldRecoverWhiteByoyomi = false;
        
        if (timer.lastUpdate) {
            const elapsed = (now - timer.lastUpdate) / 1000; // 초 단위
            
            if (previousTurn === 'black') {
                // 제한시간이 0이면 초읽기 모드로 처리
                if (isTimeLimitZero && timer.blackByoyomiPeriods > 0 && !timer.blackInByoyomi) {
                    timer.blackInByoyomi = true;
                    timer.blackByoyomiTime = timer.byoyomiSeconds;
                }
                
                if (timer.blackInByoyomi) {
                    // 초읽기 시간 회복 체크: 시간 내에 두었는지 확인 (차감 전에 체크)
                    // 중요: 수를 두기 전의 초읽기 시간을 확인해야 함
                    const beforeDeduction = timer.blackByoyomiTime; // 수를 두기 전 초읽기 시간
                    
                    // 경과 시간 차감
                    timer.blackByoyomiTime = Math.max(0, timer.blackByoyomiTime - elapsed);
                    
                    if (timer.blackByoyomiTime <= 0) {
                        // 초읽기 시간이 0초가 되어서 초읽기 횟수를 사용한 후 회복
                        timer.blackByoyomiPeriods = Math.max(0, timer.blackByoyomiPeriods - 1);
                        if (timer.blackByoyomiPeriods > 0) {
                            timer.blackByoyomiTime = timer.byoyomiSeconds;
                        }
                    } else {
                        // 초읽기 시간이 남아있으면 시간 내에 둔 것이므로 회복
                        // 중요: 수를 두기 전 초읽기 시간(beforeDeduction)이 0초보다 크면 시간 내에 둔 것
                        // 단, 이미 회복된 상태(byoyomiSeconds와 같음)에서는 회복하지 않음
                        if (beforeDeduction > 0 && 
                            beforeDeduction < timer.byoyomiSeconds && // 이미 회복된 상태가 아니어야 함
                            elapsed > 0) { // 실제로 시간이 경과했어야 함
                            // 시간 내에 수를 둔 경우: 초읽기 횟수는 차감되지 않고 초읽기 시간만 회복
                            shouldRecoverBlackByoyomi = true;
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
                // 제한시간이 0이면 초읽기 모드로 처리
                if (isTimeLimitZero && timer.whiteByoyomiPeriods > 0 && !timer.whiteInByoyomi) {
                    timer.whiteInByoyomi = true;
                    timer.whiteByoyomiTime = timer.byoyomiSeconds;
                }
                
                if (timer.whiteInByoyomi) {
                    // 초읽기 시간 회복 체크: 시간 내에 두었는지 확인 (차감 전에 체크)
                    // 중요: 수를 두기 전의 초읽기 시간을 확인해야 함
                    const beforeDeduction = timer.whiteByoyomiTime; // 수를 두기 전 초읽기 시간
                    
                    // 경과 시간 차감
                    timer.whiteByoyomiTime = Math.max(0, timer.whiteByoyomiTime - elapsed);
                    
                    if (timer.whiteByoyomiTime <= 0) {
                        // 초읽기 시간이 0초가 되어서 초읽기 횟수를 사용한 후 회복
                        timer.whiteByoyomiPeriods = Math.max(0, timer.whiteByoyomiPeriods - 1);
                        if (timer.whiteByoyomiPeriods > 0) {
                            timer.whiteByoyomiTime = timer.byoyomiSeconds;
                        }
                    } else {
                        // 초읽기 시간이 남아있으면 시간 내에 둔 것이므로 회복
                        // 중요: 수를 두기 전 초읽기 시간(beforeDeduction)이 0초보다 크면 시간 내에 둔 것
                        // 단, 이미 회복된 상태(byoyomiSeconds와 같음)에서는 회복하지 않음
                        if (beforeDeduction > 0 && 
                            beforeDeduction < timer.byoyomiSeconds && // 이미 회복된 상태가 아니어야 함
                            elapsed > 0) { // 실제로 시간이 경과했어야 함
                            // 시간 내에 수를 둔 경우: 초읽기 횟수는 차감되지 않고 초읽기 시간만 회복
                            shouldRecoverWhiteByoyomi = true;
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
        
        // 초읽기 시간 회복: 이전 턴의 플레이어가 초읽기 모드에 있었고 시간 내에 두었으면 초읽기 시간 회복
        // 회복은 차감 후에 처리 (차감 전에 체크한 결과 사용)
        // 중요: 회복은 턴 전환 시점에만 일어나야 하며, 현재 턴의 플레이어가 아닌 이전 턴의 플레이어에 대해서만 회복
        // 초읽기 회복 규칙:
        // 1. 초읽기 시간이 0초가 되어서 초읽기 횟수를 사용한 후 → 회복 (이미 위에서 처리됨, 133-134줄, 172-173줄)
        // 2. 시간 내에 수를 둔 경우 → 초읽기 횟수는 차감되지 않고 초읽기 시간만 회복됨 (아래에서 처리)
        //    단, 초읽기 시간이 거의 0초에 가까울 때만 회복 (1초 이하)
        if (shouldRecoverBlackByoyomi && timer.blackInByoyomi && previousTurn === 'black') {
            // 시간 내에 수를 둔 경우: 초읽기 횟수는 차감되지 않고 초읽기 시간만 회복
            // 회복 전 시간이 byoyomiSeconds와 같거나 더 크면 이미 회복된 상태이므로 회복하지 않음
            if (timer.blackByoyomiTime > 0 && timer.blackByoyomiTime < timer.byoyomiSeconds) {
                const beforeRecovery = timer.blackByoyomiTime;
                timer.blackByoyomiTime = timer.byoyomiSeconds;
                console.log(`[TimerService] switchTurn: Black byoyomi time recovered from ${beforeRecovery.toFixed(2)}s to ${timer.byoyomiSeconds}s (time remaining, no period deduction)`);
            }
        }
        if (shouldRecoverWhiteByoyomi && timer.whiteInByoyomi && previousTurn === 'white') {
            // 시간 내에 수를 둔 경우: 초읽기 횟수는 차감되지 않고 초읽기 시간만 회복
            // 회복 전 시간이 byoyomiSeconds와 같거나 더 크면 이미 회복된 상태이므로 회복하지 않음
            if (timer.whiteByoyomiTime > 0 && timer.whiteByoyomiTime < timer.byoyomiSeconds) {
                const beforeRecovery = timer.whiteByoyomiTime;
                timer.whiteByoyomiTime = timer.byoyomiSeconds;
                console.log(`[TimerService] switchTurn: White byoyomi time recovered from ${beforeRecovery.toFixed(2)}s to ${timer.byoyomiSeconds}s (time remaining, no period deduction)`);
            }
        }
        
        // 중요: 제한시간(blackTime, whiteTime)은 절대 리셋하지 않음 - 턴이 바뀌어도 유지
        // 초읽기는 초읽기 모드에 들어갔을 때만 리셋됨 (위의 로직에서 이미 처리됨)
        // 초읽기 시간 회복: 시간 내에 두면 다음 턴에 초읽기 시간이 회복됨 (위에서 처리)
        
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

        // 제한시간이 0이면 초읽기 모드로 처리
        const isTimeLimitZero = (timer.blackTime === 0 && timer.whiteTime === 0);
        
        if (timer.currentTurn === 'black') {
                // 제한시간이 0이면 초읽기 모드로 처리
                if (isTimeLimitZero && timer.blackByoyomiPeriods > 0 && !timer.blackInByoyomi) {
                    timer.blackInByoyomi = true;
                    timer.blackByoyomiTime = timer.byoyomiSeconds;
                }
                
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
                            timer.blackInByoyomi = true;
                            timer.blackByoyomiTime = timer.byoyomiSeconds;
                        } else {
                             // 시간 초과 (초읽기 없음)
                            timeExpired = true;
                            expiredColor = 'black';
                        }
                    }
                }
            } else {
                // 제한시간이 0이면 초읽기 모드로 처리
                if (isTimeLimitZero && timer.whiteByoyomiPeriods > 0 && !timer.whiteInByoyomi) {
                    timer.whiteInByoyomi = true;
                    timer.whiteByoyomiTime = timer.byoyomiSeconds;
                }
                
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
                            timer.whiteInByoyomi = true;
                            timer.whiteByoyomiTime = timer.byoyomiSeconds;
                        } else {
                             // 시간 초과 (초읽기 없음)
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

    async stopTimer(gameId) {
        // 타이머를 일시정지 상태로 설정하여 더 이상 업데이트되지 않도록 함
        const timer = await this.getTimer(gameId);
        if (!timer) {
            console.log(`[TimerService] stopTimer: Timer not found for game ${gameId} (may already be stopped)`);
            return null;
        }
        
        // 일시정지 상태로 설정
        timer.isPaused = true;
        timer.pausedAt = Date.now();
        
        // Redis에서 삭제 (게임 종료 시 타이머는 더 이상 필요 없음)
        const redis = getRedisClient();
        if (redis) {
            try {
                await redis.del(`timer:${gameId}`);
            } catch (error) {
                console.error('Redis timer delete error:', error);
            }
        }
        
        // 메모리에서도 제거
        this.timers.delete(gameId);
        console.log(`[TimerService] Timer stopped for game ${gameId}`);
        return timer;
    }
}

module.exports = new TimerService();
