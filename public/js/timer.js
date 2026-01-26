// Game Timer
class GameTimer {
    constructor(socket, options = {}) {
        this.socket = socket;
        this.blackTimerEl = document.getElementById(options.blackTimer || 'blackTimer');
        this.whiteTimerEl = document.getElementById(options.whiteTimer || 'whiteTimer');
        this.blackPlayerEl = document.getElementById(options.blackPlayer || 'blackPlayer');
        this.whitePlayerEl = document.getElementById(options.whitePlayer || 'whitePlayer');

        this.blackTime = 30 * 60;
        this.whiteTime = 30 * 60;
        this.currentTurn = 'black';
        this.blackInByoyomi = false;
        this.whiteInByoyomi = false;
        this.blackByoyomiPeriods = 5;
        this.whiteByoyomiPeriods = 5;
        this.blackByoyomiTime = 30;
        this.whiteByoyomiTime = 30;
        this.byoyomiSeconds = 30;
        
        // 서버 시간 동기화를 위한 변수
        this.lastServerUpdate = Date.now();
        this.serverBlackTime = 30 * 60;
        this.serverWhiteTime = 30 * 60;
        this.serverBlackByoyomiTime = 30;
        this.serverWhiteByoyomiTime = 30;
        
        // 네트워크 지연 보정을 위한 변수 (실시간 PVP)
        this.serverTimestamp = Date.now(); // 서버가 보낸 타임스탬프
        this.clientReceiveTime = Date.now(); // 클라이언트가 받은 시간
        this.networkLatency = 0; // 네트워크 지연 (ms)
        this.timeOffset = 0; // 서버-클라이언트 시간 차이
        
        // 로컬 타이머 업데이트를 위한 변수
        this.lastLocalUpdate = null; // 마지막 로컬 업데이트 시점
        
        // 서버 동기화 제한 (무한 루프 방지)
        this.lastSyncTime = 0; // 마지막 서버 동기화 시점
        this.syncCooldown = 1000; // 서버 동기화 쿨다운 (1초)
        this.criticalSyncCooldown = 200; // 시간이 임계값 이하일 때 동기화 쿨다운 (0.2초)
        this.criticalTimeThreshold = 10; // 임계 시간 (10초 이하일 때 더 자주 동기화)
        
        // 게임 준비 상태 (false일 때는 타이머가 감소하지 않음)
        this.gameReady = false;

        // 클라이언트에서 50ms마다 타이머 업데이트 (PVP 정확도 향상)
        this.updateInterval = setInterval(() => {
            // updateLocalTimer는 gameReady일 때만 타이머 감소
            this.updateLocalTimer();
            // updateDisplay는 항상 호출하여 타이머 바 업데이트 (gameReady와 관계없이)
            this.updateDisplay();
        }, 50); // 50ms마다 업데이트 (PVP 정확도 향상)
    }

    updateFromServer(data) {
        const clientReceiveTime = Date.now();
        
        // 서버 타임스탬프가 있으면 네트워크 지연 계산 (실시간 PVP)
        if (data.serverTimestamp !== undefined) {
            this.serverTimestamp = data.serverTimestamp;
            this.clientReceiveTime = clientReceiveTime;
            
            // 네트워크 지연 계산 (왕복 시간의 절반 추정)
            const roundTripTime = clientReceiveTime - data.serverTimestamp;
            this.networkLatency = Math.max(0, roundTripTime / 2);
            
            // 서버 시간 기준으로 정확한 시간 계산
            // 서버가 보낸 시간 + 네트워크 지연 = 실제 서버 시간
            const estimatedServerTime = data.serverTimestamp + this.networkLatency;
            this.timeOffset = estimatedServerTime - clientReceiveTime;
            
            // lastUpdate를 서버의 lastUpdate 기준으로 설정
            if (data.lastUpdate !== undefined && data.lastUpdate > 0) {
                // 서버의 lastUpdate를 클라이언트 시간으로 변환
                const serverLastUpdate = data.lastUpdate;
                const clientTimeForServerUpdate = serverLastUpdate - this.timeOffset;
                this.lastServerUpdate = clientTimeForServerUpdate;
            } else {
                this.lastServerUpdate = clientReceiveTime - this.networkLatency;
            }
        } else {
            // 서버 타임스탬프가 없으면 기존 방식 사용
            this.lastServerUpdate = clientReceiveTime;
        }
        
        if (data.blackTime !== undefined) {
            this.serverBlackTime = data.blackTime;
            this.blackTime = data.blackTime;
        }
        if (data.whiteTime !== undefined) {
            this.serverWhiteTime = data.whiteTime;
            this.whiteTime = data.whiteTime;
        }
        if (data.currentTurn !== undefined) {
            this.currentTurn = data.currentTurn;
            this.updateActivePlayer();
        }
        if (data.blackInByoyomi !== undefined) this.blackInByoyomi = data.blackInByoyomi;
        if (data.whiteInByoyomi !== undefined) this.whiteInByoyomi = data.whiteInByoyomi;
        if (data.blackByoyomiTime !== undefined) {
            const previousByoyomiTime = this.serverBlackByoyomiTime;
            this.serverBlackByoyomiTime = data.blackByoyomiTime;
            this.blackByoyomiTime = data.blackByoyomiTime;
            
            // 초읽기 시간이 리셋되었는지 확인 (이전 값보다 크면 리셋됨)
            // 또는 초읽기 시간이 byoyomiSeconds와 같거나 비슷하면 리셋된 것으로 간주
            const isReset = data.blackByoyomiTime > previousByoyomiTime || 
                           (Math.abs(data.blackByoyomiTime - this.byoyomiSeconds) < 1 && previousByoyomiTime < 5);
            if (isReset) {
                // 초읽기 시간이 리셋되었으므로 서버 업데이트 시점도 리셋
                // data.lastUpdate가 있으면 사용, 없으면 현재 시간 사용
                if (data.lastUpdate !== undefined && data.lastUpdate > 0) {
                    // 서버의 lastUpdate를 클라이언트 시간으로 변환
                    const serverLastUpdate = data.lastUpdate;
                    const clientTimeForServerUpdate = serverLastUpdate - this.timeOffset;
                    this.lastServerUpdate = clientTimeForServerUpdate;
                } else if (data.serverTimestamp !== undefined) {
                    this.lastServerUpdate = clientReceiveTime - this.networkLatency;
                } else {
                    this.lastServerUpdate = clientReceiveTime;
                }
                // 로컬 업데이트 시점도 리셋하여 정확한 감소 시작
                this.lastLocalUpdate = null;
            }
        }
        if (data.whiteByoyomiTime !== undefined) {
            const previousByoyomiTime = this.serverWhiteByoyomiTime;
            this.serverWhiteByoyomiTime = data.whiteByoyomiTime;
            this.whiteByoyomiTime = data.whiteByoyomiTime;
            
            // 초읽기 시간이 리셋되었는지 확인 (이전 값보다 크면 리셋됨)
            // 또는 초읽기 시간이 byoyomiSeconds와 같거나 비슷하면 리셋된 것으로 간주
            const isReset = data.whiteByoyomiTime > previousByoyomiTime || 
                           (Math.abs(data.whiteByoyomiTime - this.byoyomiSeconds) < 1 && previousByoyomiTime < 5);
            if (isReset) {
                // 초읽기 시간이 리셋되었으므로 서버 업데이트 시점도 리셋
                // data.lastUpdate가 있으면 사용, 없으면 현재 시간 사용
                if (data.lastUpdate !== undefined && data.lastUpdate > 0) {
                    // 서버의 lastUpdate를 클라이언트 시간으로 변환
                    const serverLastUpdate = data.lastUpdate;
                    const clientTimeForServerUpdate = serverLastUpdate - this.timeOffset;
                    this.lastServerUpdate = clientTimeForServerUpdate;
                } else if (data.serverTimestamp !== undefined) {
                    this.lastServerUpdate = clientReceiveTime - this.networkLatency;
                } else {
                    this.lastServerUpdate = clientReceiveTime;
                }
                // 로컬 업데이트 시점도 리셋하여 정확한 감소 시작
                this.lastLocalUpdate = null;
            }
        }
        if (data.blackByoyomiPeriods !== undefined) this.blackByoyomiPeriods = data.blackByoyomiPeriods;
        if (data.whiteByoyomiPeriods !== undefined) this.whiteByoyomiPeriods = data.whiteByoyomiPeriods;
        if (data.byoyomiSeconds !== undefined) this.byoyomiSeconds = data.byoyomiSeconds;
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

    // 클라이언트에서 로컬 타이머 감소 (100ms마다 호출)
    updateLocalTimer() {
        // 이전 업데이트 시점 저장 (처음 호출 시 현재 시간으로 초기화)
        const now = Date.now();
        if (!this.lastLocalUpdate) {
            this.lastLocalUpdate = now;
            // gameReady가 false면 타이머 감소 안 함
            if (!this.gameReady) {
                return;
            }
            // 초읽기 시간이 리셋된 직후이면 서버 업데이트 시점도 동기화
            // 서버 업데이트가 최근(2초 이내)이면 현재 시간으로 조정
            if (this.lastServerUpdate > 0) {
                const timeSinceServerUpdate = now - this.lastServerUpdate;
                if (timeSinceServerUpdate < 2000) {
                    this.lastServerUpdate = now;
                }
            }
        }
        
        if (!this.gameReady) {
            // gameReady가 false면 타이머 감소 안 함 (하지만 lastLocalUpdate는 유지)
            return;
        }
        
        // 경과 시간 계산 (50ms마다 호출되므로 약 0.05초)
        const elapsed = (now - this.lastLocalUpdate) / 1000; // 초 단위
        this.lastLocalUpdate = now;
        
        // 서버 시간 기준 경과 시간 계산 (네트워크 지연 보정 포함)
        // PVP 정확도를 위해 더 정확한 서버 시간 추정
        const estimatedServerNow = now + this.timeOffset;
        // lastServerUpdate가 최근 업데이트된 경우에만 서버 시간 사용
        // 너무 오래된 업데이트면 로컬 시간 사용
        const timeSinceLastUpdate = now - (this.lastServerUpdate || now);
        const serverElapsed = (this.lastServerUpdate > 0 && timeSinceLastUpdate < 5000) ? 
            (estimatedServerNow - this.lastServerUpdate) / 1000 : elapsed;
        
        // 현재 턴인 플레이어의 시간만 감소
        if (this.currentTurn === 'black') {
            if (this.blackInByoyomi) {
                // 초읽기 모드: 초읽기 시간 감소 (서버 시간 기준으로 정확한 값 계산)
                this.blackByoyomiTime = Math.max(0, this.serverBlackByoyomiTime - serverElapsed);
                // 초읽기 시간이 0이 되면 서버에 확인 요청 (시간 초과 체크)
                // 시간이 임계값 이하일 때는 더 자주 동기화 (PVP 정확도 향상)
                const now = Date.now();
                const isCriticalTime = this.blackByoyomiTime <= this.criticalTimeThreshold;
                const cooldown = isCriticalTime ? this.criticalSyncCooldown : this.syncCooldown;
                
                if (this.blackByoyomiTime <= 0 && (now - this.lastSyncTime) > cooldown) {
                    if (this.blackByoyomiPeriods > 0) {
                        // 다음 초읽기로 넘어가야 하는지 서버에 확인
                        this.lastSyncTime = now;
                        this.syncWithServer();
                    } else if (this.blackByoyomiPeriods <= 0) {
                        // 시간 초과 가능성 - 서버에 확인
                        this.lastSyncTime = now;
                        this.syncWithServer();
                    }
                } else if (isCriticalTime && (now - this.lastSyncTime) > cooldown) {
                    // 시간이 임계값 이하일 때 주기적으로 동기화 (정확도 향상)
                    this.lastSyncTime = now;
                    this.syncWithServer();
                }
            } else {
                // 일반 모드: 제한 시간 감소
                if (this.blackTime > 0) {
                    this.blackTime = Math.max(0, this.blackTime - elapsed);
                } else {
                    this.blackTime = Math.max(0, this.serverBlackTime - elapsed);
                }
                // 시간이 0이 되면 초읽기로 넘어가야 하는지 서버에 확인
                // 시간이 임계값 이하일 때는 더 자주 동기화 (PVP 정확도 향상)
                const now = Date.now();
                const isCriticalTime = this.blackTime <= this.criticalTimeThreshold;
                const cooldown = isCriticalTime ? this.criticalSyncCooldown : this.syncCooldown;
                
                if (this.blackTime <= 0 && (now - this.lastSyncTime) > cooldown) {
                    if (this.blackByoyomiPeriods > 0) {
                        this.lastSyncTime = now;
                        this.syncWithServer();
                    } else if (this.blackByoyomiPeriods <= 0) {
                        // 시간 초과 가능성 - 서버에 확인
                        this.lastSyncTime = now;
                        this.syncWithServer();
                    }
                } else if (isCriticalTime && (now - this.lastSyncTime) > cooldown) {
                    // 시간이 임계값 이하일 때 주기적으로 동기화 (정확도 향상)
                    this.lastSyncTime = now;
                    this.syncWithServer();
                }
            }
        } else if (this.currentTurn === 'white') {
            if (this.whiteInByoyomi) {
                // 초읽기 모드: 초읽기 시간 감소 (서버 시간 기준으로 정확한 값 계산)
                this.whiteByoyomiTime = Math.max(0, this.serverWhiteByoyomiTime - serverElapsed);
                // 초읽기 시간이 0이 되면 서버에 확인 요청
                // 시간이 임계값 이하일 때는 더 자주 동기화 (PVP 정확도 향상)
                const now = Date.now();
                const isCriticalTime = this.whiteByoyomiTime <= this.criticalTimeThreshold;
                const cooldown = isCriticalTime ? this.criticalSyncCooldown : this.syncCooldown;
                
                if (this.whiteByoyomiTime <= 0 && (now - this.lastSyncTime) > cooldown) {
                    if (this.whiteByoyomiPeriods > 0) {
                        this.lastSyncTime = now;
                        this.syncWithServer();
                    } else if (this.whiteByoyomiPeriods <= 0) {
                        this.lastSyncTime = now;
                        this.syncWithServer();
                    }
                } else if (isCriticalTime && (now - this.lastSyncTime) > cooldown) {
                    // 시간이 임계값 이하일 때 주기적으로 동기화 (정확도 향상)
                    this.lastSyncTime = now;
                    this.syncWithServer();
                }
            } else {
                // 일반 모드: 제한 시간 감소
                if (this.whiteTime > 0) {
                    this.whiteTime = Math.max(0, this.whiteTime - elapsed);
                } else {
                    this.whiteTime = Math.max(0, this.serverWhiteTime - elapsed);
                }
                // 시간이 0이 되면 초읽기로 넘어가야 하는지 서버에 확인
                // 시간이 임계값 이하일 때는 더 자주 동기화 (PVP 정확도 향상)
                const now = Date.now();
                const isCriticalTime = this.whiteTime <= this.criticalTimeThreshold;
                const cooldown = isCriticalTime ? this.criticalSyncCooldown : this.syncCooldown;
                
                if (this.whiteTime <= 0 && (now - this.lastSyncTime) > cooldown) {
                    if (this.whiteByoyomiPeriods > 0) {
                        this.lastSyncTime = now;
                        this.syncWithServer();
                    } else if (this.whiteByoyomiPeriods <= 0) {
                        this.lastSyncTime = now;
                        this.syncWithServer();
                    }
                } else if (isCriticalTime && (now - this.lastSyncTime) > cooldown) {
                    // 시간이 임계값 이하일 때 주기적으로 동기화 (정확도 향상)
                    this.lastSyncTime = now;
                    this.syncWithServer();
                }
            }
        }
        
        // updateTimerBar 함수가 있으면 호출하여 gameRoom.js의 타이머 바도 업데이트
        // window.updateTimerBar로 접근 (gameRoom.js에서 전역으로 노출됨)
        const updateTimerBarFn = typeof window !== 'undefined' ? window.updateTimerBar : null;
        if (updateTimerBarFn && typeof updateTimerBarFn === 'function') {
            const initialTotalTime = typeof window !== 'undefined' && window.initialTotalTime ? window.initialTotalTime : (30 * 60);
            const byoyomiSeconds = this.byoyomiSeconds || 30;
            
            // 초읽기 모드일 때는 항상 초읽기 시간을 전달 (현재 턴이 아니어도 표시)
            // 현재 턴일 때는 실시간으로 감소하는 로컬 타이머 값 사용
            const blackByoyomiTime = this.blackInByoyomi ? 
                (this.currentTurn === 'black' ? this.blackByoyomiTime : this.serverBlackByoyomiTime) : null;
            const whiteByoyomiTime = this.whiteInByoyomi ? 
                (this.currentTurn === 'white' ? this.whiteByoyomiTime : this.serverWhiteByoyomiTime) : null;
            
            // 현재 턴일 때는 로컬 타이머 값 사용, 상대 턴일 때는 서버 시간 사용
            const blackTime = this.currentTurn === 'black' ? this.blackTime : this.serverBlackTime;
            const whiteTime = this.currentTurn === 'white' ? this.whiteTime : this.serverWhiteTime;
            
            // 디버깅 로그 제거 (성능 최적화)
            
            updateTimerBarFn('black', blackTime, initialTotalTime, blackByoyomiTime, this.blackInByoyomi, byoyomiSeconds);
            updateTimerBarFn('white', whiteTime, initialTotalTime, whiteByoyomiTime, this.whiteInByoyomi, byoyomiSeconds);
        }
    }
    
    // 서버와 동기화 요청
    syncWithServer() {
        if (this.socket && this.socket.connected) {
            this.socket.emit('get_timer_sync');
        }
    }

    updateDisplay() {
        // initialTotalTime은 window에서 가져오기 (게임 시작 시 설정된 최대 시간)
        // window.initialTotalTime이 설정되어 있으면 사용, 없으면 서버 시간으로부터 추정
        let initialTotalTime = typeof window !== 'undefined' && window.initialTotalTime ? window.initialTotalTime : null;
        
        // initialTotalTime이 없으면 서버 시간으로부터 추정 (게임 시작 시 서버 시간이 최대 시간이었을 것)
        if (!initialTotalTime) {
            // 서버 시간 중 더 큰 값을 사용 (게임 시작 시 최대 시간이었을 것)
            initialTotalTime = Math.max(this.serverBlackTime, this.serverWhiteTime);
            // 만약 서버 시간이 0이거나 매우 작으면 기본값 사용
            if (initialTotalTime < 60) {
                initialTotalTime = 30 * 60; // 기본 30분
            }
            // window에 저장하여 다음 호출 시 사용
            if (typeof window !== 'undefined') {
                window.initialTotalTime = initialTotalTime;
            }
        }
        
        // gameReady === false일 때는 타이머를 빈 값으로 표시하거나 숨김
        if (!this.gameReady) {
            // 게임 시작 전: 타이머를 빈 값으로 표시하고 타이머 바 숨김
            if (this.blackTimerEl) {
                this.blackTimerEl.textContent = '';
                
                // 타이머 바 숨김
                const blackBar = document.getElementById('blackTimerBar');
                if (blackBar) {
                    blackBar.style.display = 'none';
                    const barFill = blackBar.querySelector('.timer-bar-fill');
                    if (barFill) {
                        barFill.style.width = '0%';
                    }
                }
            }
            if (this.whiteTimerEl) {
                this.whiteTimerEl.textContent = '';
                
                // 타이머 바 숨김
                const whiteBar = document.getElementById('whiteTimerBar');
                if (whiteBar) {
                    whiteBar.style.display = 'none';
                    const barFill = whiteBar.querySelector('.timer-bar-fill');
                    if (barFill) {
                        barFill.style.width = '0%';
                    }
                }
            }
            
            // 초읽기 표시 숨김
            const blackByoyomiDisplay = document.getElementById('blackByoyomiDisplay');
            const whiteByoyomiDisplay = document.getElementById('whiteByoyomiDisplay');
            if (blackByoyomiDisplay) blackByoyomiDisplay.style.display = 'none';
            if (whiteByoyomiDisplay) whiteByoyomiDisplay.style.display = 'none';
            
            return;
        }
        
        // 게임 시작 후: 타이머 바 표시
        const blackBar = document.getElementById('blackTimerBar');
        const whiteBar = document.getElementById('whiteTimerBar');
        if (blackBar) blackBar.style.display = 'block';
        if (whiteBar) whiteBar.style.display = 'block';
        
        if (this.blackTimerEl) {
            let displayTime;
            if (this.blackInByoyomi && this.currentTurn === 'black') {
                // 초읽기 모드: 로컬 타이머 사용 (실시간으로 감소)
                displayTime = this.blackByoyomiTime;
            } else if (this.currentTurn === 'black') {
                // 현재 턴: 로컬 타이머 사용
                displayTime = this.blackTime;
            } else {
                // 상대 턴: 서버 시간 그대로 표시 (시간이 흐르지 않음)
                displayTime = Math.max(0, this.serverBlackTime);
            }
            
            const minutes = Math.floor(displayTime / 60);
            const seconds = Math.floor(displayTime % 60);
            this.blackTimerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

            // 타이머 바 업데이트는 updateTimerBar 함수를 통해 처리 (gameRoom.js와 동기화)
            const updateTimerBarFn = typeof window !== 'undefined' ? window.updateTimerBar : null;
            if (updateTimerBarFn && typeof updateTimerBarFn === 'function') {
                const byoyomiSeconds = this.byoyomiSeconds || 30;
                
                // 초읽기 모드일 때는 항상 초읽기 시간을 전달 (현재 턴이 아니어도 표시)
                const blackByoyomiTime = this.blackInByoyomi ? 
                    (this.currentTurn === 'black' ? this.blackByoyomiTime : this.serverBlackByoyomiTime) : null;
                
                // 현재 턴일 때는 로컬 타이머 값 사용, 상대 턴일 때는 서버 시간 사용
                const blackTime = this.currentTurn === 'black' ? this.blackTime : this.serverBlackTime;
                
                updateTimerBarFn('black', blackTime, initialTotalTime, blackByoyomiTime, this.blackInByoyomi, byoyomiSeconds);
            }

            this.blackTimerEl.classList.remove('warning', 'danger');
            // 초읽기 모드일 때는 초읽기 시간으로 경고 상태 결정
            const timeForWarning = this.blackInByoyomi && this.currentTurn === 'black' ? 
                this.blackByoyomiTime : displayTime;
            if (timeForWarning < 60) {
                this.blackTimerEl.classList.add('danger');
            } else if (timeForWarning < 300) {
                this.blackTimerEl.classList.add('warning');
            }
        }

        if (this.whiteTimerEl) {
            let displayTime;
            if (this.whiteInByoyomi && this.currentTurn === 'white') {
                // 초읽기 모드: 로컬 타이머 사용
                displayTime = this.whiteByoyomiTime;
            } else if (this.currentTurn === 'white') {
                // 현재 턴: 로컬 타이머 사용
                displayTime = this.whiteTime;
            } else {
                // 상대 턴: 서버 시간 그대로 표시 (시간이 흐르지 않음)
                displayTime = Math.max(0, this.serverWhiteTime);
            }
            
            const minutes = Math.floor(displayTime / 60);
            const seconds = Math.floor(displayTime % 60);
            this.whiteTimerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

            // 타이머 바 업데이트는 updateTimerBar 함수를 통해 처리 (gameRoom.js와 동기화)
            const updateTimerBarFn = typeof window !== 'undefined' ? window.updateTimerBar : null;
            if (updateTimerBarFn && typeof updateTimerBarFn === 'function') {
                const byoyomiSeconds = this.byoyomiSeconds || 30;
                
                // 초읽기 모드일 때는 항상 초읽기 시간을 전달 (현재 턴이 아니어도 표시)
                const whiteByoyomiTime = this.whiteInByoyomi ? 
                    (this.currentTurn === 'white' ? this.whiteByoyomiTime : this.serverWhiteByoyomiTime) : null;
                
                // 현재 턴일 때는 로컬 타이머 값 사용, 상대 턴일 때는 서버 시간 사용
                const whiteTime = this.currentTurn === 'white' ? this.whiteTime : this.serverWhiteTime;
                
                updateTimerBarFn('white', whiteTime, initialTotalTime, whiteByoyomiTime, this.whiteInByoyomi, byoyomiSeconds);
            }

            this.whiteTimerEl.classList.remove('warning', 'danger');
            // 초읽기 모드일 때는 초읽기 시간으로 경고 상태 결정
            const timeForWarning = this.whiteInByoyomi && this.currentTurn === 'white' ? 
                this.whiteByoyomiTime : displayTime;
            if (timeForWarning < 60) {
                this.whiteTimerEl.classList.add('danger');
            } else if (timeForWarning < 300) {
                this.whiteTimerEl.classList.add('warning');
            }
        }
    }

    updateTimers(data) {
        this.updateFromServer(data);
    }

    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }
}
