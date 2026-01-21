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
        
        // 게임 준비 상태 (false일 때는 타이머가 감소하지 않음)
        this.gameReady = false;

        this.updateInterval = setInterval(() => {
            this.updateDisplay();
        }, 100);
    }

    updateFromServer(data) {
        const now = Date.now();
        
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
            this.serverBlackByoyomiTime = data.blackByoyomiTime;
            this.blackByoyomiTime = data.blackByoyomiTime;
        }
        if (data.whiteByoyomiTime !== undefined) {
            this.serverWhiteByoyomiTime = data.whiteByoyomiTime;
            this.whiteByoyomiTime = data.whiteByoyomiTime;
        }
        if (data.blackByoyomiPeriods !== undefined) this.blackByoyomiPeriods = data.blackByoyomiPeriods;
        if (data.whiteByoyomiPeriods !== undefined) this.whiteByoyomiPeriods = data.whiteByoyomiPeriods;
        if (data.byoyomiSeconds !== undefined) this.byoyomiSeconds = data.byoyomiSeconds;
        
        this.lastServerUpdate = now;
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
        
        const now = Date.now();
        const elapsed = (now - this.lastServerUpdate) / 1000; // 초 단위
        
        if (this.blackTimerEl) {
            let displayTime;
            if (this.blackInByoyomi && this.currentTurn === 'black') {
                // 초읽기 모드: 서버 시간에서 경과 시간 차감
                displayTime = Math.max(0, this.serverBlackByoyomiTime - elapsed);
            } else if (this.currentTurn === 'black') {
                // 현재 턴: 서버 시간에서 경과 시간 차감
                displayTime = Math.max(0, this.serverBlackTime - elapsed);
            } else {
                // 상대 턴: 서버 시간 그대로 표시 (시간이 흐르지 않음)
                displayTime = Math.max(0, this.serverBlackTime);
            }
            
            const minutes = Math.floor(displayTime / 60);
            const seconds = Math.floor(displayTime % 60);
            this.blackTimerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

            // 타이머 바 업데이트 (실시간으로 시간 소모 표시)
            const blackBar = document.getElementById('blackTimerBar');
            if (blackBar) {
                const barFill = blackBar.querySelector('.timer-bar-fill');
                if (barFill) {
                    // 제한시간 기준으로 바 표시 (초읽기 모드가 아닐 때만)
                    const timeForBar = this.blackInByoyomi ? 0 : displayTime;
                    const percent = Math.max(0, Math.min(100, (timeForBar / initialTotalTime) * 100));
                    barFill.style.width = percent + '%';
                    
                    // 초읽기 모드일 때는 색상 변경
                    if (this.blackInByoyomi && this.currentTurn === 'black') {
                        barFill.style.background = 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)';
                    } else if (displayTime <= 60) {
                        barFill.style.background = 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)';
                    } else if (displayTime <= 300) {
                        barFill.style.background = 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)';
                    } else {
                        barFill.style.background = 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)';
                    }
                }
            }

            this.blackTimerEl.classList.remove('warning', 'danger');
            if (displayTime < 60) {
                this.blackTimerEl.classList.add('danger');
            } else if (displayTime < 300) {
                this.blackTimerEl.classList.add('warning');
            }
        }

        if (this.whiteTimerEl) {
            let displayTime;
            if (this.whiteInByoyomi && this.currentTurn === 'white') {
                // 초읽기 모드: 서버 시간에서 경과 시간 차감
                displayTime = Math.max(0, this.serverWhiteByoyomiTime - elapsed);
            } else if (this.currentTurn === 'white') {
                // 현재 턴: 서버 시간에서 경과 시간 차감
                displayTime = Math.max(0, this.serverWhiteTime - elapsed);
            } else {
                // 상대 턴: 서버 시간 그대로 표시 (시간이 흐르지 않음)
                displayTime = Math.max(0, this.serverWhiteTime);
            }
            
            const minutes = Math.floor(displayTime / 60);
            const seconds = Math.floor(displayTime % 60);
            this.whiteTimerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

            // 타이머 바 업데이트 (실시간으로 시간 소모 표시)
            const whiteBar = document.getElementById('whiteTimerBar');
            if (whiteBar) {
                const barFill = whiteBar.querySelector('.timer-bar-fill');
                if (barFill) {
                    // 제한시간 기준으로 바 표시 (초읽기 모드가 아닐 때만)
                    const timeForBar = this.whiteInByoyomi ? 0 : displayTime;
                    const percent = Math.max(0, Math.min(100, (timeForBar / initialTotalTime) * 100));
                    barFill.style.width = percent + '%';
                    
                    // 초읽기 모드일 때는 색상 변경
                    if (this.whiteInByoyomi && this.currentTurn === 'white') {
                        barFill.style.background = 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)';
                    } else if (displayTime <= 60) {
                        barFill.style.background = 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)';
                    } else if (displayTime <= 300) {
                        barFill.style.background = 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)';
                    } else {
                        barFill.style.background = 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)';
                    }
                }
            }

            this.whiteTimerEl.classList.remove('warning', 'danger');
            if (displayTime < 60) {
                this.whiteTimerEl.classList.add('danger');
            } else if (displayTime < 300) {
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
