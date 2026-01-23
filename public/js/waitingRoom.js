// WaitingRoom JavaScript
// Socket.IO는 전역에서 사용 가능해야 함
    (function() {
    'use strict';
    
    // 디버깅: 초기 DOM 상태 확인
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            const bodyChildren = Array.from(document.body.children);
            const container = bodyChildren.find(el => el.classList.contains('container') && el.parentElement === document.body);
            const waitingRoomGrid = document.querySelector('.waiting-room-grid');
            
            console.log('=== Initial DOM Check ===');
            console.log('Body children count:', bodyChildren.length);
            console.log('Container in body:', !!container);
            console.log('Waiting room grid exists:', !!waitingRoomGrid);
            if (waitingRoomGrid) {
                console.log('Grid parent:', waitingRoomGrid.parentElement);
                console.log('Grid parent tag:', waitingRoomGrid.parentElement?.tagName);
                console.log('Grid parent class:', waitingRoomGrid.parentElement?.className);
            }
            
            // Container가 없고 Grid가 있으면, Grid의 부모를 body로 이동
            if (!container && waitingRoomGrid) {
                const gridParent = waitingRoomGrid.parentElement;
                if (gridParent && gridParent.classList.contains('container')) {
                    // Container를 찾았지만 body의 직접 자식이 아님
                    if (gridParent.parentElement !== document.body) {
                        console.warn('Container found but not as body direct child, moving...');
                        document.body.appendChild(gridParent);
                    }
                }
            }
        }, 50);
    });
    
    // Socket.IO 초기화 (waitingRoom.ejs에서 socket.io.js가 로드되어 있어야 함)
    if (typeof io === 'undefined') {
        console.error('Socket.IO is not loaded. Make sure socket.io.js is included before this file.');
        return;
    }
    
    const socket = io({
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        timeout: 20000
    });
    
    // EJS 변수는 waitingRoom.ejs에서 window 객체로 전달됨
    const currentUserId = window.WAITING_ROOM_CONFIG?.userId || '';
    const currentUserNickname = window.WAITING_ROOM_CONFIG?.userNickname || '';
        let currentUserStatus = 'waiting';
        let isMatching = false;
        let selectedTargetUser = null;
        let selectedMode = 'CLASSIC';
        let statsModalOpen = false;
        let aiBattleModalOpen = false;

        // 대국 신청 협상 및 타이머 관련 변수
        let originalRequestData = null;
        let requestNegotiationTimer = null;
        let isIncomingRequest = false;
        let currentRequestSenderId = null;
        let isSettingsChanged = false;

        // 대국 신청 타이머 시작
        function startRequestTimer(duration = 30) {
            const container = document.getElementById('requestTimerContainer');
            const bar = document.getElementById('requestTimerBar');
            const text = document.getElementById('requestTimerText');
            
            if (!container || !bar || !text) return;
            
            container.style.display = 'block';
            text.style.display = 'block';
            bar.style.width = '100%';
            
            let timeLeft = duration;
            text.textContent = `${timeLeft}초`;
            
            if (requestNegotiationTimer) clearInterval(requestNegotiationTimer);
            
            requestNegotiationTimer = setInterval(() => {
                timeLeft--;
                text.textContent = `${timeLeft}초`;
                const percentage = (timeLeft / duration) * 100;
                bar.style.width = `${percentage}%`;
                
                if (timeLeft <= 0) {
                    clearInterval(requestNegotiationTimer);
                    handleRequestTimeout();
                }
            }, 1000);
        }

        // 대국 신청 타이머 중지
        function stopRequestTimer() {
            if (requestNegotiationTimer) {
                clearInterval(requestNegotiationTimer);
                requestNegotiationTimer = null;
            }
            const container = document.getElementById('requestTimerContainer');
            const bar = document.getElementById('requestTimerBar');
            const text = document.getElementById('requestTimerText');
            if (container) container.style.display = 'none';
            if (text) text.style.display = 'none';
        }

        // 시간 초과 처리
        function handleRequestTimeout() {
            if (isIncomingRequest) {
                showAlertModal('대국 신청 응답 시간이 초과되어 거절 처리되었습니다.', '안내', 'warning');
                rejectIncomingRequest();
            } else {
                showAlertModal('상대방이 응답이 없어 대국 신청이 취소되었습니다.', '안내', 'warning');
                closeGameRequestModal();
            }
        }

        // 설정 변경 감지 (통합 버전)
        function checkSettingsChanged() {
            if (!isIncomingRequest || !originalRequestData) return;

            const currentSettings = getRequestSettings();
            
            // 주석
            const importantFields = ['mode', 'komi', 'boardSize', 'timeLimit', 'timeIncrement', 'byoyomiSeconds', 'byoyomiPeriods', 'captureTarget', 'baseStones', 'hiddenStones', 'scanCount', 'missileMoveLimit', 'maxMoves'];
            let changed = false;
            
            for (const field of importantFields) {
                const current = currentSettings[field];
                const original = originalRequestData[field];
                
                // undefined? null 泥섎━
                if (current !== original && (current !== undefined || original !== undefined) && (current !== null || original !== null)) {
                    changed = true;
                    break;
                }
            }

            // 주석
            if (!changed && currentSettings.mode === 'MIX' && originalRequestData.mixRules) {
                const currentRules = currentSettings.mixRules || [];
                const originalRules = originalRequestData.mixRules || [];
                if (currentRules.length !== originalRules.length ||
                    !currentRules.every(r => originalRules.includes(r))) {
                    changed = true;
                }
            }

            if (changed !== isSettingsChanged) {
                isSettingsChanged = changed;
                updateActionButtons();
            }
        }

        // 주석
        function updateActionButtons() {
            if (!isIncomingRequest) return;
            
            const acceptBtn = document.getElementById('acceptRequestBtn');
            const modifyBtn = document.getElementById('modifyRequestBtn');
            
            if (isSettingsChanged) {
                // 설정이 변경되었으면 수락 비활성화, 수정제안 활성화
                if (acceptBtn) {
                    acceptBtn.disabled = true;
                    acceptBtn.style.display = 'none';
                }
                if (modifyBtn) {
                    modifyBtn.disabled = false;
                    modifyBtn.style.display = 'block';
                    modifyBtn.textContent = '수정제안';
                }
            } else {
                // 원래 설정이면 수락 활성화, 수정제안 비활성화
                if (acceptBtn) {
                    acceptBtn.disabled = false;
                    acceptBtn.style.display = 'block';
                }
                if (modifyBtn) {
                    modifyBtn.disabled = true;
                    modifyBtn.style.display = 'block';
                    modifyBtn.textContent = '수정제안';
                }
            }
        }

        // 주석
        function collectRequestData() {
            const komiSelect = document.getElementById('komiSelect');
            const komi = (komiSelect && komiSelect.offsetParent !== null) ? parseFloat(komiSelect.value) : 0;
            const colorSelect = document.getElementById('colorSelect');
            const color = colorSelect ? colorSelect.value : 'random';
            const boardSizeSelect = document.getElementById('boardSizeSelect');
            const boardSize = boardSizeSelect ? parseInt(boardSizeSelect.value) : 19;
            
            const data = {
                mode: selectedMode,
                komi: selectedMode === 'BASE' ? 0.5 : komi,
                color: selectedMode === 'BASE' ? 'random' : color, // 좎씠?ㅻ컮?묒? ?쒕뜡?쇰줈 ?ㅼ젙 (?援?떎?먯꽌 ?좏깮)
                boardSize: boardSize
            };

            const timeLimitSelect = document.getElementById('timeLimitSelect');
            const timeIncrementSelect = document.getElementById('timeIncrementSelect');
            const byoyomiSecondsSelect = document.getElementById('byoyomiSecondsSelect');
            const byoyomiPeriodsSelect = document.getElementById('byoyomiPeriodsSelect');

            if (timeLimitSelect) data.timeLimit = parseInt(timeLimitSelect.value);
            if (timeIncrementSelect) data.timeIncrement = parseInt(timeIncrementSelect.value);
            if (byoyomiSecondsSelect) data.byoyomiSeconds = parseInt(byoyomiSecondsSelect.value);
            if (byoyomiPeriodsSelect) data.byoyomiPeriods = parseInt(byoyomiPeriodsSelect.value);
            
            return data;
        }

        const STRATEGY_MODES = [
            { id: 'CLASSIC', name: '일반바둑' },
            { id: 'CAPTURE', name: '캡쳐바둑' },
            { id: 'SPEED', name: '스피드바둑' },
            { id: 'BASE', name: '베이스바둑' },
            { id: 'HIDDEN', name: '히든바둑' },
            { id: 'MISSILE', name: '미사일바둑' },
            { id: 'MIX', name: '믹스바둑' }
        ];

        const CASUAL_MODES = [
            { id: 'DICE', name: '주사위바둑' },
            { id: 'COPS', name: '주사위바둑2' },
            { id: 'OMOK', name: '오목' },
            { id: 'TTAMOK', name: '따목' },
            { id: 'ALKKAGI', name: '알까기' },
            { id: 'CURLING', name: '바둑컬링' }
        ];

        // 주석
        function saveRequestSettings(settings, isAiGame = false) {
            try {
                const key = isAiGame ? 'aiBattleSettings' : 'gameRequestSettings';
                const dataToSave = {
                    ...settings,
                    savedAt: Date.now()
                };
                localStorage.setItem(key, JSON.stringify(dataToSave));
                console.log('[Client] Settings saved:', key, dataToSave);
            } catch (error) {
                console.error('[Client] Error saving settings:', error);
            }
        }

        // 설정 불러오기 (localStorage)
        function loadRequestSettings(isAiGame = false) {
            try {
                const key = isAiGame ? 'aiBattleSettings' : 'gameRequestSettings';
                const saved = localStorage.getItem(key);
                if (saved) {
                    const data = JSON.parse(saved);
                    console.log('[Client] Settings loaded:', key, data);
                    return data;
                }
            } catch (error) {
                console.error('[Client] Error loading settings:', error);
            }
            return null;
        }

        // 설정 변경시 자동 저장
        function saveSettingsOnChange() {
            if (isIncomingRequest) return; // 들어온 신청서는 저장하지 않음
            
            setTimeout(() => {
                const settings = getRequestSettings();
                const isAiGame = !selectedTargetUser;
                
                // AI 레벨 추가
                if (isAiGame) {
                    const aiLevelSelect = document.getElementById('aiLevelSelect');
                    if (aiLevelSelect) {
                        settings.aiLevel = parseInt(aiLevelSelect.value) || 3;
                    }
                }
                
                saveRequestSettings(settings, isAiGame);
            }, 100);
        }

        // 설정 가져오기
        function getRequestSettings() {
            const komiSelect = document.getElementById('komiSelect');
            const komi = komiSelect && komiSelect.style.display !== 'none' ? parseFloat(komiSelect.value) : 0;
            const colorSelect = document.getElementById('colorSelect');
            const color = colorSelect ? colorSelect.value : 'random';
            const boardSizeSelect = document.getElementById('boardSizeSelect');
            const boardSize = boardSizeSelect ? parseInt(boardSizeSelect.value) : 19;
            const timeLimitSelect = document.getElementById('timeLimitSelect');
            const timeLimit = timeLimitSelect ? parseInt(timeLimitSelect.value) : 10;
            const timeIncrementSelect = document.getElementById('timeIncrementSelect');
            const timeIncrement = timeIncrementSelect ? parseInt(timeIncrementSelect.value) : 5;
            const byoyomiSecondsSelect = document.getElementById('byoyomiSecondsSelect');
            const byoyomiSeconds = byoyomiSecondsSelect ? parseInt(byoyomiSecondsSelect.value) : 30;
            const byoyomiPeriodsSelect = document.getElementById('byoyomiPeriodsSelect');
            const byoyomiPeriods = byoyomiPeriodsSelect ? parseInt(byoyomiPeriodsSelect.value) : 5;
            
            console.log('[Client] getRequestSettings:', {
                boardSizeSelect: boardSizeSelect ? boardSizeSelect.value : 'null',
                boardSize: boardSize,
                timeLimitSelect: timeLimitSelect ? timeLimitSelect.value : 'null',
                timeLimit: timeLimit,
                byoyomiSecondsSelect: byoyomiSecondsSelect ? byoyomiSecondsSelect.value : 'null',
                byoyomiSeconds: byoyomiSeconds,
                byoyomiPeriodsSelect: byoyomiPeriodsSelect ? byoyomiPeriodsSelect.value : 'null',
                byoyomiPeriods: byoyomiPeriods
            });

            const settings = {
                mode: selectedMode,
                komi: selectedMode === 'BASE' ? 0.5 : komi,
                color: selectedMode === 'BASE' ? 'random' : color, // 좎씠?ㅻ컮?묒? ?쒕뜡?쇰줈 ?ㅼ젙 (?援?떎?먯꽌 ?좏깮)
                boardSize: boardSize,
                timeLimit: timeLimit,
                timeIncrement: timeIncrement,
                byoyomiSeconds: byoyomiSeconds,
                byoyomiPeriods: byoyomiPeriods
            };
            
            // 모드별 설정 추가
            if (selectedMode === 'CAPTURE') {
                const captureTargetSelect = document.getElementById('captureTargetSelect');
                if (captureTargetSelect) {
                    const value = parseInt(captureTargetSelect.value);
                    if (!isNaN(value) && value > 0) {
                        settings.captureTarget = value;
                    } else {
                        settings.captureTarget = 20; // 기본값
                    }
                } else {
                    settings.captureTarget = 20; // 기본값
                }
                console.log('[Client] getRequestSettings - CAPTURE mode:', {
                    selectedMode: selectedMode,
                    captureTargetSelect: captureTargetSelect ? captureTargetSelect.value : 'null',
                    settingsCaptureTarget: settings.captureTarget
                });
            }
            if (selectedMode === 'BASE') {
                const baseStonesSelect = document.getElementById('baseStonesSelect');
                if (baseStonesSelect && baseStonesSelect.value) {
                    const parsed = parseInt(baseStonesSelect.value);
                    if (!isNaN(parsed) && parsed > 0) {
                        settings.baseStones = parsed;
                    } else {
                        settings.baseStones = 4; // 기본값
                    }
                    console.log('[Client] getRequestSettings BASE mode: baseStonesSelect.value=', baseStonesSelect.value, 'parsed=', parsed, 'settings.baseStones=', settings.baseStones);
                } else {
                    settings.baseStones = 4; // 기본값
                    console.log('[Client] getRequestSettings BASE mode: baseStonesSelect not found or empty, using default 4');
                }
            }
            if (selectedMode === 'HIDDEN') {
                const hiddenStonesSelect = document.getElementById('hiddenStonesSelect');
                if (hiddenStonesSelect) settings.hiddenStones = parseInt(hiddenStonesSelect.value);
                const scanCountSelect = document.getElementById('scanCountSelect');
                if (scanCountSelect) settings.scanCount = parseInt(scanCountSelect.value);
            }
            if (selectedMode === 'MISSILE') {
                const missileMoveLimitSelect = document.getElementById('missileMoveLimitSelect');
                if (missileMoveLimitSelect) settings.missileMoveLimit = parseInt(missileMoveLimitSelect.value);
            }
            if (selectedMode === 'MIX') {
                const mixRulesCheckboxes = document.querySelectorAll('#mixRulesGrid input[type="checkbox"]:checked');
                const mixModes = Array.from(mixRulesCheckboxes).map(cb => cb.value);
                if (mixModes.length >= 2) {
                    settings.mixModes = mixModes;
                }
                const mixModeSwitchCountSelect = document.getElementById('mixModeSwitchCountSelect');
                if (mixModeSwitchCountSelect) settings.mixModeSwitchCount = parseInt(mixModeSwitchCountSelect.value);
            }
            // 주석
            if (selectedMode === 'DICE') {
                const diceRoundsSelect = document.getElementById('diceRoundsSelect');
                if (diceRoundsSelect) settings.maxRounds = parseInt(diceRoundsSelect.value);
            }
            if (selectedMode === 'COPS') {
                const copsRoundsSelect = document.getElementById('copsRoundsSelect');
                if (copsRoundsSelect) settings.maxRounds = parseInt(copsRoundsSelect.value);
            }
            if (selectedMode === 'OMOK') {
                const omokBoardSizeSelect = document.getElementById('omokBoardSizeSelect');
                if (omokBoardSizeSelect) settings.boardSize = parseInt(omokBoardSizeSelect.value);
            }
            
            // 주석
            if (!selectedTargetUser) {
                const autoScoringMoveSelect = document.getElementById('autoScoringMoveSelect');
                if (autoScoringMoveSelect && autoScoringMoveSelect.style.display !== 'none') {
                    const value = parseInt(autoScoringMoveSelect.value);
                    if (!isNaN(value) && value >= 0) {
                        // 0은 제한없음(서로패스시까지)를 의미
                        settings.autoScoringMove = value === 0 ? null : value;
                    }
                }
            }
            if (selectedMode === 'TTAMOK') {
                const ttakTargetSelect = document.getElementById('ttakTargetSelect');
                if (ttakTargetSelect) settings.captureTarget = parseInt(ttakTargetSelect.value);
            }
            if (selectedMode === 'ALKKAGI') {
                const alkkagiRoundsSelect = document.getElementById('alkkagiRoundsSelect');
                if (alkkagiRoundsSelect) settings.maxRounds = parseInt(alkkagiRoundsSelect.value);
                const alkkagiStonesSelect = document.getElementById('alkkagiStonesSelect');
                if (alkkagiStonesSelect) settings.stonesPerRound = parseInt(alkkagiStonesSelect.value);
            }
            if (selectedMode === 'CURLING') {
                const curlingStonesSelect = document.getElementById('curlingStonesSelect');
                if (curlingStonesSelect) settings.stonesPerRound = parseInt(curlingStonesSelect.value);
            }

            if (selectedMode === 'MIX') {
                const selectedRules = [];
                const checkboxes = {
                    'CAPTURE': document.getElementById('mixRuleCapture'),
                    'SPEED': document.getElementById('mixRuleSpeed'),
                    'BASE': document.getElementById('mixRuleBase'),
                    'HIDDEN': document.getElementById('mixRuleHidden'),
                    'MISSILE': document.getElementById('mixRuleMissile')
                };

                Object.keys(checkboxes).forEach(rule => {
                    if (checkboxes[rule] && checkboxes[rule].checked) {
                        selectedRules.push(rule);
                    }
                });
                settings.mixRules = selectedRules;
                
                // 주석
                const captureTarget = document.getElementById('mixCaptureTargetSelect');
                if (captureTarget) settings.mixCaptureTarget = parseInt(captureTarget.value);
                
                const mixTimeLimit = document.getElementById('mixTimeLimitSelect');
                if (mixTimeLimit) settings.mixTimeLimit = parseInt(mixTimeLimit.value);
                
                const mixTimeIncrement = document.getElementById('mixTimeIncrementSelect');
                if (mixTimeIncrement) settings.mixTimeIncrement = parseInt(mixTimeIncrement.value);
                
                const baseCount = document.getElementById('mixBaseCountSelect');
                if (baseCount) settings.mixBaseCount = parseInt(baseCount.value);
                
                const hiddenCount = document.getElementById('mixHiddenCountSelect');
                if (hiddenCount) settings.mixHiddenCount = parseInt(hiddenCount.value);
                
                const scanCount = document.getElementById('mixScanCountSelect');
                if (scanCount) settings.mixScanCount = parseInt(scanCount.value);
                
                const missileMove = document.getElementById('mixMissileMoveLimitSelect');
                if (missileMove) settings.mixMissileMoveLimit = parseInt(missileMove.value);
            }

            return settings;
        }


        // 수정제안 보내기
        function modifyRequest() {
            if (!selectedTargetUser || !isIncomingRequest) return;
            
            const settings = getRequestSettings();
            
            // 수정제안 버튼으로 전송
            socket.emit('modify_game_request', {
                targetUserId: selectedTargetUser.id,
                mode: settings.mode,
                komi: settings.komi,
                captureTarget: settings.captureTarget,
                timeLimit: settings.timeLimit,
                timeIncrement: settings.timeIncrement,
                baseStones: settings.baseStones,
                hiddenStones: settings.hiddenStones,
                scanCount: settings.scanCount,
                missileMoveLimit: settings.missileMoveLimit,
                boardSize: settings.boardSize,
                byoyomiSeconds: settings.byoyomiSeconds,
                byoyomiPeriods: settings.byoyomiPeriods,
                mixRules: settings.mixRules,
                mixCaptureTarget: settings.mixCaptureTarget,
                mixTimeLimit: settings.mixTimeLimit,
                mixTimeIncrement: settings.mixTimeIncrement,
                mixBaseCount: settings.mixBaseCount,
                mixHiddenCount: settings.mixHiddenCount,
                mixScanCount: settings.mixScanCount,
                mixMissileMoveLimit: settings.mixMissileMoveLimit
            });
            
            // 상태 리셋: 기본 설정으로 리셋
            isIncomingRequest = false;
            originalRequestData = settings;
            isSettingsChanged = false;
            
            const senderButtons = document.getElementById('senderActionButtons');
            const receiverButtons = document.getElementById('receiverActionButtons');
            if (senderButtons) senderButtons.style.display = 'flex';
            if (receiverButtons) receiverButtons.style.display = 'none';
            
            stopRequestTimer();
            startRequestTimer(30);
        }

        function openGameRequestModal(targetUser = null, isIncoming = false, requestData = null) {
            console.log('=== openGameRequestModal START ===', targetUser, isIncoming, requestData);
            try {
                selectedTargetUser = targetUser;
                isIncomingRequest = isIncoming;
                originalRequestData = requestData;
                isSettingsChanged = false;
                
                const modal = document.getElementById('gameRequestModal');
                if (!modal) {
                    console.error('gameRequestModal element not found');
                    showAlertModal('모달을 찾을 수 없습니다. 페이지를 새로고침해주세요.', '오류', 'error');
                    return;
                }
                
                // 주석
                const content = modal.querySelector('.stats-modal-content');
                if (content) {
                    // 주석
                    if (window.innerWidth <= 768) {
                        content.style.setProperty('position', 'relative', 'important');
                        content.style.setProperty('left', 'auto', 'important');
                        content.style.setProperty('top', 'auto', 'important');
                        content.style.setProperty('transform', 'none', 'important');
                        content.style.setProperty('margin', 'auto', 'important');
                    } else {
                        // 주석
                        const checkbox = document.getElementById('requestModalRememberPosition');
                        if (!checkbox || !checkbox.checked) {
                            content.style.position = '';
                            content.style.left = '';
                            content.style.top = '';
                            content.style.transform = '';
                            content.style.margin = 'auto'; // 以묒븰 ?뺣젹
                        }
                    }
                }

                const senderButtons = document.getElementById('senderActionButtons');
                const receiverButtons = document.getElementById('receiverActionButtons');
                
                // 주석

                if (isIncoming) {
                    if (senderButtons) senderButtons.style.display = 'none';
                    if (receiverButtons) receiverButtons.style.display = 'flex';
                    updateActionButtons();
                    startRequestTimer(30);
                } else {
                    if (senderButtons) senderButtons.style.display = 'flex';
                    if (receiverButtons) receiverButtons.style.display = 'none';
                    // 주석
                }

                const titleEl = document.getElementById('requestModalTitle');
                const aiSection = document.getElementById('aiLevelSection');
                const categoryTitle = document.getElementById('requestCategoryTitle');
                const modeList = document.getElementById('requestModeList');

                const currentRoomType = window.WAITING_ROOM_CONFIG?.roomType || 'strategy';
                titleEl.textContent = isIncoming ? '대국 신청 도착' : (targetUser ? '대국 신청' : 'AI봇 대결 설정');
                if (categoryTitle) categoryTitle.textContent = currentRoomType === 'strategy' ? '전략바둑' : '놀이바둑';
                
                const rightPanel = document.getElementById('requestRightPanel');
                const sidebar = document.querySelector('.request-sidebar');
                
                const viewProfileBtn = document.getElementById('viewProfileBtn');
                const isMobile = window.innerWidth <= 768;
                
                if (targetUser) {
                    // 주석
                    if (isMobile) {
                        if (rightPanel) {
                            rightPanel.style.display = 'none';
                            rightPanel.classList.remove('show');
                        }
                        if (viewProfileBtn) {
                            viewProfileBtn.style.display = 'block';
                        }
                    } else {
                        if (rightPanel) {
                            rightPanel.style.display = 'flex';
                            rightPanel.classList.remove('hidden');
                        }
                        if (viewProfileBtn) {
                            viewProfileBtn.style.display = 'none';
                        }
                    }
                    if (sidebar) sidebar.classList.remove('full-width');
                    const avatarEl = document.getElementById('targetUserAvatar');
                    const nicknameEl = document.getElementById('targetUserNickname');
                    const ratingEl = document.getElementById('targetUserRating');
                    const mannerEl = document.getElementById('targetUserManner');
                    if (avatarEl) avatarEl.textContent = targetUser.nickname ? targetUser.nickname.charAt(0).toUpperCase() : '?';
                    if (nicknameEl) nicknameEl.textContent = targetUser.nickname || '놁쓬';
                    if (ratingEl) ratingEl.textContent = `레이팅: ${targetUser.rating || 0}`;
                    if (mannerEl) mannerEl.textContent = `매너: ${targetUser.manner || targetUser.mannerScore || 1500}`;
                    updateTargetUserStats(requestData ? requestData.mode : 'CLASSIC');
                    if (aiSection) aiSection.style.display = 'none';
                } else {
                    if (rightPanel) {
                        rightPanel.style.display = 'none';
                        rightPanel.classList.add('hidden');
                        rightPanel.classList.remove('show');
                    }
                    if (viewProfileBtn) {
                        viewProfileBtn.style.display = 'none';
                    }
                    if (sidebar) sidebar.classList.add('full-width');
                    if (aiSection) aiSection.style.display = currentRoomType === 'strategy' ? 'block' : 'none';
                }

                const modes = currentRoomType === 'strategy' ? STRATEGY_MODES : CASUAL_MODES;
                selectedMode = requestData ? requestData.mode : (modes[0] ? modes[0].id : 'CLASSIC');
                
                modeList.innerHTML = modes.map(mode => `
                    <button class="request-mode-item ${mode.id === selectedMode ? 'active' : ''}" 
                            onclick="selectRequestMode('${mode.id}')" data-mode="${mode.id}">
                        ${mode.name}
                    </button>
                `).join('');

                if (requestData) {
                    applyRequestSettings(requestData);
                } else {
                    // 주석
                    const isAiGame = !targetUser;
                    const savedSettings = loadRequestSettings(isAiGame);
                    if (savedSettings) {
                        // 주석
                        if (savedSettings.mode) {
                            selectedMode = savedSettings.mode;
                            // 주석
                            modeList.innerHTML = modes.map(mode => `
                                <button class="request-mode-item ${mode.id === selectedMode ? 'active' : ''}" 
                                        onclick="selectRequestMode('${mode.id}')" data-mode="${mode.id}">
                                    ${mode.name}
                                </button>
                            `).join('');
                        }
                        // ??λ맂 ?ㅼ젙 ?곸슜
                        setTimeout(() => {
                            applyRequestSettings(savedSettings);
                        }, 100);
                    } else {
                        selectRequestMode(selectedMode);
                    }
                }

                // 주석
                setTimeout(() => {
                    const inputs = modal.querySelectorAll('select, input[type="checkbox"]');
                    inputs.forEach(input => {
                        input.removeEventListener('change', checkSettingsChanged);
                        input.addEventListener('change', checkSettingsChanged);
                        // 주석
                        input.removeEventListener('change', saveSettingsOnChange);
                        input.addEventListener('change', saveSettingsOnChange);
                    });
                }, 500);

                // 주석
                const boardSizeSelect = document.getElementById('boardSizeSelect');
                if (boardSizeSelect) {
                    boardSizeSelect.addEventListener('change', updateAutoScoringOptions);
                    // 주석
                    updateAutoScoringOptions();
                }
                
                // 덤 옵션 동적 생성 (0.5집부터 20.5집까지 0.5집 단위, 정수 제외)
                const komiSelect = document.getElementById('komiSelect');
                if (komiSelect) {
                    komiSelect.innerHTML = '';
                    for (let i = 0; i <= 40; i++) {
                        const value = 0.5 + (i * 0.5);
                        // 정수 값 제외 (무승부 방지)
                        if (value % 1 !== 0) {
                            const option = document.createElement('option');
                            option.value = value;
                            option.textContent = `${value}집`;
                            if (value === 6.5) {
                                option.selected = true;
                            }
                            komiSelect.appendChild(option);
                        }
                    }
                }

                modal.style.setProperty('display', 'flex', 'important');
                modal.style.setProperty('visibility', 'visible', 'important');
                modal.style.setProperty('opacity', '1', 'important');
                modal.classList.add('show');
                aiBattleModalOpen = true;
                document.body.style.overflow = 'hidden';
                loadModalPosition('gameRequestModal', 'requestModalRememberPosition');
            } catch (error) {
                console.error('CRITICAL ERROR in openGameRequestModal:', error);
            }
        }

        // 주석
        function applyRequestSettings(data) {
            selectedMode = data.mode;
            selectRequestMode(data.mode);
            
            setTimeout(() => {
                const komiSelect = document.getElementById('komiSelect');
                if (komiSelect && data.komi !== undefined && data.komi !== null) komiSelect.value = data.komi;
                
                const boardSizeSelect = document.getElementById('boardSizeSelect');
                if (boardSizeSelect && data.boardSize) {
                    boardSizeSelect.value = data.boardSize;
                    // 주석
                    updateAutoScoringOptions();
                }
                
                const colorSelect = document.getElementById('colorSelect');
                if (colorSelect && data.color) colorSelect.value = data.color;
                
                // 주석
                const aiLevelSelect = document.getElementById('aiLevelSelect');
                if (aiLevelSelect && data.aiLevel) aiLevelSelect.value = data.aiLevel;

                const timeLimitSelect = document.getElementById('timeLimitSelect');
                if (timeLimitSelect && data.timeLimit) timeLimitSelect.value = data.timeLimit;

                const timeIncrementSelect = document.getElementById('timeIncrementSelect');
                if (timeIncrementSelect && data.timeIncrement) timeIncrementSelect.value = data.timeIncrement;

                const byoyomiSecondsSelect = document.getElementById('byoyomiSecondsSelect');
                if (byoyomiSecondsSelect && data.byoyomiSeconds) byoyomiSecondsSelect.value = data.byoyomiSeconds;

                const byoyomiPeriodsSelect = document.getElementById('byoyomiPeriodsSelect');
                if (byoyomiPeriodsSelect && data.byoyomiPeriods) byoyomiPeriodsSelect.value = data.byoyomiPeriods;
                
                // 주석
                const autoScoringMoveSelect = document.getElementById('autoScoringMoveSelect');
                if (autoScoringMoveSelect && data.autoScoringMove !== undefined && data.autoScoringMove !== null) {
                    // null이면 0으로 설정 (제한없음)
                    autoScoringMoveSelect.value = data.autoScoringMove === null ? '0' : data.autoScoringMove;
                }
                
                if (data.mode === 'MIX' && data.mixRules) {
                    data.mixRules.forEach(rule => {
                        const cb = document.getElementById(`mixRule${rule.charAt(0).toUpperCase() + rule.slice(1).toLowerCase()}`);
                        if (cb) {
                            cb.checked = true;
                            cb.dispatchEvent(new Event('change'));
                        }
                    });
                    
                    setTimeout(() => {
                        if (data.mixCaptureTarget) document.getElementById('mixCaptureTargetSelect').value = data.mixCaptureTarget;
                        if (data.mixTimeLimit) document.getElementById('mixTimeLimitSelect').value = data.mixTimeLimit;
                        if (data.mixTimeIncrement) document.getElementById('mixTimeIncrementSelect').value = data.mixTimeIncrement;
                        if (data.mixBaseCount) document.getElementById('mixBaseCountSelect').value = data.mixBaseCount;
                        if (data.mixHiddenCount) document.getElementById('mixHiddenCountSelect').value = data.mixHiddenCount;
                        if (data.mixScanCount) document.getElementById('mixScanCountSelect').value = data.mixScanCount;
                        if (data.mixMissileMoveLimit) document.getElementById('mixMissileMoveLimitSelect').value = data.mixMissileMoveLimit;
                        
                        isSettingsChanged = false;
                        updateActionButtons();
                    }, 200);
                } else {
                    // 주석
                    if (data.mode === 'CAPTURE' && data.captureTarget) {
                        const captureTargetSelect = document.getElementById('captureTargetSelect');
                        if (captureTargetSelect) captureTargetSelect.value = data.captureTarget;
                    }
                    if (data.mode === 'BASE' && data.baseStones) {
                        const baseStonesSelect = document.getElementById('baseStonesSelect');
                        if (baseStonesSelect) baseStonesSelect.value = data.baseStones;
                    }
                    if (data.mode === 'HIDDEN' && data.hiddenStones) {
                        const hiddenStonesSelect = document.getElementById('hiddenStonesSelect');
                        if (hiddenStonesSelect) hiddenStonesSelect.value = data.hiddenStones;
                        const scanCountSelect = document.getElementById('scanCountSelect');
                        if (scanCountSelect && data.scanCount) scanCountSelect.value = data.scanCount;
                    }
                    if (data.mode === 'MISSILE' && data.missileMoveLimit) {
                        const missileMoveLimitSelect = document.getElementById('missileMoveLimitSelect');
                        if (missileMoveLimitSelect) missileMoveLimitSelect.value = data.missileMoveLimit;
                    }
                    // 주석
                    if (data.mode === 'DICE' && data.maxRounds) {
                        const diceRoundsSelect = document.getElementById('diceRoundsSelect');
                        if (diceRoundsSelect) diceRoundsSelect.value = data.maxRounds;
                    }
                    if (data.mode === 'COPS' && data.maxRounds) {
                        const copsRoundsSelect = document.getElementById('copsRoundsSelect');
                        if (copsRoundsSelect) copsRoundsSelect.value = data.maxRounds;
                    }
                    if (data.mode === 'OMOK' && data.boardSize) {
                        const omokBoardSizeSelect = document.getElementById('omokBoardSizeSelect');
                        if (omokBoardSizeSelect) omokBoardSizeSelect.value = data.boardSize;
                    }
                    if (data.mode === 'TTAMOK' && data.captureTarget) {
                        const ttakTargetSelect = document.getElementById('ttakTargetSelect');
                        if (ttakTargetSelect) ttakTargetSelect.value = data.captureTarget;
                    }
                    if (data.mode === 'ALKKAGI') {
                        if (data.maxRounds) {
                            const alkkagiRoundsSelect = document.getElementById('alkkagiRoundsSelect');
                            if (alkkagiRoundsSelect) alkkagiRoundsSelect.value = data.maxRounds;
                        }
                        if (data.stonesPerRound) {
                            const alkkagiStonesSelect = document.getElementById('alkkagiStonesSelect');
                            if (alkkagiStonesSelect) alkkagiStonesSelect.value = data.stonesPerRound;
                        }
                    }
                    if (data.mode === 'CURLING' && data.stonesPerRound) {
                        const curlingStonesSelect = document.getElementById('curlingStonesSelect');
                        if (curlingStonesSelect) curlingStonesSelect.value = data.stonesPerRound;
                    }
                    
                    isSettingsChanged = false;
                    updateActionButtons();
                }
                
                // 주석
                setTimeout(() => {
                    checkSettingsChanged();
                }, 300);
            }, 100);
        }

        function selectRequestMode(modeId) {
            selectedMode = modeId;
            document.querySelectorAll('.request-mode-item').forEach(el => {
                el.classList.toggle('active', el.dataset.mode === modeId);
            });
            
            // 주석
            if (selectedTargetUser) {
                updateTargetUserStats(modeId);
            }
            

            const modeSpecificSettingsSection = document.getElementById('modeSpecificSettingsSection');
            if (modeSpecificSettingsSection) modeSpecificSettingsSection.style.display = 'none';
            

            const timeLimitItem = document.getElementById('timeLimitItem');
            const timeIncrementItem = document.getElementById('timeIncrementItem');
            const byoyomiItem = document.getElementById('byoyomiItem');
            const byoyomiPeriodsItem = document.getElementById('byoyomiPeriodsItem');
            const timeSettingsSection = document.getElementById('timeSettingsSection');
                        // 모든 시간 설정 숨기기
            if (timeLimitItem) timeLimitItem.style.display = 'none';
            if (timeIncrementItem) timeIncrementItem.style.display = 'none';
            if (byoyomiItem) byoyomiItem.style.display = 'none';
            if (byoyomiPeriodsItem) byoyomiPeriodsItem.style.display = 'none';
            if (timeSettingsSection) timeSettingsSection.style.display = 'none';
            
            // 주석
            updateModeSpecificSettings(modeId);
            
            // ?쒓컙 ?ㅼ젙 ?쒖떆/?④? ?낅뜲?댄듃
            const timeSettingsRow = document.getElementById('timeSettingsRow');
            if (modeId === 'SPEED') {
                // 주석
                if (timeLimitItem) timeLimitItem.style.display = 'block';
                if (timeSettingsSection) timeSettingsSection.style.display = 'block';
                if (timeIncrementItem) timeIncrementItem.style.display = 'block';
                if (byoyomiItem) byoyomiItem.style.display = 'none';
                if (byoyomiPeriodsItem) byoyomiPeriodsItem.style.display = 'none';
                if (timeSettingsRow) {
                    timeSettingsRow.style.display = 'grid';
                    timeSettingsRow.style.gridTemplateColumns = 'repeat(2, 1fr)';
                }
            } else if (modeId === 'CAPTURE') {
                // 주석
                if (timeLimitItem) timeLimitItem.style.display = 'block';
                if (timeSettingsSection) timeSettingsSection.style.display = 'block';
                if (byoyomiItem) byoyomiItem.style.display = 'block';
                if (byoyomiPeriodsItem) byoyomiPeriodsItem.style.display = 'block';
                if (timeIncrementItem) timeIncrementItem.style.display = 'none';
                if (timeSettingsRow) {
                    timeSettingsRow.style.display = 'grid';
                    timeSettingsRow.style.gridTemplateColumns = 'repeat(3, 1fr)';
                }
                
                // 캡쳐바둑 모드에서는 바둑판 크기를 9줄, 13줄만 허용 (19줄 제외)
                const boardSizeSelect = document.getElementById('boardSizeSelect');
                if (boardSizeSelect) {
                    const currentValue = boardSizeSelect.value;
                    boardSizeSelect.innerHTML = '';
                    
                    const option9 = document.createElement('option');
                    option9.value = '9';
                    option9.textContent = '9줄';
                    if (currentValue === '9') option9.selected = true;
                    boardSizeSelect.appendChild(option9);
                    
                    const option13 = document.createElement('option');
                    option13.value = '13';
                    option13.textContent = '13줄';
                    if (currentValue === '13' || currentValue === '19') option13.selected = true; // 19줄이 선택되어 있으면 13줄로 변경
                    boardSizeSelect.appendChild(option13);
                }
            } else if (modeId !== 'MIX') {
                // 주석
                const casualModes = ['DICE', 'COPS', 'OMOK', 'TTAMOK', 'ALKKAGI', 'CURLING'];
                const isCasualMode = casualModes.includes(modeId);
                
                if (isCasualMode) {
                    // 주석
                    if (timeSettingsSection) timeSettingsSection.style.display = 'none';
                } else {
                    // 주석
                    if (timeLimitItem) timeLimitItem.style.display = 'block';
                    if (timeSettingsSection) timeSettingsSection.style.display = 'block';
                    if (byoyomiItem) byoyomiItem.style.display = 'block';
                    if (byoyomiPeriodsItem) byoyomiPeriodsItem.style.display = 'block';
                    if (timeIncrementItem) timeIncrementItem.style.display = 'none';
                    
                    // 주석
                    const autoScoringItem = document.getElementById('autoScoringItem');
                    if (autoScoringItem) {
                        if (!selectedTargetUser) {
                            // AI ?援?                            autoScoringItem.style.display = 'block';
                            updateAutoScoringOptions(); // 붾몣ш린留욊쾶 ?듭뀡 ?낅뜲?댄듃
                        } else {
                            // ?좎? ?援?                            autoScoringItem.style.display = 'none';
                        }
                    }
                    
                    // 주석
                    
                    if (timeSettingsRow) {
                        // 주석
                        timeSettingsRow.style.gridTemplateColumns = 'repeat(3, 1fr)';
                    }
                }
            } else {
                // 주석
                if (timeSettingsSection) timeSettingsSection.style.display = 'none';
            }
            
            // 주석
            setTimeout(() => {
                const casualModes = ['DICE', 'COPS', 'OMOK', 'TTAMOK', 'ALKKAGI', 'CURLING'];
                const isCasualMode = casualModes.includes(modeId);
                
                if (modeId === 'MIX') {
                    // 주석
                } else if (modeId === 'CAPTURE' || modeId === 'BASE' || isCasualMode) {
                    // 주석
                    const komiItem = document.getElementById('komiSettingItem');
                    if (komiItem) komiItem.style.display = 'none';
                } else {
                    // 주석
                    const komiItem = document.getElementById('komiSettingItem');
                    if (komiItem) komiItem.style.display = 'block';
                }
                
                // 주석
                if (!selectedTargetUser) {
                    // 주석
                    updateAutoScoringOptions();
                } else {
                    // 주석
                    const basicSettingsRow = document.getElementById('basicSettingsRow');
                    if (basicSettingsRow) {
                        const komiSettingItem = document.getElementById('komiSettingItem');
                        const visibleItems = 1 +
                            (komiSettingItem && komiSettingItem.style.display !== 'none' ? 1 : 0); // Komi
                        
                        if (visibleItems > 2) {
                            basicSettingsRow.style.gridTemplateColumns = 'repeat(3, 1fr)';
                        } else {
                            basicSettingsRow.style.gridTemplateColumns = 'repeat(2, 1fr)';
                        }
                    }
                }
                
                // 주석
                const colorSelectItem = document.querySelector('#aiLevelSection .setting-item:last-child');
                if (colorSelectItem) {
                    if (modeId === 'BASE') {
                        colorSelectItem.style.display = 'none';
                    } else {
                        colorSelectItem.style.display = '';
                    }
                }
            }, 100);
        }

        // 주석
        function updateAutoScoringOptions() {
            const boardSizeSelect = document.getElementById('boardSizeSelect');
            const autoScoringMoveSelect = document.getElementById('autoScoringMoveSelect');
            const autoScoringItem = document.getElementById('autoScoringItem');
            const basicSettingsRow = document.getElementById('basicSettingsRow');
            
            if (!boardSizeSelect || !autoScoringMoveSelect || !autoScoringItem) return;
            
            const boardSize = parseInt(boardSizeSelect.value) || 19;
            const isAiGame = !selectedTargetUser;
            
            // AI ?援?씪 ?뚮쭔 ?쒖떆
            if (isAiGame) {
                autoScoringItem.style.display = 'block';
                
                // 주석
                if (basicSettingsRow) {
                    // 주석
                    // 주석
                    const komiSettingItem = document.getElementById('komiSettingItem');
                    const visibleItems = 1 +
                        (komiSettingItem && komiSettingItem.style.display !== 'none' ? 1 : 0) + // Komi
                        1; // 자동 종료 (보드 사이즈에 따라 표시)
                    
                    if (visibleItems > 2) {
                        basicSettingsRow.style.gridTemplateColumns = 'repeat(3, 1fr)';
                    } else {
                        basicSettingsRow.style.gridTemplateColumns = 'repeat(2, 1fr)';
                    }
                }
                
                // 주석
                let options = [];
                if (boardSize === 9) {
                    options = [60, 70, 80, 90, 100];
                } else if (boardSize === 13) {
                    options = [80, 90, 100, 110, 120, 130, 140, 150];
                } else if (boardSize === 19) {
                    options = [100, 130, 160, 190, 220, 250, 280];
                } else {
                    // 주석
                    options = [100, 130, 160, 190, 220, 250, 280];
                }
                

            const currentValue = autoScoringMoveSelect.value;
                
                // 주석
                autoScoringMoveSelect.innerHTML = '';
                
                // 제한없음(서로패스시까지) 옵션 추가
                const unlimitedOption = document.createElement('option');
                unlimitedOption.value = '0';
                unlimitedOption.textContent = '제한없음(서로패스시까지)';
                if (currentValue === '0' || currentValue === '' || currentValue === null) {
                    unlimitedOption.selected = true;
                }
                autoScoringMoveSelect.appendChild(unlimitedOption);
                
                // 주석
                let foundCurrent = false;
                options.forEach((move) => {
                    const option = document.createElement('option');
                    option.value = move;
                    option.textContent = `${move}`;
                    if (currentValue && parseInt(currentValue) === move) {
                        option.selected = true;
                        foundCurrent = true;
                    } else if (!currentValue && move === options[Math.floor(options.length / 2)]) {
                        // 주석
                    }
                    autoScoringMoveSelect.appendChild(option);
                });
                
                // 주석
                if (currentValue && !foundCurrent && currentValue !== '0') {
                    autoScoringMoveSelect.selectedIndex = 0;
                }
            } else {
                autoScoringItem.style.display = 'none';
                
                // 주석
                if (basicSettingsRow) {
                    const komiSettingItem = document.getElementById('komiSettingItem');
                    const visibleItems = 1 +
        // 주석

                        (komiSettingItem && komiSettingItem.style.display !== 'none' ? 1 : 0); // Komi)
                    
                    if (visibleItems > 2) {
                        basicSettingsRow.style.gridTemplateColumns = 'repeat(3, 1fr)';
                    } else {
                        basicSettingsRow.style.gridTemplateColumns = 'repeat(2, 1fr)';
                    }
                }
            }
        }

        // 주석
        function updateGameDescription(modeId) {
            const descriptionEl = document.getElementById('gameDescription');
            if (!descriptionEl) return;
            
            const descriptions = {
                CLASSIC: {
                    title: 'Classic',
                    text: 'Standard game with komi applied.',
                },
                CAPTURE: {
                    title: 'Capture',
                    text: 'Win by capturing the target number of stones.',
                },
                SPEED: {
                    title: 'Speed',
                    text: 'Faster pace with shorter time controls.',
                },
                BASE: {
                    title: 'Base',
                    text: 'Place bases to gain points for control.',
                },
                HIDDEN: {
                    title: 'Hidden',
                    text: 'Stones are hidden until revealed by play.',
                },
                MISSILE: {
                    title: 'Missile',
                    text: 'Special attacks can remove stones in a line.',
                },
                MIX: {
                    title: 'Mix',
                    text: 'Mixed ruleset combining multiple modes.',
                },
                DICE: {
                    title: 'Dice',
                    text: 'Random effects influence the match.',
                },
                COPS: {
                    title: 'Cops',
                    text: 'Gain points for controlling key areas.',
                },
                OMOK: {
                    title: 'Omok',
                    text: 'Win by connecting five in a row.',
                },
                TTAMOK: {
                    title: 'Ttamok',
                    text: 'Special capture rules apply in this mode.',
                },
                ALKKAGI: {
                    title: 'Alkkagi',
                    text: 'Flick stones to knock opponent stones out.',
                },
                CURLING: {
                    title: 'Curling',
                    text: 'Score based on stone positions after rounds.',
                },
            };
            
            const desc = descriptions[modeId] || { title: '뚯엫', text: '뚯엫 ?ㅻ챸놁뒿?덈떎.' };
            descriptionEl.innerHTML = `
                <div class="description-title">${desc.title}</div>
                <p class="description-text">${desc.text}</p>
            `;
            
            // 주석
            const profileBox = document.getElementById('requestProfileBox');
            const topSection = document.querySelector('.request-top-section');
            if (profileBox && topSection) {
                if (profileBox.style.display !== 'none') {
                    topSection.style.gridTemplateColumns = '1fr 280px';
                } else {
                    topSection.style.gridTemplateColumns = '1fr';
                }
            }
        }

        function updateTargetUserStats(modeId) {
            if (!selectedTargetUser) return;
            
            // 주석
            const currentRoomType = '<%= typeof roomType !== "undefined" ? roomType : "strategy" %>';
            const modes = currentRoomType === 'strategy' ? STRATEGY_MODES : CASUAL_MODES;
            const mode = modes.find(m => m.id === modeId);
            const modeName = mode ? mode.name : '뚯엫';
            
            // ?꾩쟻 ?쒕ぉ ?낅뜲?댄듃
            const statsTitleEl = document.getElementById('targetGameStatsTitle');
            if (statsTitleEl) statsTitleEl.textContent = `${modeName} ?꾩쟻`;
            
            // 주석
            const winsEl = document.getElementById('targetGameWins');
            const lossesEl = document.getElementById('targetGameLosses');
            const winRateEl = document.getElementById('targetGameWinRate');
            
            if (winsEl) winsEl.textContent = '0';
            if (lossesEl) lossesEl.textContent = '0';
            if (winRateEl) winRateEl.textContent = '0%';
            
            // 주석
            if (selectedTargetUser.id) {
                socket.emit('get_user_game_stats', {
                    userId: selectedTargetUser.id,
                    mode: modeId
                });
            }
        }

        function updateModeSpecificSettings(modeId) {
            const settingsContainer = document.getElementById('modeSpecificSettings');
            if (!settingsContainer) return;

            // 주석
            const mixRulesSection = document.getElementById('mixRulesSection');
            const mixRulesGrid = document.getElementById('mixRulesGrid');

            // 주석
            let settingsHTML = '';
            
            switch(modeId) {
                case 'CAPTURE':
                    // 주석
                    const timeLimitItemCapture = document.getElementById('timeLimitItem');
                    const timeIncrementItemCapture = document.getElementById('timeIncrementItem');
                    const byoyomiItemCapture = document.getElementById('byoyomiItem');
                    const byoyomiPeriodsItemCapture = document.getElementById('byoyomiPeriodsItem');
                    if (timeLimitItemCapture) timeLimitItemCapture.style.display = 'block';
                    if (timeIncrementItemCapture) timeIncrementItemCapture.style.display = 'none';
                    if (byoyomiItemCapture) byoyomiItemCapture.style.display = 'block';
                    if (byoyomiPeriodsItemCapture) byoyomiPeriodsItemCapture.style.display = 'block';
                    
                    const modeSpecificSectionCapture = document.getElementById('modeSpecificSettingsSection');
                    const modeSpecificTitleCapture = document.getElementById('modeSpecificSettingsTitle');
                    if (modeSpecificSectionCapture) {
                        modeSpecificSectionCapture.style.display = 'block';
                    }
                    if (modeSpecificTitleCapture) {
                        modeSpecificTitleCapture.textContent = '캡쳐바둑 설정';
                    }
                    settingsHTML = `
                        <div class="setting-item">
                            <label class="ai-battle-label">따낼 개수</label>
                            <select id="captureTargetSelect" class="form-select">
                                ${Array.from({length: 10}, (_, i) => {
                                    const value = 5 + (i * 5);
                                    return `<option value="${value}" ${value === 20 ? 'selected' : ''}>${value}개</option>`;
                                }).join('')}
                            </select>
                        </div>
                    `;
                    settingsContainer.style.display = 'block';
                    break;
                case 'SPEED':
                    // 스피드바둑 모드의 시간 설정에 표시
                    const timeLimitItemSpeed = document.getElementById('timeLimitItem');
                    const timeIncrementItemSpeed = document.getElementById('timeIncrementItem');
                    const byoyomiItemSpeed = document.getElementById('byoyomiItem');
                    const byoyomiPeriodsItemSpeed = document.getElementById('byoyomiPeriodsItem');
                    if (timeLimitItemSpeed) timeLimitItemSpeed.style.display = 'block';
                    if (timeIncrementItemSpeed) timeIncrementItemSpeed.style.display = 'block';
                    if (byoyomiItemSpeed) byoyomiItemSpeed.style.display = 'none';
                    if (byoyomiPeriodsItemSpeed) byoyomiPeriodsItemSpeed.style.display = 'none';
                    settingsContainer.style.display = 'none';
                    break;
                case 'BASE':
                    const modeSpecificSectionBase = document.getElementById('modeSpecificSettingsSection');
                    const modeSpecificTitleBase = document.getElementById('modeSpecificSettingsTitle');
                    if (modeSpecificSectionBase) {
                        modeSpecificSectionBase.style.display = 'block';
                    }
                    if (modeSpecificTitleBase) {
                        modeSpecificTitleBase.textContent = '베이스바둑 설정';
                    }
                    settingsHTML = `
                        <div class="setting-item">
                            <label class="ai-battle-label">베이스 개수</label>
                            <select id="baseCountSelect" class="form-select">
                                ${Array.from({length: 8}, (_, i) => {
                                    const value = 3 + i;
                                    return `<option value="${value}" ${value === 4 ? 'selected' : ''}>${value}개</option>`;
                                }).join('')}
                            </select>
                        </div>
                    `;
                    settingsContainer.style.display = 'block';
                    break;
                case 'HIDDEN':
                    const modeSpecificSection = document.getElementById('modeSpecificSettingsSection');
                    const modeSpecificTitle = document.getElementById('modeSpecificSettingsTitle');
                    if (modeSpecificSection) {
                        modeSpecificSection.style.display = 'block';
                    }
                    if (modeSpecificTitle) {
                        modeSpecificTitle.textContent = '히든바둑 설정';
                    }
                    settingsHTML = `
                        <div class="setting-item">
                            <label class="ai-battle-label">히든 개수</label>
                            <select id="hiddenCountSelect" class="form-select">
                                ${Array.from({length: 5}, (_, i) => {
                                    const value = 1 + i;
                                    return `<option value="${value}" ${value === 3 ? 'selected' : ''}>${value}개</option>`;
                                }).join('')}
                            </select>
                        </div>
                        <div class="setting-item">
                            <label class="ai-battle-label">스캔 횟수</label>
                            <select id="scanCountSelect" class="form-select">
                                ${Array.from({length: 10}, (_, i) => {
                                    const value = 1 + i;
                                    return `<option value="${value}" ${value === 3 ? 'selected' : ''}>${value}회</option>`;
                                }).join('')}
                            </select>
                        </div>
                    `;
                    settingsContainer.style.display = 'block';
                    break;
                case 'MISSILE':
                    const modeSpecificSectionMissile = document.getElementById('modeSpecificSettingsSection');
                    const modeSpecificTitleMissile = document.getElementById('modeSpecificSettingsTitle');
                    if (modeSpecificSectionMissile) {
                        modeSpecificSectionMissile.style.display = 'block';
                    }
                    if (modeSpecificTitleMissile) {
                        modeSpecificTitleMissile.textContent = '미사일바둑 설정';
                    }
                    settingsHTML = `
                        <div class="setting-item">
                            <label class="ai-battle-label">미사일아이템 개수</label>
                            <select id="missileMoveLimitSelect" class="form-select">
                                ${Array.from({length: 20}, (_, i) => {
                                    const value = 1 + i;
                                    return `<option value="${value}" ${value === 10 ? 'selected' : ''}>${value}회</option>`;
                                }).join('')}
                            </select>
                        </div>
                    `;
                    settingsContainer.style.display = 'block';
                    break;
                    case 'MIX':
                        // 주석
                        if (mixRulesSection && mixRulesGrid) {
                            mixRulesSection.style.display = 'block';
                            mixRulesGrid.innerHTML = `
                                <label class="mix-rule-checkbox">
                                    <input type="checkbox" id="mixRuleCapture" value="CAPTURE">
                                    <span>캡쳐바둑</span>
                                </label>
                                <label class="mix-rule-checkbox">
                                    <input type="checkbox" id="mixRuleSpeed" value="SPEED">
                                    <span>스피드바둑</span>
                                </label>
                                <label class="mix-rule-checkbox">
                                    <input type="checkbox" id="mixRuleBase" value="BASE">
                                    <span>베이스바둑</span>
                                </label>
                                <label class="mix-rule-checkbox">
                                    <input type="checkbox" id="mixRuleHidden" value="HIDDEN">
                                    <span>히든바둑</span>
                                </label>
                                <label class="mix-rule-checkbox">
                                    <input type="checkbox" id="mixRuleMissile" value="MISSILE">
                                    <span>미사일바둑</span>
                                </label>
                            `;
                            
                            // 주석
                            setTimeout(() => {
                                document.querySelectorAll('.mix-rule-checkbox input[type="checkbox"]').forEach(checkbox => {
                                    checkbox.addEventListener('change', function() {
                                        const ruleValue = this.value;
                                        
                                        // 주석
                                        if (this.checked) {
                                            if (ruleValue === 'SPEED') {
                                                // 주석
                                                const captureCheckbox = document.getElementById('mixRuleCapture');
                                                if (captureCheckbox && captureCheckbox.checked) {
                                                    captureCheckbox.checked = false;
                                                }
                                            } else if (ruleValue === 'CAPTURE') {
                                                // 주석
                                                const speedCheckbox = document.getElementById('mixRuleSpeed');
                                                if (speedCheckbox && speedCheckbox.checked) {
                                                    speedCheckbox.checked = false;
                                                }
                                            }
                                        }
                                    
                                        updateMixRuleSettings();
                                        updateMixKomiVisibility();
                                    });
                                });
                            }, 100);
                        }
                        settingsHTML = '';
                        settingsContainer.style.display = 'none';
                    break;
                case 'DICE':
                    const modeSpecificSectionDice = document.getElementById('modeSpecificSettingsSection');
                    const modeSpecificTitleDice = document.getElementById('modeSpecificSettingsTitle');
                    if (modeSpecificSectionDice) {
                        modeSpecificSectionDice.style.display = 'block';
                    }
                    if (modeSpecificTitleDice) {
                        modeSpecificTitleDice.textContent = '주사위바둑 설정';
                    }
                    settingsHTML = `
                        <div class="setting-item">
                            <label class="ai-battle-label">라운드</label>
                            <select id="diceRoundsSelect" class="form-select">
                                <option value="3" selected>3라운드</option>
                                <option value="5">5라운드</option>
                            </select>
                        </div>
                    `;
                    settingsContainer.style.display = 'block';
                    break;
                case 'COPS':
                    const modeSpecificSectionCops = document.getElementById('modeSpecificSettingsSection');
                    const modeSpecificTitleCops = document.getElementById('modeSpecificSettingsTitle');
                    if (modeSpecificSectionCops) {
                        modeSpecificSectionCops.style.display = 'block';
                    }
                    if (modeSpecificTitleCops) {
                        modeSpecificTitleCops.textContent = '주사위바둑2 설정';
                    }
                    settingsHTML = `
                        <div class="setting-item">
                            <label class="ai-battle-label">라운드</label>
                            <select id="copsRoundsSelect" class="form-select">
                                <option value="2" selected>2라운드</option>
                                <option value="3">3라운드</option>
                            </select>
                        </div>
                    `;
                    settingsContainer.style.display = 'block';
                    break;
                case 'OMOK':
                    const modeSpecificSectionOmok = document.getElementById('modeSpecificSettingsSection');
                    const modeSpecificTitleOmok = document.getElementById('modeSpecificSettingsTitle');
                    if (modeSpecificSectionOmok) {
                        modeSpecificSectionOmok.style.display = 'block';
                    }
                    if (modeSpecificTitleOmok) {
                        modeSpecificTitleOmok.textContent = '오목 설정';
                    }
                    settingsHTML = `
                        <div class="setting-item">
                            <label class="ai-battle-label">바둑판 크기</label>
                            <select id="omokBoardSizeSelect" class="form-select">
                                <option value="15" selected>15줄</option>
                                <option value="19">19줄</option>
                            </select>
                        </div>
                    `;
                    settingsContainer.style.display = 'block';
                    break;
                case 'TTAMOK':
                    const modeSpecificSectionTtak = document.getElementById('modeSpecificSettingsSection');
                    const modeSpecificTitleTtak = document.getElementById('modeSpecificSettingsTitle');
                    if (modeSpecificSectionTtak) {
                        modeSpecificSectionTtak.style.display = 'block';
                    }
                    if (modeSpecificTitleTtak) {
                        modeSpecificTitleTtak.textContent = '따목 설정';
                    }
                    settingsHTML = `
                        <div class="setting-item">
                            <label class="ai-battle-label">따낼 개수</label>
                            <select id="ttakTargetSelect" class="form-select">
                                ${Array.from({length: 10}, (_, i) => {
                                    const value = 5 + (i * 5);
                                    return `<option value="${value}" ${value === 10 ? 'selected' : ''}>${value}개</option>`;
                                }).join('')}
                            </select>
                        </div>
                    `;
                    settingsContainer.style.display = 'block';
                    break;
                case 'ALKKAGI':
                    const modeSpecificSectionAlkkagi = document.getElementById('modeSpecificSettingsSection');
                    const modeSpecificTitleAlkkagi = document.getElementById('modeSpecificSettingsTitle');
                    if (modeSpecificSectionAlkkagi) {
                        modeSpecificSectionAlkkagi.style.display = 'block';
                    }
                    if (modeSpecificTitleAlkkagi) {
                        modeSpecificTitleAlkkagi.textContent = '알까기 설정';
                    }
                    settingsHTML = `
                        <div class="setting-item">
                            <label class="ai-battle-label">라운드</label>
                            <select id="alkkagiRoundsSelect" class="form-select">
                                <option value="3" selected>3라운드</option>
                                <option value="5">5라운드</option>
                            </select>
                        </div>
                        <div class="setting-item">
                            <label class="ai-battle-label">개수</label>
                            <select id="alkkagiStonesSelect" class="form-select">
                                ${Array.from({length: 8}, (_, i) => {
                                    const value = 3 + i;
                                    return `<option value="${value}" ${value === 5 ? 'selected' : ''}>${value}개</option>`;
                                }).join('')}
                            </select>
                        </div>
                    `;
                    settingsContainer.style.display = 'block';
                    break;
                case 'CURLING':
                    const modeSpecificSectionCurling = document.getElementById('modeSpecificSettingsSection');
                    const modeSpecificTitleCurling = document.getElementById('modeSpecificSettingsTitle');
                    if (modeSpecificSectionCurling) {
                        modeSpecificSectionCurling.style.display = 'block';
                    }
                    if (modeSpecificTitleCurling) {
                        modeSpecificTitleCurling.textContent = '바둑컬링 설정';
                    }
                    settingsHTML = `
                        <div class="setting-item">
                            <label class="ai-battle-label">개수</label>
                            <select id="curlingStonesSelect" class="form-select">
                                ${Array.from({length: 5}, (_, i) => {
                                    const value = 6 + (i * 2);
                                    return `<option value="${value}" ${value === 8 ? 'selected' : ''}>${value}개</option>`;
                                }).join('')}
                            </select>
                        </div>
                    `;
                    settingsContainer.style.display = 'block';
                    break;
                default:
                    settingsContainer.style.display = 'none';
                    const modeSpecificSectionDefault = document.getElementById('modeSpecificSettingsSection');
                    if (modeSpecificSectionDefault) {
                        modeSpecificSectionDefault.style.display = 'none';
                    }

            // 믹스바둑 규칙 표시
            if (mixRulesSection) {
                mixRulesSection.style.display = 'none';
            }
                    break;
            }
            

            // 믹스바둑이 아닌 경우 규칙 숨기기
            if (modeId !== 'MIX' && mixRulesSection) {
                mixRulesSection.style.display = 'none';
            }
            
            settingsContainer.innerHTML = settingsHTML;
        }

        // 주석
        function updateMixKomiVisibility() {
            if (selectedMode !== 'MIX') {
                // 주석
                const komiSection = document.querySelector('.request-section');
                if (komiSection) {
                    const komiItem = komiSection.querySelector('.setting-item');
                    if (komiItem && komiItem.querySelector('#komiSelect')) {
                        komiItem.style.display = 'block';
                    }
                }
                return;
            }

            const captureCheckbox = document.getElementById('mixRuleCapture');
            const baseCheckbox = document.getElementById('mixRuleBase');
            const isCaptureSelected = captureCheckbox && captureCheckbox.checked;
            const isBaseSelected = baseCheckbox && baseCheckbox.checked;
            
            // 주석
            const komiItem = document.getElementById('komiSettingItem');
            if (komiItem) {
                komiItem.style.display = (isCaptureSelected || isBaseSelected) ? 'none' : 'block';
            }
        }

        // 주석
        function updateMixRuleSettings() {
            const mixSettingsContainer = document.getElementById('mixRuleSettings');
            if (!mixSettingsContainer) return;

            const selectedRules = [];
            const checkboxes = {
                'CAPTURE': document.getElementById('mixRuleCapture'),
                'SPEED': document.getElementById('mixRuleSpeed'),
                'BASE': document.getElementById('mixRuleBase'),
                'HIDDEN': document.getElementById('mixRuleHidden'),
                'MISSILE': document.getElementById('mixRuleMissile')
            };

            Object.keys(checkboxes).forEach(rule => {
                if (checkboxes[rule] && checkboxes[rule].checked) {
                    selectedRules.push(rule);
                }
            });

            if (selectedRules.length === 0) {
                mixSettingsContainer.style.display = 'none';
                mixSettingsContainer.innerHTML = '';
                return;
            }

            mixSettingsContainer.style.display = 'block';
            let settingsHTML = '<div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;"><div class="settings-section-title">선택규칙 설정</div><div class="settings-row-grid">';

            selectedRules.forEach(rule => {
                switch(rule) {
                    case 'CAPTURE':
                        settingsHTML += `
                            <div class="setting-item">
                                <label class="ai-battle-label">캡쳐바둑- 따낼 개수</label>
                                <select id="mixCaptureTargetSelect" class="form-select">
                                    ${Array.from({length: 10}, (_, i) => {
                                        const value = 5 + (i * 5);
                                        return `<option value="${value}" ${value === 20 ? 'selected' : ''}>${value}개</option>`;
                                    }).join('')}
                                </select>
                            </div>
                        `;
                        break;
                    case 'SPEED':
                        settingsHTML += `
                            <div class="setting-item">
                                <label class="ai-battle-label">스피드바둑- 시간 제한</label>
                                <select id="mixTimeLimitSelect" class="form-select">
                                    <option value="1">1분</option>
                                    <option value="3">3분</option>
                                    <option value="5">5분</option>
                                    <option value="10" selected>10분(기본)</option>
                                    <option value="20">20분</option>
                                    <option value="30">30분</option>
                                </select>
                            </div>
                            <div class="setting-item">
                                <label class="ai-battle-label">추가 시간 (초당)</label>
                                <select id="mixTimeIncrementSelect" class="form-select">
                                    <option value="5" selected>5초</option>
                                    <option value="10">10초</option>
                                    <option value="15">15초</option>
                                    <option value="20">20초</option>
                                </select>
                            </div>
                        `;
                        break;
                    case 'BASE':
                        settingsHTML += `
                            <div class="setting-item">
                                <label class="ai-battle-label">베이스바둑- 베이스 개수</label>
                                <select id="mixBaseCountSelect" class="form-select">
                                    ${Array.from({length: 8}, (_, i) => {
                                        const value = 3 + i;
                                        return `<option value="${value}" ${value === 4 ? 'selected' : ''}>${value}개</option>`;
                                    }).join('')}
                                </select>
                            </div>
                        `;
                        break;
                    case 'HIDDEN':
                        settingsHTML += `
                            <div class="setting-item">
                                <label class="ai-battle-label">히든바둑 - 히든 개수</label>
                                <select id="mixHiddenCountSelect" class="form-select">
                                    ${Array.from({length: 5}, (_, i) => {
                                        const value = 1 + i;
                                        return `<option value="${value}" ${value === 3 ? 'selected' : ''}>${value}개</option>`;
                                    }).join('')}
                                </select>
                            </div>
                            <div class="setting-item">
                                <label class="ai-battle-label">스캔 횟수</label>
                                <select id="mixScanCountSelect" class="form-select">
                                    ${Array.from({length: 10}, (_, i) => {
                                        const value = 1 + i;
                                        return `<option value="${value}" ${value === 3 ? 'selected' : ''}>${value}회</option>`;
                                    }).join('')}
                                </select>
                            </div>
                        `;
                        break;
                    case 'MISSILE':
                        settingsHTML += `
                            <div class="setting-item">
                                <label class="ai-battle-label">미사일바둑- 아이템 개수</label>
                                <select id="mixMissileMoveLimitSelect" class="form-select">
                                    ${Array.from({length: 20}, (_, i) => {
                                        const value = 1 + i;
                                        return `<option value="${value}" ${value === 10 ? 'selected' : ''}>${value}회</option>`;
                                    }).join('')}
                                </select>
                            </div>
                        `;
                        break;
                }
            });

            settingsHTML += '</div></div>';
            mixSettingsContainer.innerHTML = settingsHTML;
        }

        // 주석
        socket.on('user_game_stats', (data) => {
            if (data && data.userId === selectedTargetUser?.id && data.mode === selectedMode) {
                const wins = data.wins || 0;
                const losses = data.losses || 0;
                const total = wins + losses;
                const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
                
                // 프로필 박스 게임 전적 업데이트
                const winsEl = document.getElementById('targetGameWins');
                const lossesEl = document.getElementById('targetGameLosses');
                const winRateEl = document.getElementById('targetGameWinRate');
                
                if (winsEl) winsEl.textContent = wins;
                if (lossesEl) lossesEl.textContent = losses;
                if (winRateEl) winRateEl.textContent = `${winRate}%`;
                
                // 주석
                const winsElInline = document.getElementById('targetGameWinsInline');
                const lossesElInline = document.getElementById('targetGameLossesInline');
                const winRateElInline = document.getElementById('targetGameWinRateInline');
                const statsTitleInline = document.getElementById('targetGameStatsTitleInline');
                
                if (winsElInline) winsElInline.textContent = wins;
                if (lossesElInline) lossesElInline.textContent = losses;
                if (winRateElInline) winRateElInline.textContent = `${winRate}%`;
                if (statsTitleInline) {
                    const modeNames = {
                        CLASSIC: 'Classic',
                        CAPTURE: 'Capture',
                        SPEED: 'Speed',
                        BASE: 'Base',
                        HIDDEN: 'Hidden',
                        MISSILE: 'Missile',
                        MIX: 'Mix',
                    };
                    statsTitleInline.textContent = `${modeNames[selectedMode] || '뚯엫'} ?꾩쟻`;
                }
            }
        });

        function toggleProfilePanel() {
            const rightPanel = document.getElementById('requestRightPanel');
            if (!rightPanel) return;
            
            if (rightPanel.classList.contains('show')) {
                rightPanel.classList.remove('show');
            } else {
                rightPanel.classList.add('show');
            }
        }
        
        function closeGameRequestModal() {
            console.log('closeGameRequestModal called');
            const modal = document.getElementById('gameRequestModal');
            if (modal) {
                modal.classList.remove('show');
                modal.style.setProperty('display', 'none', 'important');
                modal.style.setProperty('visibility', 'hidden', 'important');
                modal.style.setProperty('opacity', '0', 'important');
                aiBattleModalOpen = false;
                document.body.style.overflow = '';
            }
        }
        
        // selectRequestMode 함수를 전역에 노출 (버튼 onclick에서 사용)
        window.selectRequestMode = selectRequestMode;
        // closeGameRequestModal 함수를 전역에 노출 (버튼 onclick에서 사용)
        window.closeGameRequestModal = closeGameRequestModal;

        // 주석
        function setupModalEventListeners() {
            // 주석
            const gameRequestModal = document.getElementById('gameRequestModal');
            if (gameRequestModal) {
                gameRequestModal.addEventListener('click', function(e) {
                    if (e.target === this || e.target.id === 'gameRequestModal') {
                        console.log('Modal background clicked, closing modal');
                        closeGameRequestModal();
                    }
                });
            }

            // ESC 키로 모달 닫기
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    if (aiBattleModalOpen) {
                        console.log('ESC key pressed, closing AI Battle modal');
                        closeGameRequestModal();
                    } else if (statsModalOpen) {
                        console.log('ESC key pressed, closing Stats modal');
                        closeStatsModal();
                    }
                }
            });
        }

        // 주석
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupModalEventListeners);
        } else {
            setupModalEventListeners();
        }

        function showAiBattleModal() {
            console.log('showAiBattleModal called');
            try {
                openGameRequestModal(null);
            } catch (error) {
                console.error('Error in showAiBattleModal:', error);
                alert('紐⑤떖щ뒗 以ㅻ쪟媛 쒖깮?덉뒿?덈떎: ' + error.message);
            }
        }

        function closeAiBattleModal() {
            closeGameRequestModal();
        }

        // 수락/거절/수정제안 버튼 이벤트 리스너
        document.getElementById('acceptRequestBtn')?.addEventListener('click', () => {
            if (!selectedTargetUser || !isIncomingRequest) return;
            
            const settings = getRequestSettings();
            
            socket.emit('accept_game_request', {
                fromUserId: selectedTargetUser.id,
                mode: settings.mode,
                komi: settings.komi,
                captureTarget: settings.captureTarget,
                timeLimit: settings.timeLimit,
                timeIncrement: settings.timeIncrement,
                baseStones: settings.baseStones,
                hiddenStones: settings.hiddenStones,
                scanCount: settings.scanCount,
                missileMoveLimit: settings.missileMoveLimit,
                boardSize: settings.boardSize,
                byoyomiSeconds: settings.byoyomiSeconds,
                byoyomiPeriods: settings.byoyomiPeriods,
                mixRules: settings.mixRules,
                mixModes: settings.mixModes,
                mixModeSwitchCount: settings.mixModeSwitchCount,
                mixCaptureTarget: settings.mixCaptureTarget,
                mixTimeLimit: settings.mixTimeLimit,
                mixTimeIncrement: settings.mixTimeIncrement,
                mixBaseCount: settings.mixBaseCount,
                mixHiddenCount: settings.mixHiddenCount,
                mixScanCount: settings.mixScanCount,
                mixMissileMoveLimit: settings.mixMissileMoveLimit,
                // 주석
                maxRounds: settings.maxRounds,
                stonesPerRound: settings.stonesPerRound
            });
            // 주석
            stopRequestTimer();
        });

        document.getElementById('rejectRequestBtn')?.addEventListener('click', () => {
            if (!selectedTargetUser || !isIncomingRequest) return;
            socket.emit('reject_game_request', {
                fromUserId: selectedTargetUser.id
            });
            stopRequestTimer();
            closeGameRequestModal();
        });

        document.getElementById('modifyRequestBtn')?.addEventListener('click', () => {
            modifyRequest();
        });

        document.getElementById('confirmRequestBtn')?.addEventListener('click', () => {
            const currentRoomType = window.WAITING_ROOM_CONFIG?.roomType || 'strategy';
            console.log('[Client] confirmRequestBtn clicked, selectedTargetUser:', selectedTargetUser, 'currentRoomType:', currentRoomType);
            if (!selectedTargetUser && currentRoomType === 'strategy') {
                // AI 대결 시작 - socket 이벤트로 전송
                const settings = getRequestSettings();
                const aiLevel = document.getElementById('aiLevelSelect').value;
                
                // 주석
                settings.aiLevel = parseInt(aiLevel) || 3;
                saveRequestSettings(settings, true);
                
                // 주석
                let captureTarget = 20; // 기본값
                if (settings.mode === 'CAPTURE') {
                    const captureTargetSelect = document.getElementById('captureTargetSelect');
                    if (captureTargetSelect) {
                        const value = parseInt(captureTargetSelect.value);
                        if (!isNaN(value) && value > 0) {
                            captureTarget = value;
                        }
                    }
                }
                
                const aiGameData = {
                    level: parseInt(aiLevel) || 1,
                    color: settings.color || 'random',
                    mode: settings.mode || 'CLASSIC',
                    komi: settings.komi,
                    boardSize: settings.boardSize,
                    timeLimit: settings.timeLimit,
                    timeIncrement: settings.timeIncrement,
                    byoyomiSeconds: settings.byoyomiSeconds,
                    byoyomiPeriods: settings.byoyomiPeriods,
                    captureTarget: captureTarget,
                    baseStones: settings.baseStones,
                    hiddenStones: settings.hiddenStones,
                    scanCount: settings.scanCount,
                    missileMoveLimit: settings.missileMoveLimit,
                    autoScoringMove: settings.autoScoringMove
                };
                
                console.log('[Client] Emitting start_ai_game with:', {
                    boardSize: aiGameData.boardSize,
                    timeLimit: aiGameData.timeLimit,
                    byoyomiSeconds: aiGameData.byoyomiSeconds,
                    byoyomiPeriods: aiGameData.byoyomiPeriods,
                    mode: aiGameData.mode,
                    captureTarget: aiGameData.captureTarget,
                    captureTargetType: typeof aiGameData.captureTarget,
                    captureTargetSelect: document.getElementById('captureTargetSelect') ? document.getElementById('captureTargetSelect').value : 'null',
                    settings: settings,
                    settingsCaptureTarget: settings.captureTarget,
                    settingsCaptureTargetType: typeof settings.captureTarget
                });
                
                console.log('[Client] About to emit start_ai_game, socket connected:', socket?.connected);
                if (socket && socket.connected) {
                    socket.emit('start_ai_game', aiGameData);
                    console.log('[Client] start_ai_game event emitted successfully');
                    // 모달은 서버 응답을 기다린 후 닫기
                    // closeGameRequestModal();
                } else {
                    console.error('[Client] Socket is not connected!');
                    showAlertModal('서버에 연결되지 않았습니다. 페이지를 새로고침해주세요.', '오류', 'error');
                }
                return;
            }

            if (!selectedTargetUser) {
                alert('??곸쓣 ?좏깮?댁＜?몄슂.');
                return;
            }

            const settings = getRequestSettings();
            
            // 주석
            saveRequestSettings(settings, false);
            
            socket.emit('send_game_request', {
                targetUserId: selectedTargetUser.id,
                mode: settings.mode,
                komi: settings.komi,
                captureTarget: settings.captureTarget,
                timeLimit: settings.timeLimit,
                timeIncrement: settings.timeIncrement,
                baseStones: settings.baseStones,
                hiddenStones: settings.hiddenStones,
                scanCount: settings.scanCount,
                missileMoveLimit: settings.missileMoveLimit,
                boardSize: settings.boardSize,
                byoyomiSeconds: settings.byoyomiSeconds,
                byoyomiPeriods: settings.byoyomiPeriods,
                mixRules: settings.mixRules,
                mixModes: settings.mixModes,
                mixModeSwitchCount: settings.mixModeSwitchCount,
                mixCaptureTarget: settings.mixCaptureTarget,
                mixTimeLimit: settings.mixTimeLimit,
                mixTimeIncrement: settings.mixTimeIncrement,
                mixBaseCount: settings.mixBaseCount,
                mixHiddenCount: settings.mixHiddenCount,
                mixScanCount: settings.mixScanCount,
                mixMissileMoveLimit: settings.mixMissileMoveLimit,
                // 주석
                maxRounds: settings.maxRounds,
                stonesPerRound: settings.stonesPerRound
            });
            
            isIncomingRequest = false;
            originalRequestData = settings;
            
            // 주석
            const senderButtons = document.getElementById('senderActionButtons');
            const receiverButtons = document.getElementById('receiverActionButtons');
            if (senderButtons) senderButtons.style.display = 'flex';
            if (receiverButtons) receiverButtons.style.display = 'none';
            
            // 주석
            startRequestTimer(30);
            
            const confirmBtn = document.getElementById('confirmRequestBtn');
            if (confirmBtn) confirmBtn.disabled = true;
        });

        /* 대기실 버튼 클릭 핸들러 */

        // 주석
        document.addEventListener('click', (e) => {
            const target = e.target;
            
            if (target.id === 'aiBattleBtn' || target.closest('#aiBattleBtn')) {
                console.log('AI Battle button clicked!');
                e.preventDefault();
                e.stopPropagation();
                showAiBattleModal();
                return false;
            } else if (target.id === 'detailBtn' || target.closest('#detailBtn')) {
                showStatsModal();
            } else if (target.classList.contains('ai-level-btn')) {
                document.querySelectorAll('.ai-level-btn').forEach(btn => btn.classList.remove('active'));
                target.classList.add('active');
            } else if (target.classList.contains('ai-color-btn')) {
                document.querySelectorAll('.ai-color-btn').forEach(btn => btn.classList.remove('active'));
                target.classList.add('active');
            } else if (target.id === 'startMatchingBtn' || target.closest('#startMatchingBtn')) {
                e.preventDefault();
                e.stopPropagation();
                startMatching();
                return false;
            } else if (target.id === 'cancelMatchingBtn' || target.closest('#cancelMatchingBtn')) {
                e.preventDefault();
                e.stopPropagation();
                cancelMatching();
                return false;
            } else if (target.id === 'watchByRoomNumberBtn' || target.closest('#watchByRoomNumberBtn')) {
                e.preventDefault();
                e.stopPropagation();
                watchByRoomNumber();
                return false;
            } else if (target.id === 'chatSendBtn' || target.closest('#chatSendBtn')) {
                e.preventDefault();
                e.stopPropagation();
                sendChatMessageDesktop();
                return false;
            } else if (target.id === 'emojiBtn' || target.closest('#emojiBtn')) {
                e.preventDefault();
                e.stopPropagation();
                toggleEmojiPopup();
                return false;
            }
        });

        // 매칭 시작 함수
        function startMatching() {
            if (isMatching) {
                showAlertModal('이미 매칭 중입니다.', '안내', 'info');
                return;
            }
            
            isMatching = true;
            const startBtn = document.getElementById('startMatchingBtn');
            const cancelBtn = document.getElementById('cancelMatchingBtn');
            const matchingStatus = document.getElementById('matchingStatus');
            
            if (startBtn) startBtn.style.display = 'none';
            if (cancelBtn) cancelBtn.style.display = 'block';
            if (matchingStatus) matchingStatus.textContent = '매칭 중...';
            
            socket.emit('start_matching', { roomType: window.WAITING_ROOM_CONFIG?.roomType || 'strategy' });
        }

        // 매칭 취소 함수
        function cancelMatching() {
            if (!isMatching) {
                return;
            }
            
            isMatching = false;
            const startBtn = document.getElementById('startMatchingBtn');
            const cancelBtn = document.getElementById('cancelMatchingBtn');
            const matchingStatus = document.getElementById('matchingStatus');
            
            if (startBtn) startBtn.style.display = 'block';
            if (cancelBtn) cancelBtn.style.display = 'none';
            if (matchingStatus) matchingStatus.textContent = '대기 중';
            
            socket.emit('cancel_matching');
        }

        // 관전하기 함수 (방번호 입력)
        function watchByRoomNumber() {
            const roomNumberInput = document.getElementById('roomNumberInput');
            if (!roomNumberInput) {
                showAlertModal('방번호 입력 필드를 찾을 수 없습니다.', '오류', 'error');
                return;
            }
            
            const roomNumber = roomNumberInput.value.trim();
            if (!roomNumber) {
                showAlertModal('방번호를 입력해주세요.', '안내', 'warning');
                return;
            }
            
            const roomNum = parseInt(roomNumber);
            if (isNaN(roomNum) || roomNum < 1 || roomNum > 5) {
                showAlertModal('방번호는 1-5 사이의 숫자여야 합니다.', '안내', 'warning');
                return;
            }
            
            window.location.href = `/api/game/${roomNum}`;
        }

        // 데스크톱 채팅 전송 함수
        let lastChatTime = 0;
        let lastChatMessage = '';
        const CHAT_COOLDOWN = 3000; // 3초 쿨타임

        function sendChatMessageDesktop() {
            const chatInput = document.getElementById('chatInput');
            if (!chatInput || !chatInput.value.trim()) {
                return;
            }
            
            const message = chatInput.value.trim();
            const currentTime = Date.now();
            
            // 쿨타임 체크
            if (currentTime - lastChatTime < CHAT_COOLDOWN) {
                const remaining = Math.ceil((CHAT_COOLDOWN - (currentTime - lastChatTime)) / 1000);
                const countdown = document.getElementById('chatCountdown');
                if (countdown) {
                    countdown.textContent = remaining;
                    countdown.style.display = 'block';
                    setTimeout(() => {
                        if (countdown) countdown.style.display = 'none';
                    }, 1000);
                }
                return;
            }
            
            // 같은 말 2회 연속 방지
            if (message === lastChatMessage) {
                showAlertModal('같은 메시지를 연속으로 전송할 수 없습니다.', '안내', 'warning');
                return;
            }
            
            // 서버에 메시지 전송
            if (typeof socket !== 'undefined' && socket) {
                console.log('Sending chat message:', message);
                console.log('[Client] Sending chat message:', message);
                socket.emit('chat_message', {
                    message: message,
                    timestamp: currentTime
                });
                console.log('[Client] Chat message emitted');
            } else {
                console.error('Socket is not available');
            }
            
            // 마지막 전송 시간과 메시지 저장
            lastChatTime = currentTime;
            lastChatMessage = message;
            
            chatInput.value = '';
            
            // 이모지 팝업 닫기
            const emojiPopup = document.getElementById('emojiPopup');
            if (emojiPopup) {
                emojiPopup.classList.remove('show');
            }
        }

        // 이모지 팝업 토글 함수
        function toggleEmojiPopup() {
            const emojiPopup = document.getElementById('emojiPopup');
            if (emojiPopup) {
                const isShowing = emojiPopup.classList.contains('show');
                emojiPopup.classList.toggle('show');
                
                // 팝업이 열릴 때 탭을 초기 상태로 리셋
                if (!isShowing) {
                    const emojiTabs = emojiPopup.querySelectorAll('.emoji-tab');
                    const emojiSection = document.getElementById('emojiSection');
                    const quickSection = document.getElementById('quickSection');
                    
                    // 이모지 탭을 활성화
                    emojiTabs.forEach(tab => {
                        if (tab.getAttribute('data-tab') === 'emoji') {
                            tab.classList.add('active');
                        } else {
                            tab.classList.remove('active');
                        }
                    });
                    
                    // 이모지 섹션 표시, 퀵 메시지 섹션 숨기기
                    if (emojiSection) emojiSection.classList.add('active');
                    if (quickSection) quickSection.classList.remove('active');
                }
            }
        }

        // 채팅 입력 필드 엔터키 이벤트
        document.addEventListener('DOMContentLoaded', () => {
            const chatInput = document.getElementById('chatInput');
            if (chatInput) {
                chatInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        sendChatMessageDesktop();
                    }
                });
            }

            // 이모지 팝업 내부 이모지 클릭 이벤트
            const emojiItems = document.querySelectorAll('.emoji-item');
            emojiItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    const emoji = item.textContent;
                    if (chatInput) {
                        chatInput.value += emoji;
                        chatInput.focus();
                    }
                });
            });

            // 퀵 메시지 버튼 클릭 이벤트
            const quickMessageBtns = document.querySelectorAll('.quick-message-btn');
            quickMessageBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const message = btn.textContent;
                    if (chatInput) {
                        chatInput.value = message;
                        chatInput.focus();
                    }
                });
            });

            // 이모지 팝업 탭 전환
            const emojiTabs = document.querySelectorAll('.emoji-tab');
            const emojiSection = document.getElementById('emojiSection');
            const quickSection = document.getElementById('quickSection');
            
            emojiTabs.forEach(tab => {
                tab.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const tabName = tab.getAttribute('data-tab');
                    
                    // 모든 탭 비활성화
                    emojiTabs.forEach(t => t.classList.remove('active'));
                    // 클릭한 탭 활성화
                    tab.classList.add('active');
                    
                    // 모든 섹션 숨기기
                    if (emojiSection) emojiSection.classList.remove('active');
                    if (quickSection) quickSection.classList.remove('active');
                    
                    // 해당 섹션 표시
                    if (tabName === 'emoji' && emojiSection) {
                        emojiSection.classList.add('active');
                    } else if (tabName === 'quick' && quickSection) {
                        quickSection.classList.add('active');
                    }
                });
            });

            // 이모지 팝업 외부 클릭시 닫기
            document.addEventListener('click', (e) => {
                const emojiPopup = document.getElementById('emojiPopup');
                const emojiBtn = document.getElementById('emojiBtn');
                
                if (emojiPopup && emojiBtn && 
                    !emojiPopup.contains(e.target) && 
                    !emojiBtn.contains(e.target)) {
                    emojiPopup.classList.remove('show');
                }
            });
        });

        socket.on('connect', () => {
            console.log('[Client] Socket connected, socket.id:', socket.id);
            const roomType = window.WAITING_ROOM_CONFIG?.roomType || 'strategy';
            console.log('[Client] Joining waiting room:', roomType);
            socket.emit('join_waiting_room', roomType);
            console.log('[Client] join_waiting_room event emitted');
            socket.emit('get_user_list', roomType);
            socket.emit('get_ongoing_games');
            socket.emit('get_rankings');
        });
        
        socket.on('disconnect', (reason) => {
            console.log('[Client] Socket disconnected, reason:', reason);
            if (reason === 'io server disconnect') {
                // 서버가 연결을 끊은 경우 (인증 오류 등) 재연결 시도
                console.log('[Client] Server disconnected, attempting to reconnect...');
                socket.connect();
            }
        });
        
        socket.on('connect_error', (error) => {
            console.error('[Client] Socket connection error:', error);
            if (error.message === 'Authentication required') {
                // 인증 오류인 경우 페이지 새로고침 (세션 복구 시도)
                console.warn('[Client] Authentication error, refreshing page in 1 second...');
                showAlertModal('인증 오류가 발생했습니다. 페이지를 새로고침합니다.', '오류', 'error');
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            }
        });

        socket.on('user_list_update', (users) => {
            renderOnlineUsers(users);
        });

        // 사용자 접속/퇴장 이벤트 핸들러
        socket.on('user_joined', async (data) => {
            console.log('User joined:', data);
            const roomType = window.WAITING_ROOM_CONFIG?.roomType || 'strategy';
            // ?좎? 紐⑸줉 媛깆떊 ?붿껌
            socket.emit('get_user_list', roomType);
        });

        socket.on('user_left', async (data) => {
            console.log('User left:', data);
            const roomType = window.WAITING_ROOM_CONFIG?.roomType || 'strategy';
            // ?좎? 紐⑸줉 媛깆떊 ?붿껌
            socket.emit('get_user_list', roomType);
        });

        socket.on('user_status_changed', async (data) => {
            console.log('User status changed:', data);
            const roomType = window.WAITING_ROOM_CONFIG?.roomType || 'strategy';
            // ?좎? 紐⑸줉 媛깆떊 ?붿껌
            socket.emit('get_user_list', roomType);
        });

        socket.on('rankings_update', (rankings) => {
            // 주석
            renderRankings(rankings);
        });

        socket.on('ongoing_games_update', (games) => {
            renderOngoingGames(games);
        });

        // 대국 신청 요청 이벤트 핸들러
        socket.on('game_request_received', (data) => {
            console.log('Received game request:', data);
            const sender = {
                id: data.fromUserId,
                nickname: data.fromNickname,
                rating: data.fromRating || 1500
            };
            // 주석
            const requestData = {
                mode: data.mode,
                komi: data.komi,
                captureTarget: data.captureTarget,
                timeLimit: data.timeLimit,
                timeIncrement: data.timeIncrement,
                baseStones: data.baseStones,
                hiddenStones: data.hiddenStones,
                scanCount: data.scanCount,
                missileMoveLimit: data.missileMoveLimit,
                boardSize: data.boardSize,
                byoyomiSeconds: data.byoyomiSeconds,
                byoyomiPeriods: data.byoyomiPeriods,
                maxRounds: data.maxRounds,
                stonesPerRound: data.stonesPerRound
            };
            openGameRequestModal(sender, true, requestData);
        });

        socket.on('game_request_rejected', (data) => {
            showAlertModal(`${data.nickname}님이 대국 신청을 거절했습니다.`, '안내', 'info');
            stopRequestTimer();
            closeGameRequestModal();
        });

        socket.on('game_request_modified', (data) => {
            console.log('Game request modified by opponent:', data);
            const sender = {
                id: data.fromUserId,
                nickname: data.fromNickname,
                rating: data.fromRating || 1500
            };
            const requestData = {
                mode: data.mode,
                komi: data.komi,
                captureTarget: data.captureTarget,
                timeLimit: data.timeLimit,
                timeIncrement: data.timeIncrement,
                baseStones: data.baseStones,
                hiddenStones: data.hiddenStones,
                scanCount: data.scanCount,
                missileMoveLimit: data.missileMoveLimit,
                boardSize: data.boardSize,
                byoyomiSeconds: data.byoyomiSeconds,
                byoyomiPeriods: data.byoyomiPeriods,
                mixRules: data.mixRules,
                mixCaptureTarget: data.mixCaptureTarget,
                mixTimeLimit: data.mixTimeLimit,
                mixTimeIncrement: data.mixTimeIncrement,
                mixBaseCount: data.mixBaseCount,
                mixHiddenCount: data.mixHiddenCount,
                mixScanCount: data.mixScanCount,
                mixMissileMoveLimit: data.mixMissileMoveLimit,
                maxRounds: data.maxRounds,
                stonesPerRound: data.stonesPerRound
            };
            openGameRequestModal(sender, true, requestData);
        });

        socket.on('game_request_timeout', (data) => {
            alert('?곷?⑹쓽 ?묐떟 ?쒓컙덇낵?섏뼱 ?援좎껌痍⑥냼?섏뿀?듬땲');
            stopRequestTimer();
            closeGameRequestModal();
        });

        socket.on('game_started', (data) => {
            console.log('[Client] Game started event received:', data);
            // ??대㉧ 以묒?
            stopRequestTimer();
            // 紐⑤떖 ?リ린
            closeGameRequestModal();
            
            if (data && data.gameId) {
                console.log('[Client] Redirecting to game room:', `/api/game/${data.gameId}`);
                // 주석
                window.location.href = `/api/game/${data.gameId}`;
            } else {
                console.error('[Client] Invalid game_started data:', data);
                showAlertModal('AI 게임 시작 정보를 받지 못했습니다. 다시 시도해주세요.', '오류', 'error');
            }
        });

        // 주석
        function escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function formatTime(timestamp) {
            if (!timestamp) return '';
            const date = new Date(timestamp);
            
            // 주석
            const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
            const kstDate = new Date(utc + (kstOffset * 60000));
            
            // ?쒓컙 ?щ㎎: HH:MM
            const hours = String(kstDate.getHours()).padStart(2, '0');
            const minutes = String(kstDate.getMinutes()).padStart(2, '0');
            
            return `${hours}:${minutes}`;
        }

        function addChatMessage(user, message, timestamp, roomType) {
            console.log('[Client] addChatMessage called:', { user, message, timestamp, roomType });
            const list = document.getElementById('chatMessages');
            const mobileList = document.getElementById('mobileSidebarChatMessages');
            const roomTypeText = roomType === 'casual' ? '[?' : '[?꾨왂]';
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message';
            messageDiv.innerHTML = `
                <div class="message-header">
                    <span class="message-user">${roomTypeText} ${escapeHtml(user)}</span>
                    <span class="message-content">${escapeHtml(message)}</span>
                    <span class="message-time">${formatTime(timestamp)}</span>
                </div>
            `;
            
            // 데스크톱 채팅창에 추가
            if (list) {
                console.log('[Client] Adding message to desktop chat list');
                list.appendChild(messageDiv.cloneNode(true));
                list.scrollTop = list.scrollHeight;
            } else {
                console.warn('[Client] chatMessages element not found');
            }
            
            // 모바일 사이드바 채팅창에 추가
            if (mobileList) {
                console.log('[Client] Adding message to mobile sidebar chat list');
                mobileList.appendChild(messageDiv.cloneNode(true));
                mobileList.scrollTop = mobileList.scrollHeight;
            }
            
            // 모바일 메뉴 채팅창에 추가
            const mobileMenuList = document.getElementById('mobileMenuChatMessages');
            if (mobileMenuList) {
                console.log('[Client] Adding message to mobile menu chat list');
                mobileMenuList.appendChild(messageDiv.cloneNode(true));
                mobileMenuList.scrollTop = mobileMenuList.scrollHeight;
            }
        }

        socket.on('ai_game_started', (data) => {
            console.log('[Client] AI game started event received:', data);
            console.log('[Client] Data type check:', typeof data, 'gameId:', data?.gameId, 'gameId type:', typeof data?.gameId);
            
            if (data && data.gameId) {
                const gameId = data.gameId;
                console.log('[Client] Valid gameId received:', gameId);
                
                // 모달이 열려있으면 닫기
                const gameRequestModal = document.getElementById('gameRequestModal');
                if (gameRequestModal) {
                    const isModalOpen = gameRequestModal.style.display !== 'none' || 
                                       gameRequestModal.classList.contains('show') ||
                                       window.getComputedStyle(gameRequestModal).display !== 'none';
                    if (isModalOpen) {
                        console.log('[Client] Closing game request modal');
                        closeGameRequestModal();
                    }
                }
                
                // 리다이렉트 (모달 닫기 애니메이션 완료 대기)
                console.log('[Client] Redirecting to game room:', `/api/game/${gameId}`);
                setTimeout(() => {
                    console.log('[Client] Executing redirect now');
                    window.location.href = `/api/game/${gameId}`;
                }, 200);
            } else {
                console.error('[Client] Invalid ai_game_started data:', data);
                console.error('[Client] Data structure:', JSON.stringify(data, null, 2));
                showAlertModal('AI 게임 시작 정보를 받지 못했습니다. 다시 시도해주세요.', '오류', 'error');
            }
        });

        socket.on('ai_game_error', (data) => {
            console.error('[Client] AI game error:', data);
            alert(`뚯엫 ?쒖옉 以ㅻ쪟媛 쒖깮?덉뒿?덈떎: ${data.error || '녿뒗 ?ㅻ쪟'}`);
        });

        socket.on('room_joined', (data) => {
            console.log('[Client] Room joined confirmation:', data);
        });
        
        socket.on('chat_message', (data) => {
            console.log('[Client] Received chat message:', data);
            console.log('[Client] Current room type:', window.WAITING_ROOM_CONFIG?.roomType);
            if (data && data.user && data.message) {
                console.log('[Client] Adding chat message to UI');
                addChatMessage(data.user, data.message, data.timestamp, data.roomType);
            } else {
                console.warn('[Client] Invalid chat message data:', data);
            }
        });

        // 매칭 관련 소켓 이벤트
        socket.on('matching_found', (data) => {
            console.log('Matching found:', data);
            isMatching = false;
            
            const startBtn = document.getElementById('startMatchingBtn');
            const cancelBtn = document.getElementById('cancelMatchingBtn');
            const matchingStatus = document.getElementById('matchingStatus');
            
            if (startBtn) startBtn.style.display = 'block';
            if (cancelBtn) cancelBtn.style.display = 'none';
            if (matchingStatus) matchingStatus.textContent = '매칭 성공! 게임으로 이동합니다...';
            
            // 게임 시작 이벤트를 기다림 (game_started 이벤트에서 처리)
        });

        socket.on('matching_cancelled', (data) => {
            console.log('Matching cancelled:', data);
            isMatching = false;
            
            const startBtn = document.getElementById('startMatchingBtn');
            const cancelBtn = document.getElementById('cancelMatchingBtn');
            const matchingStatus = document.getElementById('matchingStatus');
            
            if (startBtn) startBtn.style.display = 'block';
            if (cancelBtn) cancelBtn.style.display = 'none';
            if (matchingStatus) matchingStatus.textContent = '대기 중';
        });

        socket.on('matching_error', (data) => {
            console.error('Matching error:', data);
            isMatching = false;
            
            const startBtn = document.getElementById('startMatchingBtn');
            const cancelBtn = document.getElementById('cancelMatchingBtn');
            const matchingStatus = document.getElementById('matchingStatus');
            
            if (startBtn) startBtn.style.display = 'block';
            if (cancelBtn) cancelBtn.style.display = 'none';
            if (matchingStatus) matchingStatus.textContent = '대기 중';
            
            showAlertModal(`매칭 오류: ${data.error || '알 수 없는 오류'}`, '오류', 'error');
        });

        function renderOnlineUsers(users) {
            console.log('renderOnlineUsers called with:', users);
            const list = document.getElementById('onlineUsersList');
            if (!list) {
                console.warn('onlineUsersList element not found');
                console.log('Available IDs:', Array.from(document.querySelectorAll('[id]')).map(el => el.id));
                return;
            }
            console.log('onlineUsersList found:', list, 'parent:', list.parentElement);

            // 주석
            const totalCount = users.length + 1; // ?꾩옱 ?ъ슜ы븿
            const countEl = document.getElementById('onlineUserCount');
            if (countEl) {
                countEl.textContent = `(${totalCount}紐묒냽以?`;
            }

            let html = `
                <div class="current-user-item">
                    <div class="user-info">
                        <div class="user-avatar">${currentUserNickname.charAt(0).toUpperCase()}</div>
                        <div class="user-nickname">${currentUserNickname}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <select class="status-dropdown" id="statusDropdown" onchange="changeStatus(this.value)">
                            <option value="waiting" ${currentUserStatus === 'waiting' ? 'selected' : ''}>대기중</option>
                            <option value="resting" ${currentUserStatus === 'resting' ? 'selected' : ''}>휴식중</option>
                        </select>
                        <button class="ai-battle-btn" id="aiBattleBtn" style="padding: 6px 12px; font-size: 13px;">AI봇 대결</button>
                    </div>
                </div>
            `;

            html += users.filter(u => u.id !== currentUserId).map(user => `
                <div class="user-item" style="cursor: pointer;" onclick="showProfileModal('${user.id}')" data-user-id="${user.id}">
                    <div class="user-info">
                        <div class="user-avatar">${user.nickname.charAt(0).toUpperCase()}</div>
                        <div class="user-details">
                            <div class="user-nickname">${user.nickname}</div>
                            <div class="user-rating">레이팅: ${user.rating} | 매너점수: ${user.manner || 1500}</div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div class="user-status-badge status-${user.status || 'waiting'}">${getStatusText(user.status || 'waiting')}</div>
                        <button class="btn btn-primary" style="font-size: 12px; padding: 4px 8px;" onclick="event.stopPropagation(); openGameRequestModal({id: '${user.id}', nickname: '${user.nickname}', rating: ${user.rating}, manner: ${user.manner || 1500}})">대국신청</button>
                    </div>
                </div>
            `).join('');
            
            list.innerHTML = html;
            console.log('renderOnlineUsers: HTML set to list, length:', html.length, 'list element:', list);
            
            // 모바일 페이지도 업데이트
            const mobileList = document.getElementById('mobile-onlineUsersList');
            if (mobileList) {
                mobileList.innerHTML = html;
                console.log('renderOnlineUsers: HTML set to mobile list, length:', html.length);
            }
        }

        function getStatusText(status) {
            const statusMap = {
                waiting: '대기중',
                resting: '휴식중',
                matching: '매칭중',
                'in-game': '게임중',
                spectating: '관전중',
            };
            return statusMap[status] || status;
        }

        function changeStatus(newStatus) {
            if (isMatching) {
                alert('留ㅼ묶 以묒뿉곹깭瑜?蹂쏀븷 놁뒿?덈떎.');
                return;
            }
            socket.emit('change_status', { status: newStatus });
        }

        socket.on('status_changed', (data) => {
            if (data.userId === currentUserId) {
                currentUserStatus = data.status;
                const dropdown = document.getElementById('statusDropdown');
                if (dropdown) dropdown.value = data.status;
            }
        });

        function renderOngoingGames(games) {
            console.log('renderOngoingGames called with:', games);
            const list = document.getElementById('ongoingGamesList');
            if (!list) {
                console.warn('ongoingGamesList element not found');
                console.log('Available IDs:', Array.from(document.querySelectorAll('[id]')).map(el => el.id));
                return;
            }
            console.log('ongoingGamesList found:', list, 'parent:', list.parentElement);
            if (games.length === 0) {
                list.innerHTML = '<div class="empty-state">진행중인 대국이 없습니다.</div>';
                return;
            }
            const gamesHtml = games.map((game, index) => {
                const roomNumber = game.roomNumber || (index + 1);
                const title = game.title || 'Untitled Game';
                const blackPlayer = game.blackPlayer || { nickname: 'Unknown', rating: 0 };
                const whitePlayer = game.whitePlayer || { nickname: 'Unknown', rating: 0 };
                
                return `
                    <div class="game-item">
                        <div class="game-room-number-badge">${roomNumber}</div>
                        <div class="game-info">
                            <div class="game-title">${escapeHtml(title)}</div>
                        </div>
                        <div class="game-players">
                            <div class="player-info">
                                <div class="player-stone black"></div>
                                <div class="player-details">
                                    <div class="player-name" style="cursor: pointer;" onclick="event.stopPropagation(); showProfileModal('${blackPlayer.id || ''}')" data-user-id="${blackPlayer.id || ''}">${escapeHtml(blackPlayer.nickname)}</div>
                                    <div class="player-rating">${blackPlayer.rating || 0}</div>
                                </div>
                            </div>
                            <span class="vs-divider">VS</span>
                            <div class="player-info">
                                <div class="player-details">
                                    <div class="player-name" style="cursor: pointer;" onclick="event.stopPropagation(); showProfileModal('${whitePlayer.id || ''}')" data-user-id="${whitePlayer.id || ''}">${escapeHtml(whitePlayer.nickname)}</div>
                                    <div class="player-rating">${whitePlayer.rating || 0}</div>
                                </div>
                                <div class="player-stone white"></div>
                            </div>
                        </div>
                        <button class="watch-btn" onclick="event.stopPropagation(); window.location.href='/api/game/${game.id}'">관전</button>
                    </div>
                `;
            }).join('');
            list.innerHTML = gamesHtml;
            console.log('renderOngoingGames: HTML set to list, length:', gamesHtml.length, 'list element:', list);
            
            // 모바일 페이지도 업데이트
            const mobileList = document.getElementById('mobile-ongoingGamesList');
            if (mobileList) {
                mobileList.innerHTML = gamesHtml;
                console.log('renderOngoingGames: HTML set to mobile list, length:', gamesHtml.length);
            }
        }


            let allRankings = [];
        let displayedRankingsCount = 20;
        // 주석

        const rankingsPerPage = 20; // 덉뿉 異붽?濡쒖떆媛쒖닔
        let isLoadingRankings = false;

        // 티어 계산 함수 (레이팅에 따라)
        function getTierFromRating(rating) {
            if (rating < 1300) return 1; // 새싹
            if (rating < 1400) return 2; // 루키
            if (rating < 1500) return 3; // 브론즈
            if (rating < 1700) return 4; // 실버
            if (rating < 2000) return 5; // 골드
            if (rating < 2400) return 6; // 플래티넘
            if (rating < 3000) return 7; // 다이아
            if (rating < 3500) return 8; // 마스터
            return 9; // 챌린저
        }

        function renderRankings(rankings) {
            console.log('renderRankings called with:', rankings);
            const list = document.getElementById('rankingList');
            const mobileList = document.getElementById('mobileMenuRankingList');
            
            if (!list && !mobileList) {
                console.warn('rankingList and mobileMenuRankingList elements not found');
                console.log('Available IDs:', Array.from(document.querySelectorAll('[id]')).map(el => el.id));
                return;
            }
            if (list) console.log('rankingList found:', list, 'parent:', list.parentElement);
            if (mobileList) console.log('mobileMenuRankingList found:', mobileList);
            
            // 주석
            if (!rankings || !Array.isArray(rankings)) {
                console.warn('Invalid rankings data:', rankings);
                return;
            }
            
            // 주석
            allRankings = rankings;
            const myRanking = allRankings.find(r => r.userId === currentUserId || r.nickname === currentUserNickname);
            const otherRankings = allRankings.filter(r => r.userId !== currentUserId && r.nickname !== currentUserNickname);
            
            // 주석
            const maxRankings = otherRankings.slice(0, 100);
            const rankingsToShow = maxRankings.slice(0, displayedRankingsCount);
            
            let html = '';
            
            // 주석
            if (myRanking) {
                const myRankIndex = allRankings.findIndex(r => r.userId === currentUserId || r.nickname === currentUserNickname);
                const myTotal = (myRanking.wins || 0) + (myRanking.losses || 0);
                const myWinRate = myTotal > 0 ? Math.round(((myRanking.wins || 0) / myTotal) * 100) : 0;
                const myTier = getTierFromRating(myRanking.rating || 0);
                const myTierImage = `/images/tire${myTier}.webp`;
                html += `
                    <div class="my-ranking-item">
                        <div class="rank-number">${myRankIndex >= 0 ? myRankIndex + 1 : '-'}</div>
                        <div class="ranking-user-info">
                            <div class="ranking-nickname">
                                <img src="${myTierImage}" alt="티어${myTier}" class="tier-mark" onerror="this.style.display='none';">
                                ${escapeHtml(myRanking.nickname)}
                            </div>
                            <div class="ranking-stats">승 ${myRanking.wins || 0} 패 ${myRanking.losses || 0} 승률 ${myWinRate}%</div>
                        </div>
                        <div class="ranking-rating">${myRanking.rating || 0}</div>
                    </div>
                `;
            } else {
                // 주석
                const myWins = 0;
                const myLosses = 0;
                const myRating = 0;
                const myTotal = myWins + myLosses;
                const myWinRate = myTotal > 0 ? Math.round((myWins / myTotal) * 100) : 0;
                const myTier = getTierFromRating(myRating);
                const myTierImage = `/images/tire${myTier}.webp`;
                html += `
                    <div class="my-ranking-item">
                        <div class="rank-number">-</div>
                        <div class="ranking-user-info">
                            <div class="ranking-nickname">
                                <img src="${myTierImage}" alt="티어${myTier}" class="tier-mark" onerror="this.style.display='none';">
                                ${escapeHtml(currentUserNickname)}
                            </div>
                            <div class="ranking-stats">승 ${myWins} 패 ${myLosses} 승률 ${myWinRate}%</div>
                        </div>
                        <div class="ranking-rating">${myRating}</div>
                    </div>
                `;
            }
            
            // 주석
            if (rankingsToShow.length > 0) {
                html += rankingsToShow.map((rank, index) => {
                    // 주석
                    const actualRank = allRankings.findIndex(r => 
                        (r.userId && rank.userId && r.userId === rank.userId) || 
                        (r.nickname && rank.nickname && r.nickname === rank.nickname)
                    ) + 1;
                    
                    // 주석
                    const displayRank = actualRank > 0 ? actualRank : (index + 1);
                    
                    const total = (rank.wins || 0) + (rank.losses || 0);
                    const winRate = total > 0 ? Math.round(((rank.wins || 0) / total) * 100) : 0;
                    const rankClass = displayRank <= 3 ? `rank-${displayRank}` : '';
                    const tier = getTierFromRating(rank.rating || 0);
                    const tierImage = `/images/tire${tier}.webp`;
                    const rankDisplay = displayRank <= 3 ? ['🥇', '🥈', '🥉'][displayRank - 1] : `#${displayRank}`;
                    return `
                        <div class="ranking-item ${rankClass}" style="cursor: pointer;" onclick="showProfileModal('${rank.userId || ''}')" data-user-id="${rank.userId || ''}">
                            <div class="rank-number">${rankDisplay}</div>
                            <div class="ranking-user-info">
                                <div class="ranking-nickname">
                                    <img src="${tierImage}" alt="티어${tier}" class="tier-mark" onerror="this.style.display='none';">
                                    ${escapeHtml(rank.nickname || 'Unknown')}
                                </div>
                                <div class="ranking-stats">승 ${rank.wins || 0} 패 ${rank.losses || 0} 승률 ${winRate}%</div>
                            </div>
                            <div class="ranking-rating">${rank.rating || 0}</div>
                        </div>
                    `;
                }).join('');
            }
            
            // 주석
            if (displayedRankingsCount < maxRankings.length) {
                html += `<div id="rankingLoadMore" style="text-align: center; padding: 15px; color: #667eea; cursor: pointer; font-weight: 600;">더보기 (${maxRankings.length - displayedRankingsCount}명)</div>`;
            }
            
            // 주석
            if (list) {
                list.innerHTML = html;
                console.log('renderRankings: HTML set to list, length:', html.length, 'list element:', list);
                // 주석
                setupRankingScroll();
            }
            
            // 모바일 스와이프 페이지의 rankingList도 업데이트
            const mobileRankingList = document.getElementById('mobile-rankingList');
            if (mobileRankingList) {
                mobileRankingList.innerHTML = html;
                console.log('renderRankings: HTML set to mobile rankingList, length:', html.length);
            }
            
            // 주석
            if (mobileList) {
                const mobileRankingsToShow = maxRankings.slice(0, 20);
                let mobileHtml = '';
                
                // 주석
                if (myRanking) {
                    const myRankIndex = allRankings.findIndex(r => r.userId === currentUserId || r.nickname === currentUserNickname);
                    const myTotal = (myRanking.wins || 0) + (myRanking.losses || 0);
                    const myWinRate = myTotal > 0 ? Math.round(((myRanking.wins || 0) / myTotal) * 100) : 0;
                    const myTier = getTierFromRating(myRanking.rating || 0);
                    const myTierImage = `/images/tire${myTier}.webp`;
                    mobileHtml += `
                        <div class="my-ranking-item">
                            <div class="rank-number">${myRankIndex >= 0 ? myRankIndex + 1 : '-'}</div>
                            <div class="ranking-user-info">
                                <div class="ranking-nickname">
                                    <img src="${myTierImage}" alt="티어${myTier}" class="tier-mark" onerror="this.style.display='none';">
                                    ${escapeHtml(myRanking.nickname)}
                                </div>
                                <div class="ranking-stats">승 ${myRanking.wins || 0} 패 ${myRanking.losses || 0} 승률 ${myWinRate}%</div>
                            </div>
                            <div class="ranking-rating">${myRanking.rating || 0}</div>
                        </div>
                    `;
                } else {
                    // 주석
                    const myWins = 0;
                    const myLosses = 0;
                    const myRating = 0;
                    const myTotal = myWins + myLosses;
                    const myWinRate = myTotal > 0 ? Math.round((myWins / myTotal) * 100) : 0;
                    const myTier = getTierFromRating(myRating);
                    const myTierImage = `/images/tire${myTier}.webp`;
                    mobileHtml += `
                        <div class="my-ranking-item">
                            <div class="rank-number">-</div>
                            <div class="ranking-user-info">
                                <div class="ranking-nickname">
                                    <img src="${myTierImage}" alt="티어${myTier}" class="tier-mark" onerror="this.style.display='none';">
                                    ${escapeHtml(currentUserNickname)}
                                </div>
                                <div class="ranking-stats">승 ${myWins} 패 ${myLosses} 승률 ${myWinRate}%</div>
                            </div>
                            <div class="ranking-rating">${myRating}</div>
                        </div>
                    `;
                }
                
                // 주석
                if (mobileRankingsToShow.length > 0) {
                    mobileHtml += mobileRankingsToShow.map((rank, index) => {
                        const actualRank = allRankings.findIndex(r => 
                            (r.userId && rank.userId && r.userId === rank.userId) || 
                            (r.nickname && rank.nickname && r.nickname === rank.nickname)
                        ) + 1;
                        const displayRank = actualRank > 0 ? actualRank : (index + 1);
                        const total = (rank.wins || 0) + (rank.losses || 0);
                        const winRate = total > 0 ? Math.round(((rank.wins || 0) / total) * 100) : 0;
                        const rankClass = displayRank <= 3 ? `rank-${displayRank}` : '';
                        const tier = getTierFromRating(rank.rating || 0);
                        const tierImage = `/images/tire${tier}.webp`;
                        const rankDisplay = displayRank <= 3 ? ['🥇', '🥈', '🥉'][displayRank - 1] : `#${displayRank}`;
                        return `
                            <div class="ranking-item ${rankClass}" style="cursor: pointer;" onclick="showProfileModal('${rank.userId || ''}')" data-user-id="${rank.userId || ''}">
                                <div class="rank-number">${rankDisplay}</div>
                                <div class="ranking-user-info">
                                    <div class="ranking-nickname">
                                        <img src="${tierImage}" alt="티어${tier}" class="tier-mark" onerror="this.style.display='none';">
                                        ${escapeHtml(rank.nickname || 'Unknown')}
                                    </div>
                                    <div class="ranking-stats">승 ${rank.wins || 0} 패 ${rank.losses || 0} 승률 ${winRate}%</div>
                                </div>
                                <div class="ranking-rating">${rank.rating || 0}</div>
                            </div>
                        `;
                    }).join('');
                }
                
                mobileList.innerHTML = mobileHtml;
            }
            
            // 주석
            const mobileSidebarRankingList = document.getElementById('mobileSidebarRankingList');
            if (mobileSidebarRankingList) {
                // 주석
                const mobileSidebarRankingsToShow = maxRankings.slice(0, 20);
                let sidebarHtml = '';
                
                // 주석
                if (myRanking) {
                    const myRankIndex = allRankings.findIndex(r => r.userId === currentUserId || r.nickname === currentUserNickname);
                    const myTotal = (myRanking.wins || 0) + (myRanking.losses || 0);
                    const myWinRate = myTotal > 0 ? Math.round(((myRanking.wins || 0) / myTotal) * 100) : 0;
                    const myTier = getTierFromRating(myRanking.rating || 0);
                    const myTierImage = `/images/tire${myTier}.webp`;
                    sidebarHtml += `
                        <div class="my-ranking-item">
                            <div class="rank-number">${myRankIndex >= 0 ? myRankIndex + 1 : '-'}</div>
                            <div class="ranking-user-info">
                                <div class="ranking-nickname">
                                    <img src="${myTierImage}" alt="티어${myTier}" class="tier-mark" onerror="this.style.display='none';">
                                    ${escapeHtml(myRanking.nickname)}
                                </div>
                                <div class="ranking-stats">승 ${myRanking.wins || 0} 패 ${myRanking.losses || 0} 승률 ${myWinRate}%</div>
                            </div>
                            <div class="ranking-rating">${myRanking.rating || 0}</div>
                        </div>
                    `;
                } else {
                    const myTotal = currentUserWins + currentUserLosses;
                    const myWinRate = myTotal > 0 ? Math.round((currentUserWins / myTotal) * 100) : 0;
                    const myTier = getTierFromRating(currentUserRating || 0);
                    const myTierImage = `/images/tire${myTier}.webp`;
                    sidebarHtml += `
                        <div class="my-ranking-item">
                            <div class="rank-number">-</div>
                            <div class="ranking-user-info">
                                <div class="ranking-nickname">
                                    <img src="${myTierImage}" alt="티어${myTier}" class="tier-mark" onerror="this.style.display='none';">
                                    ${escapeHtml(currentUserNickname)}
                                </div>
                                <div class="ranking-stats">승 ${currentUserWins} 패 ${currentUserLosses} 승률 ${myWinRate}%</div>
                            </div>
                            <div class="ranking-rating">${currentUserRating}</div>
                        </div>
                    `;
                }
                
                // 주석
                if (mobileSidebarRankingsToShow.length > 0) {
                    sidebarHtml += mobileSidebarRankingsToShow.map((rank, index) => {
                        const actualRank = allRankings.findIndex(r => 
                            (r.userId && rank.userId && r.userId === rank.userId) || 
                            (r.nickname && rank.nickname && r.nickname === rank.nickname)
                        ) + 1;
                        const displayRank = actualRank > 0 ? actualRank : (index + 1);
                        const total = (rank.wins || 0) + (rank.losses || 0);
                        const winRate = total > 0 ? Math.round(((rank.wins || 0) / total) * 100) : 0;
                        const rankClass = displayRank <= 3 ? `rank-${displayRank}` : '';
                        const tier = getTierFromRating(rank.rating || 0);
                        const tierImage = `/images/tire${tier}.webp`;
                        const rankDisplay = displayRank <= 3 ? ['🥇', '🥈', '🥉'][displayRank - 1] : `#${displayRank}`;
                        return `
                            <div class="ranking-item ${rankClass}" style="cursor: pointer;" onclick="showProfileModal('${rank.userId || ''}')" data-user-id="${rank.userId || ''}">
                                <div class="rank-number">${rankDisplay}</div>
                                <div class="ranking-user-info">
                                    <div class="ranking-nickname">
                                        <img src="${tierImage}" alt="티어${tier}" class="tier-mark" onerror="this.style.display='none';">
                                        ${escapeHtml(rank.nickname || 'Unknown')}
                                    </div>
                                    <div class="ranking-stats">승 ${rank.wins || 0} 패 ${rank.losses || 0} 승률 ${winRate}%</div>
                                </div>
                                <div class="ranking-rating">${rank.rating || 0}</div>
                            </div>
                        `;
                    }).join('');
                }
                
                mobileSidebarRankingList.innerHTML = sidebarHtml;
            }
        }
        
        function setupRankingScroll() {
            const list = document.getElementById('rankingList');
            if (!list) return;
            
            // 주석
            list.removeEventListener('scroll', handleRankingScroll);
            
            // 주석
            list.addEventListener('scroll', handleRankingScroll);
            

            const loadMoreBtn = document.getElementById('rankingLoadMore');
            if (loadMoreBtn) {
                loadMoreBtn.onclick = loadMoreRankings;
            }
        }
        
        function handleRankingScroll() {
            const list = document.getElementById('rankingList');
            if (!list || isLoadingRankings) return;
            
            // 주석
            const scrollBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
            if (scrollBottom < 100) {
                loadMoreRankings();
            }
        }
        
        function loadMoreRankings() {
            if (isLoadingRankings) return;
            
            const otherRankings = allRankings.filter(r => r.userId !== currentUserId && r.nickname !== currentUserNickname);
            const maxRankings = otherRankings.slice(0, 100);
            
            if (displayedRankingsCount >= maxRankings.length) return;
            
            isLoadingRankings = true;
            displayedRankingsCount = Math.min(displayedRankingsCount + rankingsPerPage, maxRankings.length);
            
            // 주석
            
            isLoadingRankings = false;
        }

        // Stats Modal Logic (Simplified for brevity)
        function showStatsModal() {
            const modal = document.getElementById('statsModal');
            if (modal) {
                modal.style.setProperty('display', 'flex', 'important');
                modal.style.setProperty('visibility', 'visible', 'important');
                modal.style.setProperty('opacity', '1', 'important');
                modal.classList.add('show');
                statsModalOpen = true;
                document.body.style.overflow = 'hidden';
                
                // 위치 로드
                loadModalPosition('statsModal', 'rememberPositionCheckbox');
                
                // 주석
                updateGemPriceColors();
            } else {
                console.error('statsModal element not found');
            }
        }

        // 주석
        function updateGemPriceColors() {
            const userGem = window.WAITING_ROOM_CONFIG?.userGem ?? 0;
            
            // 주석
            const resetAllBtn = document.getElementById('resetAllStatsBtn');
            if (resetAllBtn) {
                const priceEl = resetAllBtn.querySelector('.gem-price');
                if (priceEl) {
                    const price = parseInt(priceEl.getAttribute('data-price')) || 300;
                    if (userGem >= price) {
                        priceEl.classList.remove('insufficient');
                        priceEl.classList.add('sufficient');
                    } else {
                        priceEl.classList.remove('sufficient');
                        priceEl.classList.add('insufficient');
                    }
                }
            }
            
            // 주석
            const resetStrategyBtn = document.getElementById('resetStrategyStatsBtn');
            if (resetStrategyBtn) {
                const priceEl = resetStrategyBtn.querySelector('.gem-price');
                if (priceEl) {
                    const price = parseInt(priceEl.getAttribute('data-price')) || 200;
                    if (userGem >= price) {
                        priceEl.classList.remove('insufficient');
                        priceEl.classList.add('sufficient');
                    } else {
                        priceEl.classList.remove('sufficient');
                        priceEl.classList.add('insufficient');
                    }
                }
            }
            
            // 주석
            const resetCasualBtn = document.getElementById('resetCasualStatsBtn');
            if (resetCasualBtn) {
                const priceEl = resetCasualBtn.querySelector('.gem-price');
                if (priceEl) {
                    const price = parseInt(priceEl.getAttribute('data-price')) || 200;
                    if (userGem >= price) {
                        priceEl.classList.remove('insufficient');
                        priceEl.classList.add('sufficient');
                    } else {
                        priceEl.classList.remove('sufficient');
                        priceEl.classList.add('insufficient');
                    }
                }
            }
            

            // 전체 전적 초기화 버튼
            const partialBtns = document.querySelectorAll('.gem-btn-small');
            partialBtns.forEach(btn => {
                const priceEl = btn.querySelector('.gem-price-small');
                if (priceEl) {
                    const price = parseInt(priceEl.getAttribute('data-price')) || 100;
                    if (userGem >= price) {
                        priceEl.classList.remove('insufficient');
                        priceEl.classList.add('sufficient');
                    } else {
                        priceEl.classList.remove('sufficient');
                        priceEl.classList.add('insufficient');
                    }
                }
            });
        }

        // 주석
        function setupDraggableModals() {
            makeModalDraggable('statsModal', 'statsModalHeader');
            makeModalDraggable('gameRequestModal', 'requestModalHeader');
            
            // 紐⑤떖 ?꾩튂 濡쒕뱶
            loadModalPosition('statsModal', 'rememberPositionCheckbox');
            loadModalPosition('gameRequestModal', 'requestModalRememberPosition');
        }

        function makeModalDraggable(modalId, headerId) {
            const modal = document.getElementById(modalId);
            const content = modal.querySelector('.stats-modal-content');
            const header = document.getElementById(headerId) || content.querySelector('.stats-modal-header');
            
            if (!header || !content) return;

            let isDragging = false;
            let currentX;
            let currentY;
            let initialX;
            let initialY;
            let xOffset = 0;
            let yOffset = 0;

            header.style.cursor = 'move';

            header.addEventListener('mousedown', dragStart);
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', dragEnd);

            function dragStart(e) {
                if (e.target.closest('.close-modal') || e.target.closest('button')) return;

                const rect = content.getBoundingClientRect();
                
                // 주석
                if (content.style.position !== 'fixed') {
                    // 주석
                    const actualLeft = rect.left;
                    const actualTop = rect.top;
                    
                    // 주석
                    content.style.position = 'fixed';
                    content.style.left = actualLeft + 'px';
                    content.style.top = actualTop + 'px';
                    content.style.margin = '0';
                    content.style.transform = 'none';
                    
                    xOffset = 0;
                    yOffset = 0;
                } else {
                    // 주석
                    const transform = content.style.transform;
                    if (transform && transform !== 'none') {
                        const match = transform.match(/translate3d\(([^,]+)px,\s*([^,]+)px/);
                        if (match) {
                            xOffset = parseFloat(match[1]) || 0;
                            yOffset = parseFloat(match[2]) || 0;
                        }
                    }
                }

                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;

                if (e.target === header || header.contains(e.target)) {
                    isDragging = true;
                }
            }

            function drag(e) {
                if (isDragging) {
                    e.preventDefault();
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;

                    xOffset = currentX;
                    yOffset = currentY;

                    // 주석
                    const rect = content.getBoundingClientRect();
                    const maxX = window.innerWidth - rect.width;
                    const maxY = window.innerHeight - rect.height;
                    
                    const boundedX = Math.max(-rect.left, Math.min(currentX, maxX - parseFloat(content.style.left || 0)));
                    const boundedY = Math.max(-rect.top, Math.min(currentY, maxY - parseFloat(content.style.top || 0)));

                    setTranslate(boundedX, boundedY, content);
                }
            }

            function setTranslate(xPos, yPos, el) {
                el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
            }

            function dragEnd(e) {
                if (!isDragging) return;
                
                initialX = currentX;
                initialY = currentY;
                isDragging = false;

                // 주석
                const checkboxId = modalId === 'statsModal' ? 'rememberPositionCheckbox' : 'requestModalRememberPosition';
                const checkbox = document.getElementById(checkboxId);
                if (checkbox && checkbox.checked) {
                    saveModalPosition(modalId, content);
                }
            }
        }

        function saveModalPosition(modalId, content) {
            const rect = content.getBoundingClientRect();
            const position = {
                left: content.style.left,
                top: content.style.top,
                transform: content.style.transform
            };
            localStorage.setItem(`modal_pos_${modalId}`, JSON.stringify(position));
        }

        function loadModalPosition(modalId, checkboxId) {
            const saved = localStorage.getItem(`modal_pos_${modalId}`);
            const checkbox = document.getElementById(checkboxId);
            const modal = document.getElementById(modalId);
            if (!modal) return;
            
            const content = modal.querySelector('.stats-modal-content');
            if (!content) return;
            
            // 주석
            const resetToCenter = () => {
                content.style.position = '';
                content.style.left = '';
                content.style.top = '';
                content.style.transform = '';
                content.style.margin = 'auto';
            };
            
            // 주석
            if (window.innerWidth <= 768) {
                resetToCenter();
                return;
            }
            
            // 주석
            if (saved && checkbox && checkbox.checked) {
                try {
                    const pos = JSON.parse(saved);
                    if (content && pos.left && pos.top) {
                        // ??λ맂 ?꾩튂媛 ?좏슚?쒖? ?뺤씤
                        const left = parseInt(pos.left) || 0;
                        const top = parseInt(pos.top) || 0;
                        
                        // 주석
                        const maxLeft = window.innerWidth - content.offsetWidth;
                        const maxTop = window.innerHeight - content.offsetHeight;
                        
                        const finalLeft = Math.max(0, Math.min(left, maxLeft));
                        const finalTop = Math.max(0, Math.min(top, maxTop));
                        
                        content.style.position = 'fixed';
                        content.style.left = finalLeft + 'px';
                        content.style.top = finalTop + 'px';
                        content.style.transform = pos.transform || '';
                        content.style.margin = '0';
                        return;
                    }
                } catch (e) {
                    console.error('Error loading modal position:', e);
                }
            }
            
            // 주석
            resetToCenter();
        }

        // 주석
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupDraggableModals);
        } else {
            setupDraggableModals();
        }

        function closeStatsModal() {
            const modal = document.getElementById('statsModal');
            if (modal) {
                modal.classList.remove('show');
                modal.style.setProperty('display', 'none', 'important');
                modal.style.setProperty('visibility', 'hidden', 'important');
                modal.style.setProperty('opacity', '0', 'important');
                statsModalOpen = false;
                document.body.style.overflow = '';
            }
        }

        // 모달 닫기 버튼 이벤트 리스너 설정
        function setupStatsModalListeners() {
            const closeBtn = document.getElementById('closeStatsModalBtn');
            if (closeBtn) {
                closeBtn.addEventListener('click', closeStatsModal);
            }
            
            // 모달 배경 클릭 시 닫기
            const modal = document.getElementById('statsModal');
            if (modal) {
                modal.addEventListener('click', function(e) {
                    if (e.target === modal || e.target.id === 'statsModal') {
                        closeStatsModal();
                    }
                });
            }
            
            // ESC 키로 닫기
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && statsModalOpen) {
                    closeStatsModal();
                }
            });
        }

        // DOMContentLoaded 또는 즉시 실행
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupStatsModalListeners);
        } else {
            setupStatsModalListeners();
        }
        
        // Tab switching - 전역 스코프에 노출
        window.switchStatsTab = function(tabName) {
            const tabs = document.querySelectorAll('.stats-tab');
            tabs.forEach((t) => {
                t.classList.remove('active');
            });
            
            // 활성화할 탭 찾기
            tabs.forEach((t) => {
                if (tabName === 'strategy' && t.textContent.includes('전략바둑')) {
                    t.classList.add('active');
                } else if (tabName === 'casual' && t.textContent.includes('놀이바둑')) {
                    t.classList.add('active');
                }
            });
            
            // 탭 컨텐츠 전환
            document.querySelectorAll('.stats-tab-content').forEach((c) => {
                c.classList.remove('active');
                if (c.id === `${tabName}Tab`) {
                    c.classList.add('active');
                }
            });
            
            // 젬 가격 색상 업데이트
            updateGemPriceColors();
        };
        
        // 전체 전적 초기화 - 전역 스코프에 노출
        window.resetAllStats = async function() {
            if (!confirm('전체 전적을 초기화하시겠습니까? (300젬 소모)')) {
                return;
            }
            
            try {
                const response = await fetch('/api/user/reset-all-stats', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include'
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    showAlertModal(data.error || '전적 초기화에 실패했습니다.', '오류', 'error');
                    return;
                }
                
                showAlertModal(data.message || '전체 전적이 초기화되었습니다.', '성공', 'success');
                
                // 젬 업데이트
                if (window.WAITING_ROOM_CONFIG) {
                    window.WAITING_ROOM_CONFIG.userGem = (window.WAITING_ROOM_CONFIG.userGem || 0) - 300;
                }
                
                // 전적 새로고침
                location.reload();
            } catch (error) {
                console.error('Reset all stats error:', error);
                showAlertModal('전적 초기화 중 오류가 발생했습니다.', '오류', 'error');
            }
        };
        
        // 전략바둑 전적 초기화 - 전역 스코프에 노출
        window.resetStrategyStats = async function() {
            if (!confirm('전략바둑 전적을 초기화하시겠습니까? (200젬 소모)')) {
                return;
            }
            
            try {
                const response = await fetch('/api/user/reset-strategy-stats', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include'
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    showAlertModal(data.error || '전적 초기화에 실패했습니다.', '오류', 'error');
                    return;
                }
                
                showAlertModal(data.message || '전략바둑 전적이 초기화되었습니다.', '성공', 'success');
                
                // 젬 업데이트
                if (window.WAITING_ROOM_CONFIG) {
                    window.WAITING_ROOM_CONFIG.userGem = (window.WAITING_ROOM_CONFIG.userGem || 0) - 200;
                }
                
                // 전적 새로고침
                location.reload();
            } catch (error) {
                console.error('Reset strategy stats error:', error);
                showAlertModal('전적 초기화 중 오류가 발생했습니다.', '오류', 'error');
            }
        };
        
        // 놀이바둑 전적 초기화 - 전역 스코프에 노출
        window.resetCasualStats = async function() {
            if (!confirm('놀이바둑 전적을 초기화하시겠습니까? (200젬 소모)')) {
                return;
            }
            
            try {
                const response = await fetch('/api/user/reset-casual-stats', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include'
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    showAlertModal(data.error || '전적 초기화에 실패했습니다.', '오류', 'error');
                    return;
                }
                
                showAlertModal(data.message || '놀이바둑 전적이 초기화되었습니다.', '성공', 'success');
                
                // 젬 업데이트
                if (window.WAITING_ROOM_CONFIG) {
                    window.WAITING_ROOM_CONFIG.userGem = (window.WAITING_ROOM_CONFIG.userGem || 0) - 200;
                }
                
                // 전적 새로고침
                location.reload();
            } catch (error) {
                console.error('Reset casual stats error:', error);
                showAlertModal('전적 초기화 중 오류가 발생했습니다.', '오류', 'error');
            }
        };
        
        // 부분 전적 초기화 - 전역 스코프에 노출
        window.resetPartialStats = async function(mode) {
            const modeNames = {
                'CLASSIC': '클래식바둑',
                'CAPTURE': '캡쳐바둑',
                'SPEED': '스피드바둑',
                'BASE': '베이스바둑',
                'HIDDEN': '히든바둑',
                'MISSILE': '미사일바둑',
                'MIX': '믹스바둑',
                'DICE': '주사위바둑',
                'COPS': '주사위바둑2',
                'OMOK': '오목',
                'TTAK': '따목',
                'ALKKAGI': '알까기',
                'CURLING': '바둑컬링'
            };
            
            const modeName = modeNames[mode] || mode || '선택한 모드';
            
            if (!confirm(`${modeName}의 부분 전적을 초기화하시겠습니까? (100젬 소모, 최근 10게임 제외)`)) {
                return;
            }
            
            try {
                const response = await fetch('/api/user/reset-partial-stats', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify({ mode })
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    showAlertModal(data.error || '전적 초기화에 실패했습니다.', '오류', 'error');
                    return;
                }
                
                showAlertModal(data.message || `${modeName} 부분 전적이 초기화되었습니다.`, '성공', 'success');
                
                // 젬 업데이트
                if (window.WAITING_ROOM_CONFIG) {
                    window.WAITING_ROOM_CONFIG.userGem = (window.WAITING_ROOM_CONFIG.userGem || 0) - 100;
                }
                
                // 전적 새로고침
                location.reload();
            } catch (error) {
                console.error('Reset partial stats error:', error);
                showAlertModal('전적 초기화 중 오류가 발생했습니다.', '오류', 'error');
            }
        };

        // 주석
        let isScaling = false;
        function scaleLayout() {
            // 대기실의 메인 container만 선택 (stats-modal 안의 container 제외)
            // body의 직접 자식인 container 찾기
            const bodyChildren = Array.from(document.body.children);
            let container = bodyChildren.find(el => {
                // container 클래스를 가지고 있고
                if (!el.classList.contains('container')) return false;
                // stats-modal 안에 있지 않고
                if (el.closest('.stats-modal')) return false;
                // 다른 모달 안에 있지 않고
                if (el.closest('[class*="modal"]')) return false;
                // body의 직접 자식이어야 함
                return el.parentElement === document.body;
            });
            
            // 찾지 못하면 모든 container를 확인하여 body의 직접 자식인 것 찾기
            if (!container) {
                const allContainers = document.querySelectorAll('.container');
                for (const c of allContainers) {
                    if (c.parentElement === document.body && !c.closest('.stats-modal') && !c.closest('[class*="modal"]')) {
                        container = c;
                        break;
                    }
                }
            }
            
            // Container를 찾지 못하면 .waiting-room-grid의 부모를 찾기
            if (!container) {
                const waitingRoomGrid = document.querySelector('.waiting-room-grid');
                if (waitingRoomGrid) {
                    const gridContainer = waitingRoomGrid.closest('.container');
                    // stats-modal 안에 있지 않은 container만 사용
                    if (gridContainer && !gridContainer.closest('.stats-modal') && gridContainer.parentElement === document.body) {
                        container = gridContainer;
                    }
                }
            }
            
            // 여전히 찾지 못하면 함수 종료
            if (!container || isScaling) {
                console.warn('Waiting room container not found, skipping scaleLayout');
                return;
            }
            
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // 주석
            if (viewportWidth <= 768) {
                container.style.transform = '';
                container.style.width = '100%';
                container.style.maxWidth = '100%';
                return;
            }
            
            isScaling = true;
            
            const baseWidth = 1600;
            const header = document.querySelector('header');
            const headerHeight = header ? header.offsetHeight : 80;
            const padding = 40;
            
            // 주석
            const availableWidth = viewportWidth - padding;
            const availableHeight = viewportHeight - headerHeight - padding - 20;
            
            // 주석
            const scaleX = availableWidth / baseWidth;
            
            // Container의 실제 높이를 강제로 계산
            // Grid가 없으면 최소 높이 사용
            const grid = container.querySelector('.waiting-room-grid');
            let containerHeight = 800; // 기본 높이
            
            if (grid) {
                // Grid의 computed height 사용
                const gridComputedHeight = parseInt(window.getComputedStyle(grid).height) || 600;
                containerHeight = Math.max(gridComputedHeight, 600);
            }
            
            // Container의 scrollHeight도 확인
            if (container.scrollHeight > 0) {
                containerHeight = Math.max(container.scrollHeight, containerHeight);
            }
            
            const scaleY = availableHeight / containerHeight;
            
            // 주석
            const minScale = Math.max(0.5, Math.min(scaleX, scaleY));
            const finalScale = Math.min(1.0, minScale);
            
            // 주석
            container.style.transform = `scale(${finalScale})`;
            container.style.transformOrigin = 'top center';
            container.style.width = `${baseWidth}px`;
            container.style.minHeight = `${containerHeight}px`;
            
            // 주석
            const scaledHeight = containerHeight * finalScale;
            document.body.style.minHeight = `${scaledHeight + headerHeight + 100}px`;
            
            isScaling = false;
        }

        const observer = new MutationObserver((mutations) => {
            if (isScaling) return;
            let shouldIgnore = false;
            for (const mutation of mutations) {
                const target = mutation.target;
                if (target && (
                    target.id === 'emojiPopup' || target.closest('#emojiPopup') ||
                    target.id === 'statsModal' || target.closest('#statsModal') ||
                    target.id === 'gameRequestModal' || target.closest('#gameRequestModal') ||
                    target.closest('.stats-modal')
                )) {
                    shouldIgnore = true;
                    break;
                }
            }
            if (!shouldIgnore) {
                // 주석
                setTimeout(() => scaleLayout(), 10);
            }
        });
        
        const container = document.querySelector('.container');
        if (container) {
            observer.observe(container, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class']
            });
        }

        // 화면 크기 변경시 레이아웃 조정
        window.addEventListener('resize', () => {
            clearTimeout(window.scaleTimeout);
            window.scaleTimeout = setTimeout(scaleLayout, 100);
        });
        window.addEventListener('load', () => {
            setTimeout(scaleLayout, 100);
        });
        // DOMContentLoaded 후에도 실행
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(scaleLayout, 100);
            });
        } else {
            setTimeout(scaleLayout, 100);
        }

        // 주석
        function initMobileSidebar() {
            // 주석
            const mobileSidebarToggleLeft = document.getElementById('mobileSidebarToggleLeft');
            const mobileSidebarDrawerLeft = document.getElementById('mobileSidebarDrawerLeft');
            const mobileSidebarWrapperLeft = document.getElementById('mobileSidebarWrapperLeft');
            const mobileSidebarOverlayLeft = document.getElementById('mobileSidebarOverlayLeft');
            
            // 주석
            const mobileSidebarToggleRight = document.getElementById('mobileSidebarToggleRight');
            const mobileSidebarDrawerRight = document.getElementById('mobileSidebarDrawerRight');
            const mobileSidebarWrapperRight = document.getElementById('mobileSidebarWrapperRight');
            const mobileSidebarOverlayRight = document.getElementById('mobileSidebarOverlayRight');

            // 주석
            function isMobile() {
                return window.innerWidth <= 768;
            }

            // 주석
            function populateLeftSidebar() {
                if (!mobileSidebarWrapperLeft || !isMobile()) {
                    return;
                }

                // 주석
                mobileSidebarWrapperLeft.innerHTML = '';

                // 주석
                let profilePanel = document.querySelector('.profile-panel');
                if (profilePanel) {
                    const clonedProfile = profilePanel.cloneNode(true);
                    clonedProfile.style.display = 'flex';
                    clonedProfile.style.flexDirection = 'column';
                    mobileSidebarWrapperLeft.appendChild(clonedProfile);
                }

                // 梨꾪똿李?蹂듭궗
                let chatPanel = document.querySelector('.panel.chat-panel');
                if (!chatPanel) {
                    chatPanel = document.querySelector('#chatMessages')?.closest('.panel');
                }
                if (chatPanel) {
                    const clonedChat = chatPanel.cloneNode(true);
                    clonedChat.style.display = 'flex';
                    clonedChat.style.flexDirection = 'column';
                    const mainChatMessages = document.getElementById('chatMessages');
                    clonedChat.querySelectorAll('[id]').forEach((el) => {
                        if (el.id === 'chatMessages') {
                            el.id = 'mobileSidebarChatMessages';
                        } else {
                            el.id = 'mobileSidebar' + el.id.charAt(0).toUpperCase() + el.id.slice(1);
                        }
                    });
                    mobileSidebarWrapperLeft.appendChild(clonedChat);
                    
                    // 주석
                    const mobileChatMessages = document.getElementById('mobileSidebarChatMessages');
                    if (mainChatMessages && mobileChatMessages) {
                        mobileChatMessages.innerHTML = mainChatMessages.innerHTML;
                    }
                    
                    setTimeout(() => {
                        setupMobileChatListeners();
                    }, 100);
                }
            }
            
            // 주석
            function populateRightSidebar() {
                if (!mobileSidebarWrapperRight || !isMobile()) {
                    return;
                }

                // 주석
                mobileSidebarWrapperRight.innerHTML = '';

                // 주석
                let rankingBoard = document.querySelector('.panel.ranking-board');
                if (!rankingBoard) {
                    rankingBoard = document.querySelector('#rankingList')?.closest('.panel');
                }
                if (rankingBoard) {
                    const clonedRanking = rankingBoard.cloneNode(true);
                    clonedRanking.style.display = 'flex';
                    clonedRanking.style.flexDirection = 'column';
                    const rankingList = clonedRanking.querySelector('#rankingList');
                    if (rankingList) {
                        rankingList.id = 'mobileSidebarRankingList';
                    }
                    mobileSidebarWrapperRight.appendChild(clonedRanking);
                    
                    setTimeout(() => {
                        if (typeof updateRankingBoard === 'function') {
                            updateRankingBoard();
                        }
                    }, 200);
                }
            }
            
            // 주석
            function setupMobileChatListeners() {
                const emojiBtn = document.getElementById('mobileSidebarEmojiBtn') || document.querySelector('.mobile-sidebar-wrapper #emojiBtn');
                const chatSendBtn = document.getElementById('mobileSidebarChatSendBtn') || document.querySelector('.mobile-sidebar-wrapper #chatSendBtn');
                const chatInput = document.getElementById('mobileSidebarChatInput') || document.querySelector('.mobile-sidebar-wrapper #chatInput');
                const emojiPopup = document.getElementById('mobileSidebarEmojiPopup') || document.querySelector('.mobile-sidebar-wrapper #emojiPopup');
                
                if (!emojiBtn || !chatSendBtn || !chatInput) return;
                
                // 주석
                const newEmojiBtn = emojiBtn.cloneNode(true);
                emojiBtn.parentNode.replaceChild(newEmojiBtn, emojiBtn);
                const newChatSendBtn = chatSendBtn.cloneNode(true);
                chatSendBtn.parentNode.replaceChild(newChatSendBtn, chatSendBtn);
                const newChatInput = chatInput.cloneNode(true);
                chatInput.parentNode.replaceChild(newChatInput, chatInput);
                
                // 주석
                newEmojiBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (emojiPopup) {
                        emojiPopup.classList.toggle('show');
                    }
                });

                // 주석
                const clickHandler = function(e) {
                    if (emojiPopup && !emojiPopup.contains(e.target) && e.target !== newEmojiBtn && !newEmojiBtn.contains(e.target)) {
                        emojiPopup.classList.remove('show');
                    }
                };
                document.addEventListener('click', clickHandler);

                // 주석
                const emojiTabs = document.querySelectorAll('.mobile-sidebar-wrapper .emoji-tab');
                emojiTabs.forEach(tab => {
                    tab.addEventListener('click', function() {
                        const tabName = this.dataset.tab;
                        emojiTabs.forEach(t => t.classList.remove('active'));
                        document.querySelectorAll('.mobile-sidebar-wrapper .emoji-section').forEach(s => s.classList.remove('active'));
                        this.classList.add('active');
                        // ID로 찾기
                        const section = tabName === 'emoji' 
                            ? document.getElementById('mobileSidebarEmojiSection')
                            : document.getElementById('mobileSidebarQuickSection');
                        if (section) section.classList.add('active');
                    });
                });

                // ?대え吏 ?대┃
                const emojiItems = document.querySelectorAll('.mobile-sidebar-wrapper .emoji-item');
                emojiItems.forEach(item => {
                    item.addEventListener('click', function() {
                        if (newChatInput) {
                            newChatInput.value += this.textContent;
                            newChatInput.focus();
                        }
                    });
                });

                // 주석
                const quickMessageBtns = document.querySelectorAll('.mobile-sidebar-wrapper .quick-message-btn');
                quickMessageBtns.forEach(btn => {
                    btn.addEventListener('click', function() {
                        if (newChatInput) {
                            newChatInput.value = this.textContent;
                            newChatInput.focus();
                        }
                    });
                });

            // 모바일 사이드바 채팅 쿨타임 관리
            let mobileLastChatTime = 0;
            let mobileLastChatMessage = '';
            let mobileChatCooldownInterval = null;
            const MOBILE_CHAT_COOLDOWN = 3000;
            
            // 주석
            function startMobileChatCooldown() {
                let countdownEl = document.getElementById('mobileSidebarChatCountdown');
                if (!countdownEl) {
                    // 주석
                    const wrapper = newChatInput?.parentElement;
                        if (wrapper) {
                            countdownEl = wrapper.querySelector('.chat-countdown');
                            if (!countdownEl) {
                                countdownEl = document.createElement('div');
                                countdownEl.className = 'chat-countdown';
                                countdownEl.id = 'mobileSidebarChatCountdown';
                                countdownEl.style.display = 'none';
                                wrapper.appendChild(countdownEl);
                            } else {
                                countdownEl.id = 'mobileSidebarChatCountdown';
                            }
                        }
                    }
                    
                    if (!countdownEl) return;

                    let remaining = 3;
                    countdownEl.textContent = remaining;
                    countdownEl.style.display = 'block';
                    
                    if (newChatSendBtn) {
                        newChatSendBtn.disabled = true;
                    }

                    if (mobileChatCooldownInterval) {
                        clearInterval(mobileChatCooldownInterval);
                    }

                    mobileChatCooldownInterval = setInterval(() => {
                        remaining--;
                        if (remaining > 0) {
                            countdownEl.textContent = remaining;
                        } else {
                            countdownEl.style.display = 'none';
                            if (newChatSendBtn) {
                                newChatSendBtn.disabled = false;
                            }
                            clearInterval(mobileChatCooldownInterval);
                            mobileChatCooldownInterval = null;
                        }
                    }, 1000);
                }

                // 硫붿떆吏 ?꾩넚
            function sendChatMessage() {
                if (!newChatInput || !newChatInput.value.trim()) {
                        return;
                    }
                    
                    const message = newChatInput.value.trim();
                    const currentTime = Date.now();
                    
                    // 주석
                    if (currentTime - mobileLastChatTime < MOBILE_CHAT_COOLDOWN) {
                        const remaining = Math.ceil((MOBILE_CHAT_COOLDOWN - (currentTime - mobileLastChatTime)) / 1000);
                        let countdownEl = document.getElementById('mobileSidebarChatCountdown');
                        if (!countdownEl && newChatInput?.parentElement) {
                            countdownEl = newChatInput.parentElement.querySelector('.chat-countdown');
                        }
                        if (countdownEl) {
                            countdownEl.textContent = remaining;
                            countdownEl.style.display = 'block';
                        }
                        return;
                    }
                    
                    // 주석
                    if (message === mobileLastChatMessage) {
                        alert('媛숈? 硫붿떆吏곗냽?쇰줈 ?꾩넚놁뒿?덈떎.');
                        return;
                    }
                    
                    // 주석
                    if (typeof socket !== 'undefined' && socket) {
                        console.log('Sending mobile chat message:', message);
                        socket.emit('chat_message', {
                            message: message,
                            timestamp: currentTime
                        });
                    }
                    
                    // 주석
                    mobileLastChatMessage = message;
                    
                    newChatInput.value = '';
                    if (emojiPopup) emojiPopup.classList.remove('show');
                    
                    // 주석
                    startMobileChatCooldown();
                }

                newChatSendBtn.addEventListener('click', sendChatMessage);

                newChatInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        sendChatMessage();
                    }
                });
            }


            // 좌측 모바일 사이드바 토글 이벤트
            if (mobileSidebarToggleLeft && mobileSidebarDrawerLeft) {
                mobileSidebarToggleLeft.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isActive = mobileSidebarDrawerLeft.classList.toggle('active');
                    mobileSidebarToggleLeft.classList.toggle('active', isActive);
                    mobileSidebarToggleLeft.classList.toggle('sidebar-open', isActive);
                    
                    if (isActive && isMobile()) {
                        setTimeout(() => {
                            populateLeftSidebar();
                        }, 50);
                    }
                });

                mobileSidebarOverlayLeft?.addEventListener('click', () => {
                    mobileSidebarDrawerLeft.classList.remove('active');
                    mobileSidebarToggleLeft.classList.remove('active');
                    mobileSidebarToggleLeft.classList.remove('sidebar-open');
                });
            }
            

            if (mobileSidebarToggleRight && mobileSidebarDrawerRight) {
                mobileSidebarToggleRight.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isActive = mobileSidebarDrawerRight.classList.toggle('active');
                    mobileSidebarToggleRight.classList.toggle('active', isActive);
                    mobileSidebarToggleRight.classList.toggle('sidebar-open', isActive);
                    
                    if (isActive && isMobile()) {
                        setTimeout(() => {
                            populateRightSidebar();
                        }, 50);
                    }
                });

                mobileSidebarOverlayRight?.addEventListener('click', () => {
                    mobileSidebarDrawerRight.classList.remove('active');
                    mobileSidebarToggleRight.classList.remove('active');
                    mobileSidebarToggleRight.classList.remove('sidebar-open');
                });
            }
            
            // 주석
            let resizeTimeout;
            function handleResize() {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    if (!isMobile()) {
                        // ?곗뒪?ы넲?대㈃ ?ъ씠?쒕컮 ?リ린
                        mobileSidebarDrawerLeft?.classList.remove('active');
                        mobileSidebarDrawerRight?.classList.remove('active');
                        mobileSidebarToggleLeft?.classList.remove('active', 'sidebar-open');
                        mobileSidebarToggleRight?.classList.remove('active', 'sidebar-open');
                    }
                }, 100);
            }
            
            // 주석
            function initSidebarContent() {
                if (isMobile()) {
                    setTimeout(() => {
                        populateLeftSidebar();
                        populateRightSidebar();
                    }, 300);
                }
            }
            
            // 주석
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initSidebarContent);
            } else {
                initSidebarContent();
            }
            
            // 주석
            window.addEventListener('load', () => {
                if (isMobile()) {
                    setTimeout(() => {
                        populateLeftSidebar();
                        populateRightSidebar();
                    }, 500);
                }
            });

            // 주석
            window.addEventListener('resize', handleResize);
        }

        // 주석
        function initMobileSwipePages() {
            // 주석
            if (window.innerWidth > 768) return;
            
            const swipeContainer = document.getElementById('mobileSwipeContainer');
            const pageIndicator = document.getElementById('mobilePageIndicator');
            const dots = document.querySelectorAll('.page-indicator-dot');
            
            if (!swipeContainer || !pageIndicator) return;
            
            // 紐⑤컮?쇱뿉?쒕쭔 ?쒖떆
            if (pageIndicator) pageIndicator.style.display = 'flex';
            if (swipeContainer) swipeContainer.style.display = 'flex';
            
            let currentPage = 0;
            const totalPages = 5;
            let touchStartX = 0;
            let touchStartY = 0;
            let isDragging = false;
            let startTranslate = 0;
            let currentTranslate = 0;
            let isScrolling = false; // ?대? 肄섑뀗痢ㅽ겕濡?以묒씤吏 ?뺤씤
            const minSwipeDistance = 80; // 스와이프 최소 거리 임계값
            const maxVerticalDistance = 50; // 수직 이동 최대 거리 임계값
            const swipeThreshold = 0.25; // 화면의 25% 이상 스와이프해야 화면 전환
            
            function updatePage(pageIndex, smooth = true) {
                if (pageIndex < 0 || pageIndex >= totalPages) return;
                
                currentPage = pageIndex;
                // 주석
                const translateX = -pageIndex * 100;
                
                // 주석
                if (smooth) {
                    swipeContainer.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                } else {
                    swipeContainer.style.transition = 'none';
                }
                
                swipeContainer.style.transform = `translateX(${translateX}vw)`;
                currentTranslate = translateX;
                
                // ?몃뵒耳?댄꽣 ?낅뜲?댄듃
                dots.forEach((dot, index) => {
                    dot.classList.toggle('active', index === currentPage);
                });
                
                // 주석
                setTimeout(() => {
                    populatePageContent(currentPage);
                }, 100);
            }
            
            function populatePageContent(pageIndex) {
                const page = document.querySelector(`.mobile-swipe-page[data-page="${pageIndex}"]`);
                if (!page || page.dataset.populated === 'true') return;
                
                // 주석
                const container = document.createElement('div');
                container.className = 'container';
                
                // 주석
                if (pageIndex === 0) {

            const profilePanel = document.querySelector('.waiting-room-grid .profile-panel');
                    if (profilePanel) {
                        const cloned = profilePanel.cloneNode(true);
                        // 주석
                        cloned.querySelectorAll('[id]').forEach(el => {
                            if (el.id) el.id = 'mobile-' + el.id;
                        });
                        container.appendChild(cloned);
                        page.appendChild(container);
                        page.dataset.populated = 'true';
                    }
                } else if (pageIndex === 1) {
                    // ?좎?紐⑸줉
                    const onlineUsers = document.querySelector('.waiting-room-grid .online-users');
                    if (onlineUsers) {
                        const cloned = onlineUsers.cloneNode(true);
                        cloned.querySelectorAll('[id]').forEach(el => {
                            if (el.id) el.id = 'mobile-' + el.id;
                        });
                        container.appendChild(cloned);
                        page.appendChild(container);
                        page.dataset.populated = 'true';
                    }
                } else if (pageIndex === 2) {
                    // ?援?떎紐⑸줉
                    const ongoingGames = document.querySelector('.waiting-room-grid .ongoing-games');
                    if (ongoingGames) {
                        const cloned = ongoingGames.cloneNode(true);
                        cloned.querySelectorAll('[id]').forEach(el => {
                            if (el.id) el.id = 'mobile-' + el.id;
                        });
                        container.appendChild(cloned);
                        page.appendChild(container);
                        page.dataset.populated = 'true';
                    }
                } else if (pageIndex === 3) {

            const rankingBoard = document.querySelector('.waiting-room-grid .ranking-board');
                    if (rankingBoard) {
                        const cloned = rankingBoard.cloneNode(true);
                        cloned.querySelectorAll('[id]').forEach(el => {
                            if (el.id) el.id = 'mobile-' + el.id;
                        });
                        container.appendChild(cloned);
                        page.appendChild(container);
                        page.dataset.populated = 'true';
                    }
                } else if (pageIndex === 4) {
                    // 梨꾪똿李쎈쭔
                    const chatPanel = document.querySelector('.waiting-room-grid .chat-panel');
                    if (chatPanel) {
                        const cloned = chatPanel.cloneNode(true);
                        cloned.querySelectorAll('[id]').forEach(el => {
                            if (el.id) el.id = 'mobile-' + el.id;
                        });
                        container.appendChild(cloned);
                        page.appendChild(container);
                        page.dataset.populated = 'true';
                    }
                }
            }
            
            function nextPage() {
                if (currentPage < totalPages - 1) {
                    updatePage(currentPage + 1, true); // ?ㅻ깄 ?④낵 ?곸슜
                }
            }
            
            function prevPage() {
                if (currentPage > 0) {
                    updatePage(currentPage - 1, true);
                }
            }
        }
        
        // 주석
        initMobileSwipePages();
    })();