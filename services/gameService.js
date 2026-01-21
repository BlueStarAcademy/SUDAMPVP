const prisma = require('../config/database');
const { getRedisClient } = require('../config/redis');
const timerService = require('./timerService');

class GameService {
    constructor() {
        // Redis가 없을 때를 대비한 메모리 캐시 (게임 생성 시 설정값 저장)
        this.gameSettingsCache = new Map(); // gameId -> { boardSize, timeLimit, byoyomiSeconds, byoyomiPeriods }
    }
    async createGame(blackId, whiteId, blackRating, whiteRating, options = {}) {
        console.log('[GameService] createGame called with options:', JSON.stringify(options, null, 2));
        
        // 베이스바둑은 기본 덤 0.5집으로 설정 (덤 제시 과정 후 재설정됨)
        const initialKomi = (options.mode === 'BASE') ? 0.5 : (options.komi !== undefined && options.komi !== null ? options.komi : 6.5);
        
        const game = await prisma.game.create({
            data: {
                blackId,
                whiteId,
                blackRating,
                whiteRating,
                matchType: options.matchType || 'RANKED',
                mode: options.mode || 'CLASSIC',
                komi: initialKomi,
                startedAt: null, // 경기 준비 모달 후에만 시작되도록 null로 설정
            },
        });

        // Initialize timer
        const isSpeedMode = game.mode === 'SPEED';
        // 모든 모드에서 timeLimit 사용 (분 단위로 전달되므로 초로 변환)
        // timeLimit이 없으면 스피드바둑은 10분, 다른 모드는 30분 기본값
        const timeLimitMinutes = options.timeLimit !== undefined && options.timeLimit !== null ? options.timeLimit : (isSpeedMode ? 10 : 30);
        const timePerPlayer = timeLimitMinutes * 60;
        
        // 초읽기 설정: 명시적으로 전달된 값이 있으면 사용, 없으면 기본값
        const byoyomiSeconds = options.byoyomiSeconds !== undefined && options.byoyomiSeconds !== null ? options.byoyomiSeconds : 30;
        const byoyomiPeriods = options.byoyomiPeriods !== undefined && options.byoyomiPeriods !== null ? options.byoyomiPeriods : 5;
        const timeIncrement = options.timeIncrement !== undefined && options.timeIncrement !== null ? options.timeIncrement : 5;
        
        console.log('[GameService] Timer settings:', {
            timeLimitMinutes,
            timePerPlayer,
            byoyomiSeconds,
            byoyomiPeriods,
            timeIncrement,
            isSpeedMode
        });
        
        await timerService.initializeTimer(game.id, timePerPlayer, {
            isFischer: isSpeedMode,
            fischerIncrement: timeIncrement,
            // 스피드바둑은 피셔 방식만 사용 (초읽기 없음)
            byoyomiSeconds: isSpeedMode ? 0 : byoyomiSeconds,
            byoyomiPeriods: isSpeedMode ? 0 : byoyomiPeriods
        });

        // Cache game state
        const boardSize = options.boardSize !== undefined && options.boardSize !== null ? parseInt(options.boardSize) : 19;
        console.log('[GameService] createGame: Final boardSize:', {
            optionsBoardSize: options.boardSize,
            parsedBoardSize: boardSize,
            type: typeof boardSize,
            options: JSON.stringify(options)
        });
        console.log('[GameService] Game state settings:', {
            boardSize,
            timeLimit: timeLimitMinutes,
            timeIncrement,
            byoyomiSeconds,
            byoyomiPeriods
        });
        
        const initialState = {
            stones: Array(boardSize).fill(null).map(() => Array(boardSize).fill(null)),
            currentColor: 'black',
            moveNumber: 0,
            moves: [],
            capturedBlack: 0,
            capturedWhite: 0,
            lastPass: false,
            ended: false,
            mode: game.mode,
            matchType: game.matchType,
            boardSize: boardSize,
            timeLimit: timeLimitMinutes, // 분 단위
            timeIncrement: timeIncrement,
            byoyomiSeconds: byoyomiSeconds,
            byoyomiPeriods: byoyomiPeriods,
            // 클래식 바둑: 제한 턴수 설정
            maxMoves: options.maxMoves !== undefined && options.maxMoves !== null ? parseInt(options.maxMoves) : null,
            // 대국 시작 준비 상태
            gameReady: false,
            readyStatus: {
                black: false,
                white: false
            },
            readyDeadline: Date.now() + 30000, // 30초 후 자동 시작
            // 미니게임 단계 (일반 대국에서는 미니게임 없음)
            minigamePhase: false,
            minigameType: null, // 일반 대국에서는 미니게임 없음
            minigameResults: {
                black: null,
                white: null
            },
            minigameCompleted: true // 일반 대국에서는 미니게임 단계 건너뛰기
        };
        
        // 따내기바둑 입찰 시스템 초기화
        if (game.mode === 'CAPTURE') {
            initialState.biddingPhase = true;
            initialState.bids = {};
            initialState.biddingRound = 1;
            initialState.captureTarget = options.captureTarget || 20; // 기본 목표 개수
            initialState.captureBidDeadline = Date.now() + 30000; // 30초 입찰 시간
            initialState.finalCaptureTarget = null; // 입찰 완료 후 최종 목표 개수
        }
        
        // 스피드바둑 돌가리기 초기화 (PVP 모드일 때만)
        if (game.mode === 'SPEED' && !game.isAiGame) {
            initialState.stonePickingPhase = true;
            initialState.stonePickingDeadline = Date.now() + 30000; // 30초
            // 랜덤으로 흑/백 역할 할당
            const roles = ['black', 'white'];
            const shuffled = roles.sort(() => Math.random() - 0.5);
            initialState.stonePickingRoles = {
                black: shuffled[0] === 'black' ? game.blackId : game.whiteId,
                white: shuffled[0] === 'white' ? game.blackId : game.whiteId
            };
            initialState.stonePickingChoice = null; // 흑의 선택 (홀수/짝수)
            initialState.stoneCount = Math.floor(Math.random() * 20) + 1; // 1~20 사이 랜덤 돌 개수
        }
        
        // 베이스바둑 베이스돌 배치 시스템 초기화
        if (game.mode === 'BASE') {
            const boardSize = options.boardSize !== undefined && options.boardSize !== null ? parseInt(options.boardSize) : 19;
            // 베이스돌 개수: options.baseStones가 있으면 사용, 없으면 기본값 4
            let baseStoneCount = 4;
            if (options.baseStones !== undefined && options.baseStones !== null) {
                const parsed = parseInt(options.baseStones);
                if (!isNaN(parsed) && parsed > 0) {
                    baseStoneCount = parsed;
                } else {
                    console.warn('[GameService] createGame BASE mode: Invalid baseStones value:', options.baseStones, 'using default 4');
                }
            } else {
                console.warn('[GameService] createGame BASE mode: baseStones not provided, using default 4');
            }
            console.log('[GameService] createGame BASE mode: Final baseStoneCount:', baseStoneCount, 'from options.baseStones:', options.baseStones);
            
            // 베이스돌 랜덤 자동 배치
            const baseStones = this.generateRandomBaseStones(boardSize, baseStoneCount);
            
            initialState.basePlacementPhase = false; // 자동 배치 완료
            initialState.baseStones = baseStones;
            initialState.baseStoneCount = baseStoneCount;
            initialState.baseStonesRevealed = true; // 배치 즉시 공개
            initialState.komiBiddingPhase = false; // 색상 선택 후 필요시 활성화
            initialState.komiBids = {}; // 덤 입찰 정보 {userId: {komi: number, color: 'black'|'white'}}
            initialState.komiBiddingRound = 1; // 덤 입찰 라운드
            initialState.komiBiddingDeadline = null; // 덤 입찰 마감 시간
            initialState.finalKomi = 0.5; // 베이스바둑은 기본 덤 0.5집, 입찰로 추가 결정
            
            // PVP 모드일 때만 색상 선택 단계 활성화
            if (!game.isAiGame) {
                initialState.colorSelectionPhase = true;
                initialState.colorSelections = {}; // {userId: 'black' | 'white'}
                initialState.colorSelectionDeadline = Date.now() + 30000; // 30초
            } else {
                // AI 게임에서도 모달을 표시하기 위해 colorSelectionPhase를 true로 설정
                initialState.colorSelectionPhase = true; // 모달 표시를 위해 true
            }
        }
        
        // 히든바둑 히든 착수 시스템 초기화
        if (game.mode === 'HIDDEN') {
            initialState.hiddenStones = {
                black: [], // blackId의 히든돌 {x, y, revealed: false, scannedBy: []}
                white: []  // whiteId의 히든돌 {x, y, revealed: false, scannedBy: []}
            };
            initialState.hiddenStoneCount = options.hiddenStones || 10; // 기본 10개
            initialState.hiddenStonesUsed = {
                black: 0,
                white: 0
            };
            initialState.scanCount = {
                black: options.scanCount || 3, // 기본 3회
                white: options.scanCount || 3
            };
            initialState.scanUsed = {
                black: 0,
                white: 0
            };
            // 히든 아이템 사용 상태
            initialState.hiddenItemActive = {
                black: false,
                white: false
            };
            initialState.hiddenItemDeadline = {
                black: null,
                white: null
            };
            // 스캔 아이템 사용 상태
            initialState.scanItemActive = {
                black: false,
                white: false
            };
            initialState.scanItemDeadline = {
                black: null,
                white: null
            };
            // 스캔으로 발견된 히든 돌 (각 유저별)
            initialState.scannedStones = {
                black: [], // {x, y}
                white: []
            };
            // 전체 공개된 히든 돌
            initialState.revealedStones = []; // {x, y, color, reason}
        }
        
        // 미사일바둑 미사일 이동 시스템 초기화
        if (game.mode === 'MISSILE') {
            initialState.missileMovesUsed = {
                black: 0,
                white: 0
            };
            initialState.missileMoveLimit = options.missileMoveLimit || 10; // 기본 10회
            initialState.missileItemActive = {
                black: false,
                white: false
            };
        }
        
        // 믹스바둑 초기화
        if (game.mode === 'MIX') {
            // mixRules가 있으면 mixModes로 변환 (하위 호환성)
            const mixModesArray = options.mixModes || (options.mixRules && Array.isArray(options.mixRules) ? options.mixRules : []);
            initialState.mixModes = mixModesArray;
            initialState.currentMixMode = mixModesArray.length > 0 ? mixModesArray[0] : null;
            initialState.mixModeIndex = 0;
            initialState.mixModeSwitchCount = options.mixModeSwitchCount || 50; // N수마다 모드 전환
            // 믹스바둑 세부 설정 저장
            if (options.mixCaptureTarget) initialState.mixCaptureTarget = options.mixCaptureTarget;
            if (options.mixTimeLimit) initialState.mixTimeLimit = options.mixTimeLimit;
            if (options.mixTimeIncrement) initialState.mixTimeIncrement = options.mixTimeIncrement;
            if (options.mixBaseCount) initialState.mixBaseCount = options.mixBaseCount;
            if (options.mixHiddenCount) initialState.mixHiddenCount = options.mixHiddenCount;
            if (options.mixScanCount) initialState.mixScanCount = options.mixScanCount;
            if (options.mixMissileMoveLimit) initialState.mixMissileMoveLimit = options.mixMissileMoveLimit;
        }
        
        // 따목(TTAK) 게임 초기화
        if (game.mode === 'TTAK') {
            initialState.captureTarget = options.captureTarget || 10; // 기본 목표 따낸 돌 개수
            initialState.omokWinEnabled = true; // 오목 달성 승리 활성화
        }
        
        // 알까기(ALKKAGI) 게임 초기화
        if (game.mode === 'ALKKAGI') {
            initialState.currentRound = 1;
            initialState.maxRounds = options.maxRounds || 3;
            initialState.roundScores = {
                black: [],
                white: []
            };
            initialState.placementPhase = true; // 돌 배치 단계
            initialState.tossPhase = false; // 돌 튕기기 단계
            initialState.powerGauge = {
                black: 0,
                white: 0
            };
            initialState.stonesPlaced = {
                black: 0,
                white: 0
            };
            initialState.stonesPerRound = options.stonesPerRound || 5; // 라운드당 배치할 돌 개수
            initialState.currentTossPlayer = 'black'; // 현재 튕기기 차례
            initialState.tossFrom = null; // 튕기기 시작 위치 {x, y}
            initialState.tossDirection = null; // 튕기기 방향 {dx, dy}
            initialState.tossPower = 0; // 튕기기 파워 (0-100)
        }
        
        // 바둑컬링(CURLING) 게임 초기화
        if (game.mode === 'CURLING') {
            initialState.currentRound = 1;
            initialState.maxRounds = 3;
            initialState.roundScores = {
                black: [],
                white: []
            };
            initialState.stonesThrown = {
                black: 0,
                white: 0
            };
            initialState.stonesPerRound = options.stonesPerRound || 8; // 라운드당 던질 돌 개수
            initialState.houseCenter = {
                x: Math.floor(boardSize / 2),
                y: Math.floor(boardSize / 2)
            };
            initialState.curlingPhase = 'throwing'; // 'throwing' 또는 'scoring'
            initialState.currentThrower = 'black'; // 현재 던지는 플레이어
            initialState.curlingStones = []; // 던진 돌들의 위치와 소유자 정보
        }
        
        await this.cacheGameState(game.id, initialState);
        
        // 메모리 캐시에 게임 설정 저장 (Redis가 없을 때를 대비)
        const settingsToCache = {
            boardSize: boardSize,
            timeLimit: timeLimitMinutes,
            timeIncrement: timeIncrement,
            byoyomiSeconds: byoyomiSeconds,
            byoyomiPeriods: byoyomiPeriods
        };
        
        // 베이스바둑: baseStoneCount 저장
        if (game.mode === 'BASE' && initialState.baseStoneCount !== undefined) {
            settingsToCache.baseStoneCount = initialState.baseStoneCount;
        }
        
        // 따내기바둑: captureTarget 저장
        if (game.mode === 'CAPTURE' && initialState.captureTarget !== undefined) {
            settingsToCache.captureTarget = initialState.captureTarget;
        }
        
        this.gameSettingsCache.set(game.id, settingsToCache);
        console.log('[GameService] createGame: Saved settings to memory cache:', settingsToCache);

        return game;
    }

    async createAiGame(userId, aiLevel, userColor = 'black', options = {}) {
        console.log('[GameService] createAiGame called with options:', {
            userId,
            aiLevel,
            userColor,
            boardSize: options.boardSize,
            timeLimit: options.timeLimit,
            byoyomiSeconds: options.byoyomiSeconds,
            byoyomiPeriods: options.byoyomiPeriods,
            mode: options.mode
        });
        
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new Error('User not found');
        }
        
        // Determine which color the user plays
        // 베이스바둑은 랜덤으로 설정 (대국실에서 선택)
        let isUserBlack = false;
        if (options.mode === 'BASE') {
            // 베이스바둑은 일단 랜덤으로 설정 (나중에 대국실에서 선택)
            isUserBlack = Math.random() < 0.5;
        } else {
            // 명시적으로 색상 선택 처리
            if (userColor === 'black') {
                isUserBlack = true;
            } else if (userColor === 'white') {
                isUserBlack = false;
            } else if (userColor === 'random') {
                isUserBlack = Math.random() < 0.5;
            } else {
                // 기본값은 흑
                isUserBlack = true;
            }
        }
        const aiColor = isUserBlack ? 'white' : 'black';
        
        console.log('[GameService] createAiGame: Color determination:', {
            userColor,
            isUserBlack,
            aiColor,
            mode: options.mode
        });
        
        // 놀이바둑일 때는 단일 AI봇 사용 (aiLevel은 null)
        const isCasualMode = options.isCasualMode || false;
        const finalAiLevel = isCasualMode ? null : aiLevel;
        
        // AI 레이팅 계산 (놀이바둑일 때는 기본값 1500 사용)
        const aiRating = isCasualMode ? 1500 : (1500 + (aiLevel * 100));

        // 베이스바둑은 기본 덤 0.5집으로 설정 (덤 제시 과정 후 재설정됨)
        const initialKomi = (options.mode === 'BASE') ? 0.5 : (options.komi || 6.5);
        
        const game = await prisma.game.create({
            data: {
                blackId: isUserBlack ? userId : null,
                whiteId: isUserBlack ? null : userId,
                blackRating: isUserBlack ? user.rating : aiRating,
                whiteRating: isUserBlack ? aiRating : user.rating,
                isAiGame: true,
                aiLevel: finalAiLevel,
                aiColor: aiColor,
                matchType: 'FRIENDLY', // AI games are always friendly
                mode: options.mode || 'CLASSIC',
                komi: initialKomi,
                startedAt: null, // AI 게임은 경기 준비 모달 후에만 시작되도록 null로 설정
            },
        });
        
        console.log('[GameService] createAiGame: Game created with colors:', {
            gameId: game.id,
            userColor,
            isUserBlack,
            aiColor,
            blackId: game.blackId,
            whiteId: game.whiteId,
            userId,
            mode: game.mode
        });

        // Cache game info
        const redis = getRedisClient();
        if (redis) {
            try {
                await redis.setEx(`game:${game.id}`, 3600, JSON.stringify({
                    id: game.id,
                    blackId: game.blackId,
                    whiteId: game.whiteId,
                    blackRating: game.blackRating,
                    whiteRating: game.whiteRating,
                    isAiGame: game.isAiGame,
                    aiLevel: game.aiLevel,
                    aiColor: game.aiColor,
                    mode: game.mode,
                    matchType: game.matchType
                }));
            } catch (error) {
                console.error('Redis cache error:', error);
            }
        }

        // Initialize timer
        const isSpeedMode = game.mode === 'SPEED';
        // 모든 모드에서 timeLimit 사용 (분 단위로 전달되므로 초로 변환)
        // timeLimit이 없으면 스피드바둑은 10분, 다른 모드는 30분 기본값
        // timeLimit이 0이면 0을 사용 (무제한 시간)
        const timeLimitMinutes = (options.timeLimit !== undefined && options.timeLimit !== null) 
            ? options.timeLimit 
            : (isSpeedMode ? 10 : 30);
        
        console.log('[GameService] createAiGame: timeLimit calculation:', {
            optionsTimeLimit: options.timeLimit,
            isSpeedMode: isSpeedMode,
            finalTimeLimitMinutes: timeLimitMinutes
        });
        
        const timePerPlayer = timeLimitMinutes * 60;
        
        // 초읽기 설정: createGame과 동일한 방식으로 처리
        const byoyomiSeconds = options.byoyomiSeconds !== undefined && options.byoyomiSeconds !== null ? options.byoyomiSeconds : 30;
        const byoyomiPeriods = options.byoyomiPeriods !== undefined && options.byoyomiPeriods !== null ? options.byoyomiPeriods : 5;
        const timeIncrement = options.timeIncrement !== undefined && options.timeIncrement !== null ? options.timeIncrement : 5;
        
        await timerService.initializeTimer(game.id, timePerPlayer, {
            isFischer: isSpeedMode,
            fischerIncrement: timeIncrement,
            // 스피드바둑은 피셔 방식만 사용 (초읽기 없음)
            byoyomiSeconds: isSpeedMode ? 0 : byoyomiSeconds,
            byoyomiPeriods: isSpeedMode ? 0 : byoyomiPeriods
        });

        // Cache game state
        // boardSize 처리: createGame과 동일한 방식으로 처리
        const boardSize = options.boardSize !== undefined && options.boardSize !== null ? parseInt(options.boardSize) : 19;
        
        console.log('[GameService] createAiGame: Final boardSize:', {
            optionsBoardSize: options.boardSize,
            parsedBoardSize: boardSize,
            type: typeof boardSize
        });
        
        const aiGameState = {
            stones: Array(boardSize).fill(null).map(() => Array(boardSize).fill(null)),
            currentColor: 'black',
            moveNumber: 0,
            moves: [],
            capturedBlack: 0,
            capturedWhite: 0,
            isAiGame: true,
            aiLevel: finalAiLevel,
            aiColor: aiColor,
            isCasualMode: isCasualMode,
            lastPass: false,
            ended: false,
            mode: game.mode,
            matchType: game.matchType,
            boardSize: boardSize,
            timeLimit: timeLimitMinutes, // 분 단위
            timeIncrement: timeIncrement,
            byoyomiSeconds: byoyomiSeconds,
            byoyomiPeriods: byoyomiPeriods,
            // AI 대국 자동 계가 수순 설정
            autoScoringMove: options.autoScoringMove ? parseInt(options.autoScoringMove) : undefined,
            // AI 게임도 모달 표시 (AI는 항상 준비완료 상태)
            gameReady: false,
            readyStatus: {
                black: isUserBlack ? false : true, // AI는 항상 준비완료
                white: isUserBlack ? true : false  // AI는 항상 준비완료
            },
            readyDeadline: null // AI 게임에서는 타이머 없음
        };
        
        // 따내기바둑 입찰 시스템 초기화 (AI 게임)
        if (game.mode === 'CAPTURE') {
            // AI 게임에서는 입찰 단계 건너뛰기
            aiGameState.biddingPhase = false;
            aiGameState.bids = null;
            aiGameState.biddingRound = 1;
            // captureTarget 처리: 명시적으로 숫자로 변환
            let captureTarget = 20; // 기본값
            if (options.captureTarget !== undefined && options.captureTarget !== null) {
                const parsed = parseInt(options.captureTarget);
                if (!isNaN(parsed) && parsed > 0) {
                    captureTarget = parsed;
                }
            }
            aiGameState.captureTarget = captureTarget;
            aiGameState.captureBidDeadline = null;
            // AI 게임에서는 흑/백 선택에 따라 목표 개수 설정
            aiGameState.finalCaptureTarget = captureTarget;
            aiGameState.blackCaptureTarget = captureTarget;
            aiGameState.whiteCaptureTarget = captureTarget;
            
            console.log('[GameService] createAiGame - CAPTURE mode:', {
                optionsCaptureTarget: options.captureTarget,
                optionsCaptureTargetType: typeof options.captureTarget,
                finalCaptureTarget: captureTarget,
                finalCaptureTargetType: typeof captureTarget
            });
        }
        
        // 스피드바둑 AI 게임에서는 돌가리기 단계 건너뛰기
        if (game.mode === 'SPEED') {
            aiGameState.stonePickingPhase = false;
            aiGameState.stonePickingDeadline = null;
            aiGameState.stonePickingRoles = null;
            aiGameState.stonePickingChoice = null;
            aiGameState.stoneCount = null;
        }
        
        // 베이스바둑 AI 게임에서는 색상 선택 및 덤 입찰 단계 건너뛰기
        if (game.mode === 'BASE') {
            try {
                const boardSize = options.boardSize !== undefined && options.boardSize !== null ? parseInt(options.boardSize) : 19;
                // 베이스돌 개수: options.baseStones가 있으면 사용, 없으면 기본값 4
                let baseStoneCount = 4;
                if (options.baseStones !== undefined && options.baseStones !== null) {
                    const parsed = parseInt(options.baseStones);
                    if (!isNaN(parsed) && parsed > 0) {
                        baseStoneCount = parsed;
                    } else {
                        console.warn('[GameService] createAiGame BASE mode: Invalid baseStones value:', options.baseStones, 'using default 4');
                    }
                } else {
                    console.warn('[GameService] createAiGame BASE mode: baseStones not provided, using default 4');
                }
                console.log('[GameService] createAiGame BASE mode: Final baseStoneCount:', baseStoneCount, 'from options.baseStones:', options.baseStones, 'type:', typeof options.baseStones);
                
                console.log('[GameService] createAiGame BASE mode: boardSize=', boardSize, 'baseStoneCount=', baseStoneCount, 'options.baseStones=', options.baseStones, 'game.mode=', game.mode);
                
                // 베이스돌 랜덤 자동 배치
                if (typeof this.generateRandomBaseStones !== 'function') {
                    throw new Error('generateRandomBaseStones function is not defined');
                }
                
                const baseStones = this.generateRandomBaseStones(boardSize, baseStoneCount);
                console.log('[GameService] createAiGame BASE mode: baseStones generated:', {
                    baseStoneCount: baseStoneCount,
                    blackCount: baseStones.black?.length || 0,
                    whiteCount: baseStones.white?.length || 0,
                    totalCount: (baseStones.black?.length || 0) + (baseStones.white?.length || 0),
                    expectedTotal: baseStoneCount * 2
                });
                
                // 생성된 베이스돌 개수 검증
                const actualBlackCount = baseStones.black?.length || 0;
                const actualWhiteCount = baseStones.white?.length || 0;
                if (actualBlackCount !== baseStoneCount || actualWhiteCount !== baseStoneCount) {
                    console.error('[GameService] createAiGame BASE mode: Base stone count mismatch!', {
                        expected: baseStoneCount,
                        actualBlack: actualBlackCount,
                        actualWhite: actualWhiteCount,
                        optionsBaseStones: options.baseStones
                    });
                    // 재생성 시도
                    const correctedBaseStones = this.generateRandomBaseStones(boardSize, baseStoneCount);
                    if (correctedBaseStones.black?.length === baseStoneCount && correctedBaseStones.white?.length === baseStoneCount) {
                        console.log('[GameService] createAiGame BASE mode: Base stones regenerated successfully');
                        baseStones.black = correctedBaseStones.black;
                        baseStones.white = correctedBaseStones.white;
                    }
                }
                
                aiGameState.basePlacementPhase = false;
                aiGameState.baseStones = baseStones;
                aiGameState.baseStoneCount = baseStoneCount; // 정확한 개수 저장
                aiGameState.baseStonesRevealed = true;
                // AI 게임에서는 모달을 표시하기 위해 colorSelectionPhase를 true로 설정
                aiGameState.colorSelectionPhase = true; // 모달 표시를 위해 true
                aiGameState.komiBiddingPhase = false;
                aiGameState.finalKomi = 0.5; // 기본 덤 0.5집
                
                // 베이스돌 개수 검증 로그
                console.log('[GameService] createAiGame BASE mode: Final state - baseStoneCount:', aiGameState.baseStoneCount, 'black stones:', baseStones.black?.length || 0, 'white stones:', baseStones.white?.length || 0);
                
                console.log('[GameService] createAiGame BASE mode: aiGameState.baseStones set:', JSON.stringify(aiGameState.baseStones, null, 2));
            } catch (error) {
                console.error('[GameService] createAiGame BASE mode error:', error);
                throw error;
            }
        } else {
            console.log('[GameService] createAiGame: Not BASE mode, game.mode=', game.mode, 'options.mode=', options.mode);
        }
        
        console.log('[GameService] createAiGame: Before cacheGameState, aiGameState.mode=', aiGameState.mode, 'aiGameState.baseStones=', aiGameState.baseStones ? 'present' : 'null');
        if (aiGameState.baseStones) {
            console.log('[GameService] createAiGame: baseStones details:', {
                black: aiGameState.baseStones.black?.length || 0,
                white: aiGameState.baseStones.white?.length || 0,
                baseStonesRevealed: aiGameState.baseStonesRevealed
            });
        }
        // 베이스바둑 모드인 경우 베이스돌 검증 (cacheGameState 호출 전)
        if (game.mode === 'BASE') {
            if (!aiGameState.baseStones) {
                console.error('[GameService] createAiGame: baseStones not found in aiGameState before caching!');
                throw new Error('Base stones not found in game state. Cannot create BASE mode game.');
            }
            console.log('[GameService] createAiGame: baseStones verified in aiGameState before caching:', {
                baseStonesBlack: aiGameState.baseStones?.black?.length || 0,
                baseStonesWhite: aiGameState.baseStones?.white?.length || 0,
                baseStoneCount: aiGameState.baseStoneCount
            });
        }
        
        await this.cacheGameState(game.id, aiGameState);
        console.log('[GameService] createAiGame: After cacheGameState');
        
        // 베이스돌이 제대로 저장되었는지 확인 (검증만 수행, 오류는 발생시키지 않음)
        if (game.mode === 'BASE') {
            // aiGameState에서 직접 확인 (이미 검증됨)
            if (aiGameState.baseStones) {
                console.log('[GameService] createAiGame: baseStones confirmed in aiGameState:', {
                    baseStonesBlack: aiGameState.baseStones?.black?.length || 0,
                    baseStonesWhite: aiGameState.baseStones?.white?.length || 0
                });
            } else {
                // 이 경우는 위에서 이미 검증했으므로 발생하지 않아야 함
                console.error('[GameService] createAiGame: baseStones lost after cacheGameState! This should not happen.');
                // 오류를 발생시키지 않고 로깅만 수행 (aiGameState에 있으면 문제없음)
            }
        }
        
        // Redis가 없을 때를 대비해 메모리 캐시에도 저장
        const memoryCacheData = {
            boardSize: boardSize,
            timeLimit: timeLimitMinutes,
            byoyomiSeconds: byoyomiSeconds,
            byoyomiPeriods: byoyomiPeriods,
            timeIncrement: timeIncrement,
            // AI 대국 자동 계가 수순 설정
            autoScoringMove: aiGameState.autoScoringMove
        };
        
        // CAPTURE 모드인 경우 captureTarget도 메모리 캐시에 저장
        if (game.mode === 'CAPTURE' && aiGameState.captureTarget) {
            memoryCacheData.captureTarget = aiGameState.captureTarget;
            memoryCacheData.finalCaptureTarget = aiGameState.finalCaptureTarget;
            memoryCacheData.blackCaptureTarget = aiGameState.blackCaptureTarget;
            memoryCacheData.whiteCaptureTarget = aiGameState.whiteCaptureTarget;
        }
        
        // BASE 모드인 경우 baseStones도 메모리 캐시에 저장
        // 주의: cacheGameState에서 이미 전체 state를 메모리 캐시에 저장했으므로
        // 여기서는 추가 설정만 저장 (baseStones는 이미 cacheGameState에서 저장됨)
        if (game.mode === 'BASE' && aiGameState.baseStones) {
            memoryCacheData.baseStones = aiGameState.baseStones; // 전체 베이스돌 객체 저장
            memoryCacheData.baseStoneCount = aiGameState.baseStoneCount;
            memoryCacheData.baseStonesRevealed = aiGameState.baseStonesRevealed;
            console.log('[GameService] createAiGame: Saving baseStones to memory cache:', {
                baseStoneCount: aiGameState.baseStoneCount,
                baseStonesBlack: aiGameState.baseStones?.black?.length || 0,
                baseStonesWhite: aiGameState.baseStones?.white?.length || 0
            });
        }
        
        // gameSettingsCache가 Map이 아닌 객체인 경우를 대비
        if (!this.gameSettingsCache) {
            this.gameSettingsCache = {};
        }
        if (typeof this.gameSettingsCache.set === 'function') {
            this.gameSettingsCache.set(game.id, memoryCacheData);
        } else {
            this.gameSettingsCache[game.id] = memoryCacheData;
        }
        console.log('[GameService] createAiGame: Saved settings to memory cache:', {
            gameId: game.id,
            boardSize: boardSize,
            timeLimit: timeLimitMinutes,
            byoyomiSeconds: byoyomiSeconds,
            byoyomiPeriods: byoyomiPeriods
        });

        return game;
    }

    async getGame(gameId) {
        if (!gameId || gameId === '' || gameId === 'undefined' || gameId === 'null') {
            console.error('[GameService] getGame: gameId is null, undefined, or invalid:', gameId);
            return null;
        }
        
        const cacheKey = `game:${gameId}`;
        const redis = getRedisClient();
        
        if (redis) {
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return JSON.parse(cached);
                }
            } catch (error) {
                console.error('Redis get error:', error);
            }
        }

        const game = await prisma.game.findUnique({
            where: { id: gameId },
            include: {
                blackPlayer: {
                    select: { id: true, nickname: true, rating: true },
                },
                whitePlayer: {
                    select: { id: true, nickname: true, rating: true },
                },
            },
        });

        if (game && redis) {
            try {
                await redis.setEx(cacheKey, 3600, JSON.stringify(game));
            } catch (error) {
                console.error('Redis cache error:', error);
            }
        }

        return game;
    }

    async getGameState(gameId) {
        if (!gameId || gameId === '' || gameId === 'undefined' || gameId === 'null') {
            console.error('[GameService] getGameState: gameId is null, undefined, or invalid:', gameId);
            return null;
        }
        
        const redis = getRedisClient();
        let state = null;
        
        // Redis에서 캐시된 상태 가져오기
        if (redis) {
            try {
                const cachedState = await redis.get(`game:state:${gameId}`);
                if (cachedState) {
                    state = JSON.parse(cachedState);
                    console.log('[GameService] getGameState: Found cached state:', {
                        boardSize: state.boardSize,
                        timeLimit: state.timeLimit,
                        byoyomiSeconds: state.byoyomiSeconds,
                        byoyomiPeriods: state.byoyomiPeriods,
                        captureTarget: state.captureTarget,
                        mode: state.mode,
                        baseStones: state.baseStones ? 'present' : 'null',
                        baseStonesRevealed: state.baseStonesRevealed
                    });
                    // timer의 currentTurn과 동기화
                    try {
                        const timerService = require('./timerService');
                        const timer = await timerService.getTimer(gameId);
                        if (timer && timer.currentTurn) {
                            state.currentColor = timer.currentTurn;
                        }
                    } catch (error) {
                        console.error('Error syncing state with timer:', error);
                    }
                    
                    // CAPTURE 모드인 경우 메모리 캐시에서 captureTarget 확인 (Redis 캐시에 없을 경우)
                    if (state.mode === 'CAPTURE' && !state.captureTarget && memorySettings) {
                        if (memorySettings.captureTarget !== undefined) {
                            state.captureTarget = memorySettings.captureTarget;
                        }
                        if (memorySettings.finalCaptureTarget !== undefined) {
                            state.finalCaptureTarget = memorySettings.finalCaptureTarget;
                        }
                        if (memorySettings.blackCaptureTarget !== undefined) {
                            state.blackCaptureTarget = memorySettings.blackCaptureTarget;
                        }
                        if (memorySettings.whiteCaptureTarget !== undefined) {
                            state.whiteCaptureTarget = memorySettings.whiteCaptureTarget;
                        }
                    }
                } else {
                    console.warn('[GameService] getGameState: No cached state found in Redis for game:', gameId);
                }
            } catch (error) {
                console.error('Redis get error:', error);
            }
        } else {
            console.warn('[GameService] getGameState: Redis not available, will reconstruct from database');
        }

        // 먼저 메모리 캐시 확인 (게임 생성 시 저장된 설정값 - 가장 신뢰할 수 있음)
        // memorySettings를 블록 밖에서도 사용할 수 있도록 먼저 선언
        const memorySettings = this.gameSettingsCache.get(gameId);
        let boardSize = 19;
        let timeLimit = 30;
        let timeIncrement = 5;
        let byoyomiSeconds = 30;
        let byoyomiPeriods = 5;
        
        if (memorySettings) {
            console.log('[GameService] getGameState: Found settings in memory cache (PRIORITY):', memorySettings);
            // 메모리 캐시에 값이 있으면 우선 사용 (게임 생성 시 설정값)
            if (memorySettings.boardSize !== undefined && memorySettings.boardSize !== null) {
                boardSize = parseInt(memorySettings.boardSize);
            }
            if (memorySettings.timeLimit !== undefined && memorySettings.timeLimit !== null) {
                timeLimit = memorySettings.timeLimit;
            }
            if (memorySettings.timeIncrement !== undefined && memorySettings.timeIncrement !== null) {
                timeIncrement = memorySettings.timeIncrement;
            }
            if (memorySettings.byoyomiSeconds !== undefined && memorySettings.byoyomiSeconds !== null) {
                byoyomiSeconds = memorySettings.byoyomiSeconds;
            }
            if (memorySettings.byoyomiPeriods !== undefined && memorySettings.byoyomiPeriods !== null) {
                byoyomiPeriods = memorySettings.byoyomiPeriods;
            }
            console.log('[GameService] getGameState: Using memory cache values:', {
                boardSize,
                timeLimit,
                byoyomiSeconds,
                byoyomiPeriods,
                baseStoneCount: memorySettings.baseStoneCount,
                captureTarget: memorySettings.captureTarget
            });
        } else {
            console.warn('[GameService] getGameState: No settings found in memory cache for game:', gameId, '- will try Redis cache');
            
            // 메모리 캐시가 없으면 Redis 캐시 확인
            if (redis) {
                try {
                    const cachedState = await redis.get(`game:state:${gameId}`);
                    if (cachedState) {
                        const parsed = JSON.parse(cachedState);
                        console.log('[GameService] getGameState: Found cached state with settings:', {
                            boardSize: parsed.boardSize,
                            timeLimit: parsed.timeLimit,
                            byoyomiSeconds: parsed.byoyomiSeconds,
                            byoyomiPeriods: parsed.byoyomiPeriods
                        });
                        if (parsed.boardSize) {
                            boardSize = parsed.boardSize;
                        }
                        if (parsed.timeLimit !== undefined) {
                            timeLimit = parsed.timeLimit;
                        }
                        if (parsed.timeIncrement !== undefined) {
                            timeIncrement = parsed.timeIncrement;
                        }
                        if (parsed.byoyomiSeconds !== undefined) {
                            byoyomiSeconds = parsed.byoyomiSeconds;
                        }
                        if (parsed.byoyomiPeriods !== undefined) {
                            byoyomiPeriods = parsed.byoyomiPeriods;
                        }
                    } else {
                        console.warn('[GameService] getGameState: No cached state found in Redis for game:', gameId, '- using defaults');
                    }
                } catch (error) {
                    console.error('Redis get error in getGameState:', error);
                }
            }
        }

        // Load from database if not in cache
        if (!state) {
            const game = await this.getGame(gameId);
            const moves = await prisma.gameMove.findMany({
                where: { gameId },
                orderBy: { moveNumber: 'asc' },
            });

            // Determine current color from moves
            let currentColor = 'black';
            if (moves.length > 0) {
                const lastMove = moves[moves.length - 1];
                // 마지막 착수의 반대 색상이 현재 차례
                currentColor = lastMove.color === 'black' ? 'white' : 'black';
            }
            
            // timer의 currentTurn과 동기화
            try {
                const timerService = require('./timerService');
                const timer = await timerService.getTimer(gameId);
                if (timer && timer.currentTurn) {
                    currentColor = timer.currentTurn;
                }
            } catch (error) {
                console.error('Error syncing with timer:', error);
            }

            // 게임 객체에서 captured stones 가져오기 (데이터베이스에 저장된 값)
            const capturedBlack = game.capturedBlack || 0;
            const capturedWhite = game.capturedWhite || 0;

            // 베이스바둑: Redis 캐시에서 베이스돌 정보 먼저 확인 (재생성 방지)
            let baseStonesFromCache = null;
            if (game.mode === 'BASE' && redis) {
                try {
                    const cachedState = await redis.get(`game:state:${gameId}`);
                    if (cachedState) {
                        const parsed = JSON.parse(cachedState);
                        if (parsed.baseStones && typeof parsed.baseStones === 'object' &&
                            (parsed.baseStones.black || parsed.baseStones.white)) {
                            baseStonesFromCache = parsed.baseStones;
                        }
                    }
                } catch (error) {
                    console.error('Error getting baseStones from Redis cache (before state init):', error);
                }
            }

            // 먼저 빈 moves 배열로 초기화 (나중에 capturedStones와 함께 채움)
            const movesWithCaptures = [];
            
            state = {
                stones: Array(boardSize).fill(null).map(() => Array(boardSize).fill(null)),
                currentColor: currentColor,
                moveNumber: moves.length,
                moves: movesWithCaptures, // 나중에 채워질 배열
                capturedBlack: capturedBlack,
                capturedWhite: capturedWhite,
                boardSize: boardSize,
                timeLimit: timeLimit,
                timeIncrement: timeIncrement,
                byoyomiSeconds: byoyomiSeconds,
                byoyomiPeriods: byoyomiPeriods,
                mode: game.mode,
                matchType: game.matchType,
                isAiGame: game.isAiGame,
                aiLevel: game.aiLevel,
                aiColor: game.aiColor,
                isCasualMode: false, // 기본값, 필요시 캐시에서 가져오기
                lastPass: moves.length > 0 && moves[moves.length - 1].isPass,
                ended: game.endedAt !== null,
                // 베이스바둑: Redis 캐시에서 가져온 베이스돌 정보 설정 (재생성 방지)
                baseStones: baseStonesFromCache,
                // AI 대국 자동 계가 수순: 메모리 캐시에서 가져오기
                autoScoringMove: memorySettings && memorySettings.autoScoringMove !== undefined && memorySettings.autoScoringMove !== null
                    ? parseInt(memorySettings.autoScoringMove)
                    : undefined
            };
            
            // CAPTURE 모드인 경우 메모리 캐시에서 captureTarget 값 가져오기
            if (game.mode === 'CAPTURE' && memorySettings) {
                if (memorySettings.captureTarget !== undefined) {
                    state.captureTarget = memorySettings.captureTarget;
                }
                if (memorySettings.finalCaptureTarget !== undefined) {
                    state.finalCaptureTarget = memorySettings.finalCaptureTarget;
                }
                if (memorySettings.blackCaptureTarget !== undefined) {
                    state.blackCaptureTarget = memorySettings.blackCaptureTarget;
                }
                if (memorySettings.whiteCaptureTarget !== undefined) {
                    state.whiteCaptureTarget = memorySettings.whiteCaptureTarget;
                }
            }
            
            // Redis 캐시에서 captureTarget 값 가져오기 (메모리 캐시에 없을 경우)
            if (game.mode === 'CAPTURE' && !state.captureTarget && redis) {
                try {
                    const cachedState = await redis.get(`game:state:${gameId}`);
                    if (cachedState) {
                        const parsed = JSON.parse(cachedState);
                        if (parsed.captureTarget !== undefined) {
                            state.captureTarget = parsed.captureTarget;
                        }
                        if (parsed.finalCaptureTarget !== undefined) {
                            state.finalCaptureTarget = parsed.finalCaptureTarget;
                        }
                        if (parsed.blackCaptureTarget !== undefined) {
                            state.blackCaptureTarget = parsed.blackCaptureTarget;
                        }
                        if (parsed.whiteCaptureTarget !== undefined) {
                            state.whiteCaptureTarget = parsed.whiteCaptureTarget;
                        }
                    }
                } catch (error) {
                    console.error('Error getting captureTarget from Redis cache:', error);
                }
            }
            
            // BASE 모드인 경우 메모리 캐시에서 baseStoneCount 가져오기
            if (game.mode === 'BASE' && memorySettings && memorySettings.baseStoneCount !== undefined) {
                state.baseStoneCount = parseInt(memorySettings.baseStoneCount);
                console.log('[GameService] getGameState: Restored baseStoneCount from memory cache:', state.baseStoneCount);
            }
            
            // BASE 모드인 경우 Redis 캐시에서 베이스돌 정보 가져오기
            if (game.mode === 'BASE') {
                // 중요: 베이스돌은 절대 재생성하지 않음 (위치 보존)
                // 기존 베이스돌이 있으면 무조건 유지
                const hasExistingBaseStones = state.baseStones && 
                    typeof state.baseStones === 'object' &&
                    (state.baseStones.black || state.baseStones.white);
                
                // 중요: gameReady가 true이면 베이스돌을 절대 변경하지 않음
                const isGameReady = state.gameReady === true;
                
                // 중요: 베이스돌이 이미 있으면 절대 변경하지 않음 (위치 보존)
                // Redis나 데이터베이스에서 가져오지도 않음
                if (hasExistingBaseStones) {
                    // 베이스돌이 이미 있으면 절대 변경하지 않음
                    // 추가 로직 없이 기존 베이스돌 유지
                } else if (redis) {
                    // 베이스돌이 없을 때만 Redis에서 복원 시도
                    try {
                        const cachedState = await redis.get(`game:state:${gameId}`);
                        if (cachedState) {
                            const parsed = JSON.parse(cachedState);
                            
                            // 베이스돌이 유효한 객체이고 배열을 포함하는 경우에만 복원
                            if (parsed.baseStones !== undefined && parsed.baseStones !== null && 
                                typeof parsed.baseStones === 'object' &&
                                (parsed.baseStones.black || parsed.baseStones.white)) {
                                
                                // 기존 베이스돌이 없을 때만 Redis에서 복원 (절대 덮어쓰지 않음)
                                if (!hasExistingBaseStones) {
                                    state.baseStones = parsed.baseStones;
                                }
                                // 기존 베이스돌이 있으면 절대 변경하지 않음 (위치 보존)
                            }
                            
                            if (parsed.baseStonesRevealed !== undefined) {
                                state.baseStonesRevealed = parsed.baseStonesRevealed;
                            }
                            if (parsed.basePlacementPhase !== undefined) {
                                state.basePlacementPhase = parsed.basePlacementPhase;
                            }
                            if (parsed.baseStoneCount !== undefined) {
                                state.baseStoneCount = parseInt(parsed.baseStoneCount);
                            }
                            if (parsed.colorSelectionPhase !== undefined) {
                                state.colorSelectionPhase = parsed.colorSelectionPhase;
                            }
                            if (parsed.colorSelections !== undefined) {
                                state.colorSelections = parsed.colorSelections;
                            }
                            if (parsed.komiBiddingPhase !== undefined) {
                                state.komiBiddingPhase = parsed.komiBiddingPhase;
                            }
                            if (parsed.komiBids !== undefined) {
                                state.komiBids = parsed.komiBids;
                            }
                            if (parsed.finalKomi !== undefined) {
                                state.finalKomi = parsed.finalKomi;
                            }
                            // 로그 제거 (너무 많은 콘솔 메시지 방지)
                            // console.log('[GameService] getGameState: Restored BASE mode state from Redis:', {
                            //     hasBaseStones: !!state.baseStones,
                            //     baseStonesRestored: baseStonesRestored,
                            //     isGameReady: isGameReady,
                            //     baseStonesRevealed: state.baseStonesRevealed
                            // });
                        }
                    } catch (error) {
                        console.error('Error getting BASE mode state from Redis cache:', error);
                    }
                }
                
                // Redis에서 베이스돌을 가져오지 못한 경우, 메모리 캐시에서 확인
                // 중요: 기존 베이스돌이 있으면 절대 덮어쓰지 않음 (위치 보존)
                if (!hasExistingBaseStones && !isGameReady && !redis) {
                    // Redis가 없을 때 메모리 캐시에서 베이스돌 복원
                    const memoryCache = this.gameSettingsCache;
                    if (memoryCache) {
                        let cachedState = null;
                        if (typeof memoryCache.get === 'function') {
                            cachedState = memoryCache.get(gameId);
                        } else if (typeof memoryCache === 'object') {
                            cachedState = memoryCache[gameId];
                        }
                        
                        if (cachedState && cachedState.baseStones) {
                            // 베이스돌이 유효한 객체이고 배열을 포함하는 경우에만 복원
                            if (typeof cachedState.baseStones === 'object' &&
                                (cachedState.baseStones.black || cachedState.baseStones.white)) {
                                state.baseStones = JSON.parse(JSON.stringify(cachedState.baseStones)); // 깊은 복사
                                console.log('[GameService] getGameState: Restored baseStones from memory cache:', {
                                    baseStonesBlack: state.baseStones?.black?.length || 0,
                                    baseStonesWhite: state.baseStones?.white?.length || 0
                                });
                            }
                            
                            if (cachedState.baseStonesRevealed !== undefined) {
                                state.baseStonesRevealed = cachedState.baseStonesRevealed;
                            }
                            if (cachedState.basePlacementPhase !== undefined) {
                                state.basePlacementPhase = cachedState.basePlacementPhase;
                            }
                            if (cachedState.baseStoneCount !== undefined && cachedState.baseStoneCount !== null) {
                                state.baseStoneCount = parseInt(cachedState.baseStoneCount);
                                console.log('[GameService] getGameState: baseStoneCount restored from Redis cache:', state.baseStoneCount);
                            }
                        }
                    }
                }
                
                // 메모리 캐시와 Redis에서 베이스돌을 가져오지 못한 경우, 데이터베이스에서 확인
                // 중요: 기존 베이스돌이 있으면 절대 덮어쓰지 않음 (위치 보존)
                if (!hasExistingBaseStones && !isGameReady && !state.baseStones) {
                    // 데이터베이스에서 베이스돌 정보 확인
                    if (game.baseStones) {
                        try {
                            const dbBaseStones = typeof game.baseStones === 'string' ? JSON.parse(game.baseStones) : game.baseStones;
                            if (dbBaseStones && (dbBaseStones.black || dbBaseStones.white)) {
                                // 기존 베이스돌이 없을 때만 데이터베이스에서 복원
                                if (!hasExistingBaseStones) {
                                    state.baseStones = dbBaseStones;
                                    state.baseStonesRevealed = game.baseStonesRevealed || false;
                                    state.baseStoneCount = game.baseStoneCount || 4;
                                    state.basePlacementPhase = game.basePlacementPhase || false;
                                    state.colorSelectionPhase = game.colorSelectionPhase || false;
                                    state.komiBiddingPhase = game.komiBiddingPhase || false;
                                    state.finalKomi = game.komi || 0.5;
                                }
                            }
                        } catch (error) {
                            console.error('[GameService] getGameState: Error parsing baseStones from database:', error);
                        }
                    }
                    
                    // 중요: 베이스돌 재생성은 절대 하지 않음
                    // 베이스돌이 없으면 오류만 로깅하고 재생성하지 않음
                    if (!state.baseStones && !isGameReady) {
                        // 게임이 시작되지 않았고 베이스돌이 없는 경우
                        const hasMoves = moves && moves.length > 0;
                        if (!hasMoves) {
                            // 베이스돌이 없으면 오류 로깅만 하고 재생성하지 않음
                            console.error('[GameService] getGameState: BASE mode but baseStones not found in cache or database. Cannot regenerate - base stones must be set during game creation.');
                        } else {
                            console.error('[GameService] getGameState: BASE mode but baseStones not found and game has already started. Game may be in invalid state.');
                        }
                    }
                }
                
                // 중요: 베이스돌이 이미 있으면 절대 변경하지 않음 (위치 보존)
                // 이 체크는 모든 경우에 적용되어야 함
                if (hasExistingBaseStones || state.baseStones) {
                    // 베이스돌이 있으면 절대 변경하지 않음 (위치 보존)
                    // 추가 로직 없이 기존 베이스돌 유지
                }
            }

            // Reconstruct board from moves (정확한 복원)
            // moves를 순차적으로 재생하면서 보드 복원 및 capturedStones 계산
            moves.forEach(move => {
                if (!move.isPass && move.x !== null && move.y !== null) {
                    if (move.y < boardSize && move.x < boardSize) {
                        // 돌 배치
                        state.stones[move.y][move.x] = move.color;
                        
                        // 따낸 돌 계산 및 제거
                        const opponentColor = move.color === 'black' ? 'white' : 'black';
                        const capturedStones = this.findCapturedStones(state.stones, move.x, move.y, opponentColor);
                        
                        if (capturedStones.length > 0) {
                            // 따낸 돌 제거
                            capturedStones.forEach(s => {
                                if (s.y < boardSize && s.x < boardSize) {
                                    state.stones[s.y][s.x] = null;
                                }
                            });
                        } else {
                            // 자살 수 체크 (자살 수는 허용되지 않으므로 이미 제거되었을 것)
                            // 하지만 복원 시에는 이미 배치된 상태이므로 스킵
                        }
                        
                        // moves 배열에 capturedStones 정보 포함
                        movesWithCaptures.push({
                            x: move.x,
                            y: move.y,
                            color: move.color,
                            isPass: false,
                            moveNumber: move.moveNumber,
                            capturedStones: capturedStones // 패 규칙 체크를 위해 저장
                        });
                    }
                } else if (move.isPass) {
                    // 패스인 경우
                    movesWithCaptures.push({
                        x: null,
                        y: null,
                        color: move.color,
                        isPass: true,
                        moveNumber: move.moveNumber,
                        capturedStones: [] // 패스는 따낸 돌이 없음
                    });
                }
                // 마지막 move의 반대 색상이 다음 차례
                state.currentColor = move.color === 'black' ? 'white' : 'black';
            });
            
            // 게임 객체의 captured 값 사용 (데이터베이스에 저장된 정확한 값)
            state.capturedBlack = capturedBlack;
            state.capturedWhite = capturedWhite;
            
            console.log('[GameService] getGameState: Reconstructed game state from database:', {
                moveNumber: state.moveNumber,
                capturedBlack: state.capturedBlack,
                capturedWhite: state.capturedWhite,
                boardSize: state.boardSize,
                currentColor: state.currentColor,
                memoryCache: memorySettings ? 'found' : 'not found',
                memoryCacheBoardSize: memorySettings?.boardSize,
                finalBoardSize: boardSize
            });
        }

        // Timer를 참조하여 currentColor 동기화 (순환 참조 방지를 위해 try-catch로 감싸기)
        try {
            const timerService = require('./timerService');
            const timer = await timerService.getTimer(gameId);
            
            // timer.currentTurn이 유일한 차례 소스 - 항상 이를 사용
            if (timer && timer.currentTurn) {
                // timer.currentTurn이 있으면 무조건 사용 (moves 기반 계산 무시)
                state.currentColor = timer.currentTurn;
            } else if (state.moveNumber === 0) {
                // 게임 시작 시 흑부터 (timer가 아직 초기화되지 않은 경우)
                state.currentColor = 'black';
            }
        } catch (error) {
            console.error('Error syncing with timer in getGameState:', error);
            // 에러 발생 시 moves 기반 계산 사용
            if (state.moveNumber === 0) {
                state.currentColor = 'black';
            }
        }

        // state에 boardSize, timeLimit 등이 없으면 메모리 캐시나 계산된 값으로 설정
        // 메모리 캐시가 최우선 (게임 생성 시 저장된 값)
        if (state.boardSize === undefined || state.boardSize === null) {
            // 메모리 캐시에서 가져온 boardSize 사용 (이미 위에서 설정됨)
            state.boardSize = boardSize;
            console.log('[GameService] getGameState: boardSize not in state, using from cache/default:', boardSize);
        } else {
            // state에 boardSize가 있지만 메모리 캐시와 다르면 메모리 캐시 우선
            if (memorySettings && memorySettings.boardSize !== undefined && memorySettings.boardSize !== null) {
                const cachedBoardSize = parseInt(memorySettings.boardSize);
                const stateBoardSize = parseInt(state.boardSize);
                if (cachedBoardSize !== stateBoardSize) {
                    console.warn(`[GameService] getGameState: boardSize mismatch! state=${stateBoardSize}, cache=${cachedBoardSize}, using cache`);
                    state.boardSize = cachedBoardSize;
                }
            }
        }
        if (state.timeLimit === undefined || state.timeLimit === null) {
            state.timeLimit = timeLimit;
        }
        if (state.byoyomiSeconds === undefined || state.byoyomiSeconds === null) {
            state.byoyomiSeconds = byoyomiSeconds;
        }
        if (state.byoyomiPeriods === undefined || state.byoyomiPeriods === null) {
            state.byoyomiPeriods = byoyomiPeriods;
        }
        
        // baseStoneCount가 없으면 메모리 캐시에서 가져오기
        if (state.baseStoneCount === undefined || state.baseStoneCount === null) {
            if (memorySettings && memorySettings.baseStoneCount !== undefined && memorySettings.baseStoneCount !== null) {
                state.baseStoneCount = parseInt(memorySettings.baseStoneCount);
                console.log('[GameService] getGameState: baseStoneCount restored from memory cache:', state.baseStoneCount);
            } else if (state.mode === 'BASE') {
                // BASE 모드인데 baseStoneCount가 없으면 기본값 4 사용
                state.baseStoneCount = 4;
                console.warn('[GameService] getGameState: baseStoneCount not found, using default 4');
            }
        }
        
        // autoScoringMove가 없으면 메모리 캐시에서 가져오기 (AI 게임인 경우)
        if (state.autoScoringMove === undefined || state.autoScoringMove === null) {
            if (memorySettings && memorySettings.autoScoringMove !== undefined && memorySettings.autoScoringMove !== null) {
                state.autoScoringMove = parseInt(memorySettings.autoScoringMove);
                console.log('[GameService] getGameState: autoScoringMove restored from memory cache:', state.autoScoringMove);
            }
        }
        
        console.log('[GameService] getGameState: Final state settings:', {
            boardSize: state.boardSize,
            timeLimit: state.timeLimit,
            byoyomiSeconds: state.byoyomiSeconds,
            byoyomiPeriods: state.byoyomiPeriods,
            baseStoneCount: state.baseStoneCount,
            autoScoringMove: state.autoScoringMove
        });
        
        // Redis에서 캐시 확인 (로깅용)
        let fromCache = false;
        if (redis) {
            try {
                const cached = await redis.get(`game:state:${gameId}`);
                fromCache = !!cached;
            } catch (error) {
                // Ignore
            }
        }
        
        console.log('[GameService] getGameState returning state with:', {
            boardSize: state.boardSize,
            timeLimit: state.timeLimit,
            byoyomiSeconds: state.byoyomiSeconds,
            byoyomiPeriods: state.byoyomiPeriods,
            baseStoneCount: state.baseStoneCount,
            currentColor: state.currentColor,
            moveNumber: state.moveNumber,
            fromCache: fromCache
        });

        await this.cacheGameState(gameId, state);
        return state;
    }

    // 따내기바둑 입찰 처리
    async submitCaptureBid(gameId, userId, bid) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        if (game.mode !== 'CAPTURE') {
            throw new Error('This game mode does not support bidding');
        }

        const state = await this.getGameState(gameId);
        
        if (!state.biddingPhase) {
            throw new Error('Bidding phase has already ended');
        }

        if (Date.now() > state.captureBidDeadline) {
            throw new Error('Bidding deadline has passed');
        }

        // 입찰 값 검증 (0-20)
        if (bid < 0 || bid > 20) {
            throw new Error('Bid must be between 0 and 20');
        }

        // 입찰 저장
        if (!state.bids) {
            state.bids = {};
        }
        state.bids[userId] = bid;
        
        await this.cacheGameState(gameId, state);

        // 두 플레이어 모두 입찰했는지 확인
        const blackBid = state.bids[game.blackId];
        const whiteBid = state.bids[game.whiteId];

        if (typeof blackBid === 'number' && typeof whiteBid === 'number') {
            // 입찰 완료 처리
            return await this.processCaptureBids(gameId, game, state, blackBid, whiteBid);
        }

        return { bids: state.bids, biddingRound: state.biddingRound };
    }

    // 입찰 결과 처리 및 흑백 결정
    async processCaptureBids(gameId, game, state, blackBid, whiteBid) {
        const baseTarget = state.captureTarget || 20;
        let winnerId = null;
        let winnerBid = null;
        let finalTarget = null;
        let needRebid = false;

        if (blackBid > whiteBid) {
            winnerId = game.blackId;
            winnerBid = blackBid;
            finalTarget = baseTarget + blackBid;
        } else if (whiteBid > blackBid) {
            winnerId = game.whiteId;
            winnerBid = whiteBid;
            finalTarget = baseTarget + whiteBid;
            // 백이 이겼으므로 흑백 교체 필요
            await prisma.game.update({
                where: { id: gameId },
                data: {
                    blackId: game.whiteId,
                    whiteId: game.blackId,
                    blackRating: game.whiteRating,
                    whiteRating: game.blackRating
                }
            });
        } else {
            // 동점인 경우
            if (state.biddingRound >= 2) {
                // 두 번째 입찰에서도 동점이면 랜덤 결정
                const randomWinner = Math.random() < 0.5 ? game.blackId : game.whiteId;
                winnerId = randomWinner;
                winnerBid = blackBid; // 둘 다 같은 값
                finalTarget = baseTarget + winnerBid;
                
                if (winnerId === game.whiteId) {
                    // 백이 이겼으므로 흑백 교체
                    await prisma.game.update({
                        where: { id: gameId },
                        data: {
                            blackId: game.whiteId,
                            whiteId: game.blackId,
                            blackRating: game.whiteRating,
                            whiteRating: game.blackRating
                        }
                    });
                }
            } else {
                // 재입찰
                needRebid = true;
                state.biddingRound = 2;
                state.bids = {};
                state.captureBidDeadline = Date.now() + 30000; // 30초 재입찰 시간
            }
        }

        if (!needRebid) {
            // 입찰 완료, 게임 시작
            state.biddingPhase = false;
            // 흑과 백의 목표를 다르게 설정
            // 흑: baseTarget + winnerBid, 백: baseTarget
            state.finalCaptureTarget = finalTarget; // 흑의 목표
            state.blackCaptureTarget = finalTarget; // 흑의 목표
            state.whiteCaptureTarget = baseTarget; // 백의 목표
            state.bids = null; // 입찰 정보는 더 이상 필요 없음
        }

        await this.cacheGameState(gameId, state);

        return {
            bids: needRebid ? {} : { [winnerId]: winnerBid },
            biddingRound: state.biddingRound,
            biddingPhase: state.biddingPhase,
            finalTarget: finalTarget,
            winnerId: winnerId,
            winnerBid: winnerBid,
            needRebid: needRebid
        };
    }

    // 베이스바둑 베이스돌 랜덤 생성
    generateRandomBaseStones(boardSize, baseStoneCount) {
        // baseStoneCount 검증 및 정규화
        let count = 4; // 기본값
        if (baseStoneCount !== undefined && baseStoneCount !== null) {
            const parsed = parseInt(String(baseStoneCount));
            if (!isNaN(parsed) && parsed > 0) {
                count = parsed;
            } else {
                console.warn('[GameService] generateRandomBaseStones: Invalid baseStoneCount:', baseStoneCount, 'using default 4');
            }
        } else {
            console.warn('[GameService] generateRandomBaseStones: baseStoneCount is undefined/null, using default 4');
        }
        
        console.log('[GameService] generateRandomBaseStones: boardSize=', boardSize, 'baseStoneCount (input)=', baseStoneCount, 'count (parsed)=', count);
        
        const baseStones = {
            black: [],
            white: []
        };
        
        // 모든 가능한 위치 생성
        const allPositions = [];
        for (let y = 0; y < boardSize; y++) {
            for (let x = 0; x < boardSize; x++) {
                allPositions.push({ x, y });
            }
        }
        
        // 위치 섞기 (Fisher-Yates shuffle)
        for (let i = allPositions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allPositions[i], allPositions[j]] = [allPositions[j], allPositions[i]];
        }
        
        // 각 플레이어에게 정확히 count개씩 배치
        const totalStones = count * 2;
        
        // 충분한 위치가 있는지 확인
        if (allPositions.length < totalStones) {
            console.error('[GameService] generateRandomBaseStones: Not enough positions!', {
                boardSize: boardSize,
                totalPositions: allPositions.length,
                requiredPositions: totalStones,
                count: count
            });
            // 가능한 만큼만 배치
            const availableCount = Math.floor(allPositions.length / 2);
            for (let i = 0; i < availableCount; i++) {
                baseStones.black.push(allPositions[i]);
            }
            for (let i = availableCount; i < availableCount * 2 && i < allPositions.length; i++) {
                baseStones.white.push(allPositions[i]);
            }
        } else {
            // 정확히 count개씩 배치
            for (let i = 0; i < count; i++) {
                baseStones.black.push(allPositions[i]);
            }
            for (let i = count; i < totalStones; i++) {
                baseStones.white.push(allPositions[i]);
            }
        }
        
        // 생성된 돌의 개수 검증 및 강제 수정
        const expectedBlack = count;
        const expectedWhite = count;
        if (baseStones.black.length !== expectedBlack) {
            console.error('[GameService] generateRandomBaseStones: Black stone count mismatch! Fixing...', {
                expected: expectedBlack,
                actual: baseStones.black.length,
                count: count
            });
            // 강제로 정확한 개수로 수정
            baseStones.black = allPositions.slice(0, expectedBlack);
        }
        if (baseStones.white.length !== expectedWhite) {
            console.error('[GameService] generateRandomBaseStones: White stone count mismatch! Fixing...', {
                expected: expectedWhite,
                actual: baseStones.white.length,
                count: count
            });
            // 강제로 정확한 개수로 수정
            baseStones.white = allPositions.slice(expectedBlack, expectedBlack + expectedWhite);
        }
        
        // 최종 검증 로그
        console.log('[GameService] generateRandomBaseStones: Final stones - black:', baseStones.black.length, 'white:', baseStones.white.length, 'total:', baseStones.black.length + baseStones.white.length, 'expected count per player:', count);
        
        return baseStones;
    }

    // 베이스바둑 베이스돌 배치
    async placeBaseStone(gameId, userId, x, y) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        if (game.mode !== 'BASE') {
            throw new Error('This game mode does not support base stone placement');
        }

        const state = await this.getGameState(gameId);
        
        if (!state.basePlacementPhase) {
            throw new Error('Base placement phase has already ended');
        }

        if (Date.now() > state.basePlacementDeadline) {
            throw new Error('Base placement deadline has passed');
        }

        // 베이스돌 개수 확인
        const playerKey = game.blackId === userId ? 'black' : 'white';
        const currentStones = state.baseStones[playerKey] || [];
        
        if (currentStones.length >= state.baseStoneCount) {
            throw new Error('All base stones have been placed');
        }

        // 위치 검증 (boardSize 사용)
        const boardSize = state.boardSize || 19;
        if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) {
            throw new Error('Invalid coordinates');
        }

        // 중복 배치 확인
        const allBaseStones = [...(state.baseStones.black || []), ...(state.baseStones.white || [])];
        if (allBaseStones.some(s => s.x === x && s.y === y)) {
            throw new Error('Position already has a base stone');
        }

        // 베이스돌 추가
        if (!state.baseStones[playerKey]) {
            state.baseStones[playerKey] = [];
        }
        state.baseStones[playerKey].push({ x, y });

        // 두 플레이어 모두 배치 완료했는지 확인
        const blackStones = state.baseStones.black || [];
        const whiteStones = state.baseStones.white || [];
        
        if (blackStones.length >= state.baseStoneCount && whiteStones.length >= state.baseStoneCount) {
            // 베이스돌 배치 완료, 공개 단계로
            state.basePlacementPhase = false;
            state.baseStonesRevealed = true;
            state.komiBiddingPhase = true;
            state.komiBiddingDeadline = Date.now() + 30000; // 30초 입찰 시간
            state.komiBiddingRound = 1;
        }

        await this.cacheGameState(gameId, state);

        return {
            baseStones: state.baseStones,
            basePlacementPhase: state.basePlacementPhase,
            baseStonesRevealed: state.baseStonesRevealed,
            komiBiddingPhase: state.komiBiddingPhase
        };
    }

    // 베이스바둑 색상 선택 처리
    async selectColor(gameId, userId, color) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        if (game.mode !== 'BASE') {
            throw new Error('This game mode does not support color selection');
        }

        if (game.isAiGame) {
            throw new Error('AI games do not support color selection');
        }

        const state = await this.getGameState(gameId);
        
        if (!state.colorSelectionPhase) {
            throw new Error('Color selection phase has already ended');
        }

        if (Date.now() > state.colorSelectionDeadline) {
            throw new Error('Color selection deadline has passed');
        }

        // 색상 검증
        if (color !== 'black' && color !== 'white') {
            throw new Error('Color must be "black" or "white"');
        }

        // 선택 저장
        if (!state.colorSelections) {
            state.colorSelections = {};
        }
        state.colorSelections[userId] = color;
        
        await this.cacheGameState(gameId, state);

        // 두 플레이어 모두 선택했는지 확인
        const blackSelection = state.colorSelections[game.blackId];
        const whiteSelection = state.colorSelections[game.whiteId];

        if (blackSelection && whiteSelection) {
            // 색상 선택 완료 처리
            return await this.processColorSelections(gameId, game, state);
        }

        return { 
            colorSelections: state.colorSelections, 
            colorSelectionPhase: state.colorSelectionPhase 
        };
    }
    
    // 색상 선택 결과 처리
    async processColorSelections(gameId, game, state) {
        const blackSelection = state.colorSelections[game.blackId];
        const whiteSelection = state.colorSelections[game.whiteId];
        
        // 색상 선택 단계 종료
        state.colorSelectionPhase = false;
        state.colorSelectionDeadline = null;
        
        // 같은 색상을 선택한 경우 덤 입찰 단계로
        if (blackSelection === whiteSelection) {
            state.komiBiddingPhase = true;
            state.komiBiddingDeadline = Date.now() + 30000; // 30초 입찰 시간
            state.komiBiddingRound = 1;
            state.komiBids = {}; // 입찰 정보 초기화
        } else {
            // 다른 색상을 선택한 경우 기본 0.5집으로 게임 시작
            state.komiBiddingPhase = false;
            state.finalKomi = 0.5;
            
            // 선택한 색상에 따라 흑/백 결정
            if (blackSelection === 'black' && whiteSelection === 'white') {
                // 이미 올바른 색상
                // 게임 시작 준비
            } else {
                // 흑백 교체 필요
                await prisma.game.update({
                    where: { id: gameId },
                    data: {
                        blackId: game.whiteId,
                        whiteId: game.blackId,
                        blackRating: game.whiteRating,
                        whiteRating: game.blackRating
                    }
                });
                // 게임 객체 업데이트
                game.blackId = state.colorSelections[game.blackId] === 'black' ? game.blackId : game.whiteId;
                game.whiteId = state.colorSelections[game.whiteId] === 'white' ? game.whiteId : game.blackId;
            }
            
            // 게임의 komi 업데이트
            await prisma.game.update({
                where: { id: gameId },
                data: { komi: 0.5 }
            });
            
            // 게임 준비 완료 (PVP 게임에서 색상 선택 완료 후 게임 시작)
            const game = await this.getGame(gameId);
            if (!game.isAiGame) {
                state.gameReady = true;
            }
        }
        
        await this.cacheGameState(gameId, state);
        
        return {
            colorSelections: state.colorSelections,
            colorSelectionPhase: false,
            komiBiddingPhase: state.komiBiddingPhase,
            needKomiBidding: state.komiBiddingPhase
        };
    }

    // 베이스바둑 덤 입찰 처리 (색상은 이미 선택됨)
    async submitKomiBid(gameId, userId, komi) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        if (game.mode !== 'BASE') {
            throw new Error('This game mode does not support komi bidding');
        }

        const state = await this.getGameState(gameId);
        
        if (!state.komiBiddingPhase) {
            throw new Error('Komi bidding phase has already ended');
        }

        if (Date.now() > state.komiBiddingDeadline) {
            throw new Error('Komi bidding deadline has passed');
        }

        // 덤 범위 검증 (0~50집)
        if (komi < 0 || komi > 50) {
            throw new Error('Komi must be between 0 and 50');
        }

        // 선택한 색상 가져오기
        const selectedColor = state.colorSelections[userId];
        if (!selectedColor) {
            throw new Error('Color must be selected before bidding');
        }

        // 입찰 저장
        if (!state.komiBids) {
            state.komiBids = {};
        }
        state.komiBids[userId] = { color: selectedColor, komi };
        
        await this.cacheGameState(gameId, state);

        // 두 플레이어 모두 입찰했는지 확인
        const blackBid = state.komiBids[game.blackId];
        const whiteBid = state.komiBids[game.whiteId];

        if (blackBid && whiteBid) {
            // 입찰 완료 처리
            return await this.processKomiBids(gameId, game, state, blackBid, whiteBid);
        }

        return { komiBids: state.komiBids, komiBiddingRound: state.komiBiddingRound };
    }

    // 덤 입찰 결과 처리 및 흑백 결정
    async processKomiBids(gameId, game, state, blackBid, whiteBid) {
        // 같은 색상을 선택한 경우에만 이 함수가 호출됨
        const selectedColor = blackBid.color; // 둘 다 같은 색상
        
        let winnerId = null;
        let finalKomi = null;
        let needRebid = false;

        // 더 높은 덤을 제시한 유저가 해당 색상
        if (blackBid.komi > whiteBid.komi) {
                winnerId = game.blackId;
            finalKomi = 0.5 + blackBid.komi; // 기본 0.5집 + 제시한 덤
        } else if (whiteBid.komi > blackBid.komi) {
                winnerId = game.whiteId;
            finalKomi = 0.5 + whiteBid.komi; // 기본 0.5집 + 제시한 덤
                // 흑백 교체
                await prisma.game.update({
                    where: { id: gameId },
                    data: {
                        blackId: game.whiteId,
                        whiteId: game.blackId,
                        blackRating: game.whiteRating,
                        whiteRating: game.blackRating
                    }
                });
            // 게임 객체 업데이트
            game.blackId = game.whiteId;
            game.whiteId = game.blackId;
            } else {
                // 동점인 경우
                if (state.komiBiddingRound >= 2) {
                    // 랜덤 결정
                    const randomWinner = Math.random() < 0.5 ? game.blackId : game.whiteId;
                    winnerId = randomWinner;
                finalKomi = 0.5 + blackBid.komi; // 기본 0.5집 + 제시한 덤
                    
                    if (winnerId === game.whiteId) {
                        await prisma.game.update({
                            where: { id: gameId },
                            data: {
                                blackId: game.whiteId,
                                whiteId: game.blackId,
                                blackRating: game.whiteRating,
                                whiteRating: game.blackRating
                            }
                        });
                    // 게임 객체 업데이트
                    game.blackId = game.whiteId;
                    game.whiteId = game.blackId;
                    }
                } else {
                    needRebid = true;
                    state.komiBiddingRound = 2;
                    state.komiBids = {};
                    state.komiBiddingDeadline = Date.now() + 30000;
            }
        }

        if (!needRebid) {
            // 입찰 완료, 게임 시작
            state.komiBiddingPhase = false;
            state.finalKomi = finalKomi;
            state.komiBids = null;
            
            // 게임의 komi 업데이트
            await prisma.game.update({
                where: { id: gameId },
                data: { komi: finalKomi }
            });
            
            // 게임 준비 완료 (PVP 게임에서 덤 입찰 완료 후 게임 시작)
            const game = await this.getGame(gameId);
            if (!game.isAiGame) {
                state.gameReady = true;
            }
        }

        await this.cacheGameState(gameId, state);

        return {
            komiBids: needRebid ? {} : state.komiBids,
            komiBiddingRound: state.komiBiddingRound,
            komiBiddingPhase: state.komiBiddingPhase,
            finalKomi: finalKomi,
            winnerId: winnerId,
            needRebid: needRebid
        };
    }

    // 히든바둑 히든 착수
    async placeHiddenStone(gameId, userId, x, y) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        if (game.mode !== 'HIDDEN') {
            throw new Error('This game mode does not support hidden stone placement');
        }

        const state = await this.getGameState(gameId);
        
        // 히든 착수 개수 확인
        const playerKey = game.blackId === userId ? 'black' : 'white';
        const usedCount = state.hiddenStonesUsed[playerKey] || 0;
        
        if (usedCount >= state.hiddenStoneCount) {
            throw new Error('All hidden stones have been used');
        }

        // 위치 검증 (boardSize 사용)
        const boardSize = state.boardSize || 19;
        if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) {
            throw new Error('Invalid coordinates');
        }

        // 이미 돌이 있는 위치인지 확인
        if (state.stones[y][x] !== null) {
            throw new Error('Position already has a stone');
        }

        // 히든돌 추가 (보드에는 표시하지 않음)
        if (!state.hiddenStones[playerKey]) {
            state.hiddenStones[playerKey] = [];
        }
        state.hiddenStones[playerKey].push({ x, y, revealed: false });
        state.hiddenStonesUsed[playerKey] = usedCount + 1;

        // 보드에 실제로 돌 배치 (상대에게는 보이지 않음)
        state.stones[y][x] = playerKey === 'black' ? 'black' : 'white';

        await this.cacheGameState(gameId, state);

        return {
            hiddenStones: state.hiddenStones,
            hiddenStonesUsed: state.hiddenStonesUsed,
            stones: state.stones
        };
    }

    // 히든바둑 스캔 (히든돌 탐지)
    async scanHiddenStones(gameId, userId, x, y) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        if (game.mode !== 'HIDDEN') {
            throw new Error('This game mode does not support scanning');
        }

        const state = await this.getGameState(gameId);
        const timerService = require('./timerService');
        
        // 스캔 아이템 사용 중인지 확인
        const playerKey = game.blackId === userId ? 'black' : 'white';
        if (!state.scanItemActive[playerKey]) {
            throw new Error('Scan item is not active');
        }

        // 스캔 아이템 사용 시간 확인
        if (Date.now() > state.scanItemDeadline[playerKey]) {
            // 타임아웃 처리
            state.scanItemActive[playerKey] = false;
            state.scanItemDeadline[playerKey] = null;
            await timerService.resumeTimer(gameId);
            await this.cacheGameState(gameId, state);
            throw new Error('Scan item usage time has expired');
        }

        // 스캔 사용 횟수 확인
        const scanUsed = state.scanUsed[playerKey] || 0;
        const scanLimit = state.scanCount[playerKey] || 3;
        
        if (scanUsed >= scanLimit) {
            throw new Error('All scans have been used');
        }

        // 위치 검증 (boardSize 사용)
        const boardSize = state.boardSize || 19;
        if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) {
            throw new Error('Invalid coordinates');
        }

        // 빈 좌표인지 확인 (돌이 있는 위치는 스캔 불가)
        if (state.stones[y][x] !== null) {
            throw new Error('Cannot scan a position with a stone');
        }

        // 상대의 히든돌 확인
        const opponentKey = playerKey === 'black' ? 'white' : 'black';
        const opponentHiddenStones = state.hiddenStones[opponentKey] || [];
        const scannedStone = opponentHiddenStones.find(hs => hs.x === x && hs.y === y && !hs.revealed);
        
        // 스캔 사용 횟수 증가
        state.scanUsed[playerKey] = scanUsed + 1;
        
        // 히든돌이 발견되면 스캔으로 발견된 목록에 추가
        if (scannedStone) {
            // scannedStones에 추가 (해당 유저에게만 보이도록)
            if (!state.scannedStones[playerKey]) {
                state.scannedStones[playerKey] = [];
            }
            if (!state.scannedStones[playerKey].some(s => s.x === x && s.y === y)) {
                state.scannedStones[playerKey].push({ x, y });
            }
            // 해당 히든 돌의 scannedBy에 userId 추가
            if (!scannedStone.scannedBy) {
                scannedStone.scannedBy = [];
        }
            if (!scannedStone.scannedBy.includes(userId)) {
                scannedStone.scannedBy.push(userId);
            }
        }

        // 스캔 아이템 사용 완료 (한 번 사용 후 비활성화)
        state.scanItemActive[playerKey] = false;
        state.scanItemDeadline[playerKey] = null;

        // 타이머 재개
        await timerService.resumeTimer(gameId);

        // 차례 유지 (넘기지 않음)

        await this.cacheGameState(gameId, state);

        return {
            found: !!scannedStone,
            scanUsed: state.scanUsed,
            scannedStones: state.scannedStones[playerKey] || [],
            scanItemActive: state.scanItemActive
        };
    }

    // 히든 돌 공개 처리
    async revealHiddenStones(gameId, positions, reason) {
        const game = await this.getGame(gameId);
        if (!game || game.mode !== 'HIDDEN') {
            return;
        }

        const state = await this.getGameState(gameId);
        const timerService = require('./timerService');

        // revealedStones에 추가
        if (!state.revealedStones) {
            state.revealedStones = [];
        }

        positions.forEach(pos => {
            // 이미 공개된 돌인지 확인
            if (!state.revealedStones.some(rs => rs.x === pos.x && rs.y === pos.y)) {
                state.revealedStones.push({
                    x: pos.x,
                    y: pos.y,
                    color: pos.color,
                    reason: reason // 'captured', 'capturing', 'clicked'
                });
            }

            // 해당 히든 돌의 revealed 플래그 설정
            const playerKey = pos.color === 'black' ? 'black' : 'white';
            const hiddenStone = state.hiddenStones[playerKey]?.find(hs => hs.x === pos.x && hs.y === pos.y);
            if (hiddenStone) {
                hiddenStone.revealed = true;
            }
        });

        // 타이머 일시정지 (3초 애니메이션 동안)
        await timerService.pauseTimer(gameId);

        await this.cacheGameState(gameId, state);

        // 3초 후 타이머 재개 (클라이언트에서 애니메이션 완료 후 호출)
        setTimeout(async () => {
            await timerService.resumeTimer(gameId);
        }, 3000);

        return {
            revealedStones: state.revealedStones,
            hiddenStones: state.hiddenStones
        };
    }

    // 미사일 아이템 사용 시작
    async startMissileItem(gameId, userId) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        if (game.mode !== 'MISSILE') {
            throw new Error('This game mode does not support missile items');
        }

        const state = await this.getGameState(gameId);
        const timerService = require('./timerService');
        
        // 현재 차례인지 확인
        const timer = await timerService.getTimer(gameId);
        const playerKey = game.blackId === userId ? 'black' : 'white';
        const expectedColor = timer.currentTurn || state.currentColor;
        
        if ((expectedColor === 'black' && playerKey !== 'black') || 
            (expectedColor === 'white' && playerKey !== 'white')) {
            throw new Error('Not your turn');
        }

        // 미사일 사용 횟수 확인
        const usedCount = state.missileMovesUsed[playerKey] || 0;
        const moveLimit = state.missileMoveLimit || 10;
        
        if (usedCount >= moveLimit) {
            throw new Error('All missile moves have been used');
        }

        // 이미 미사일 아이템 사용 중인지 확인
        if (state.missileItemActive && state.missileItemActive[playerKey]) {
            throw new Error('Missile item is already active');
        }

        // 미사일 아이템 활성화
        if (!state.missileItemActive) {
            state.missileItemActive = { black: false, white: false };
        }
        state.missileItemActive[playerKey] = true;

        // 타이머 일시정지
        await timerService.pauseTimer(gameId);

        await this.cacheGameState(gameId, state);

        return {
            missileItemActive: state.missileItemActive
        };
    }

    // 미사일바둑 미사일 이동
    async moveMissile(gameId, userId, fromX, fromY, direction) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        if (game.mode !== 'MISSILE') {
            throw new Error('This game mode does not support missile moves');
        }

        const state = await this.getGameState(gameId);
        const timerService = require('./timerService');
        
        // 미사일 아이템 사용 중인지 확인
        const playerKey = game.blackId === userId ? 'black' : 'white';
        if (!state.missileItemActive || !state.missileItemActive[playerKey]) {
            throw new Error('Missile item is not active');
        }

        // 미사일 사용 횟수 확인
        const usedCount = state.missileMovesUsed[playerKey] || 0;
        const moveLimit = state.missileMoveLimit || 10;
        
        if (usedCount >= moveLimit) {
            throw new Error('All missile moves have been used');
        }

        // 위치 검증 (boardSize 사용)
        const boardSize = state.boardSize || 19;
        if (fromX < 0 || fromX >= boardSize || fromY < 0 || fromY >= boardSize) {
            throw new Error('Invalid coordinates');
        }

        // 출발 위치에 자신의 돌이 있는지 확인
        const playerColor = playerKey === 'black' ? 'black' : 'white';
        if (state.stones[fromY][fromX] !== playerColor) {
            throw new Error('You can only move your own stones');
        }

        // 방향에 따른 이동 경로 계산
        let stepX = 0;
        let stepY = 0;
        
        switch (direction) {
            case 'up':
                stepY = -1;
                break;
            case 'down':
                stepY = 1;
                break;
            case 'left':
                stepX = -1;
                break;
            case 'right':
                stepX = 1;
                break;
            default:
                throw new Error('Invalid direction. Must be up, down, left, or right');
        }

        // 이동 경로 계산: 상대 돌이 있으면 그 전까지 이동
        const opponentColor = playerColor === 'black' ? 'white' : 'black';
        let toX = fromX;
        let toY = fromY;
        
        for (let i = 1; i < boardSize; i++) {
            const checkX = fromX + stepX * i;
            const checkY = fromY + stepY * i;
            
            // 보드 범위를 벗어나면 중단
            if (checkX < 0 || checkX >= boardSize || checkY < 0 || checkY >= boardSize) {
                break;
            }
            
            // 상대 돌을 만나면 그 전까지 이동
            if (state.stones[checkY][checkX] === opponentColor) {
                toX = checkX - stepX;
                toY = checkY - stepY;
                break;
            }
            
            // 자신의 돌을 만나면 그 전까지 이동
            if (state.stones[checkY][checkX] === playerColor) {
                toX = checkX - stepX;
                toY = checkY - stepY;
                break;
            }
            
            // 빈 칸이면 계속 진행
            toX = checkX;
            toY = checkY;
        }
        
        // 이동할 위치가 출발 위치와 같으면 에러
        if (toX === fromX && toY === fromY) {
            throw new Error('Cannot move to the same position');
        }

        // 도착 위치가 비어있는지 확인
        if (state.stones[toY][toX] !== null) {
            throw new Error('Destination position is not empty');
        }

        // 이동 경로 계산 (애니메이션용)
        const path = [];
        const maxSteps = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY));
        for (let i = 0; i <= maxSteps; i++) {
            const pathX = fromX + stepX * i;
            const pathY = fromY + stepY * i;
            if (pathX === toX && pathY === toY) {
                path.push({ x: pathX, y: pathY });
                break;
            }
            path.push({ x: pathX, y: pathY });
        }

        // 돌 이동
        state.stones[fromY][fromX] = null;
        state.stones[toY][toX] = playerColor;

        // 미사일 사용 횟수 증가
        state.missileMovesUsed[playerKey] = usedCount + 1;

        // 미사일 아이템 비활성화
        state.missileItemActive[playerKey] = false;

        // 이동한 돌 주변의 상대 돌 따내기 체크
        const capturedStones = this.findCapturedStones(state.stones, toX, toY, opponentColor);
        
        if (capturedStones.length > 0) {
            // 따낸 돌 제거
            capturedStones.forEach(s => {
                state.stones[s.y][s.x] = null;
            });
            
            // 따낸 돌 수 업데이트
            if (playerColor === 'black') {
                state.capturedBlack += capturedStones.length;
            } else {
                state.capturedWhite += capturedStones.length;
            }
        }

        // 이동을 데이터베이스에 저장
        const gameMove = await prisma.gameMove.create({
            data: {
                gameId,
                userId: userId,
                moveNumber: state.moveNumber + 1,
                color: playerColor,
                x: toX,
                y: toY,
                isPass: false,
            },
        });

        // 게임 상태 업데이트
        state.moveNumber = gameMove.moveNumber;
        state.moves.push({
            x: toX,
            y: toY,
            color: playerColor,
            isPass: false,
            moveNumber: gameMove.moveNumber,
            capturedCount: capturedStones.length,
            isMissileMove: true,
            fromX: fromX,
            fromY: fromY
        });

        // 타이머 일시정지 (애니메이션 중)
        await timerService.pauseTimer(gameId);

        await this.cacheGameState(gameId, state);

        return {
            fromX,
            fromY,
            toX,
            toY,
            direction,
            path,
            capturedStones: capturedStones,
            missileMovesUsed: state.missileMovesUsed,
            missileItemActive: state.missileItemActive
        };
    }

    // 미사일 애니메이션 완료 처리
    async completeMissileAnimation(gameId) {
        const timerService = require('./timerService');
        // 타이머 재개
        await timerService.resumeTimer(gameId);
        return { success: true };
    }

    // 주사위바둑 주사위 굴리기
    async rollDice(gameId, userId) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        if (game.mode !== 'DICE') {
            throw new Error('This game mode does not support dice rolling');
        }

        const state = await this.getGameState(gameId);
        
        if (!state.dicePhase) {
            throw new Error('Dice phase has already ended');
        }

        // 주사위 굴리기 (1-6)
        const diceResult = Math.floor(Math.random() * 6) + 1;
        state.diceResult = diceResult;
        state.dicePhase = false;
        state.blackStonesPlaced = 0;
        state.whiteStonesCaptured = 0;
        state.roundEnded = false;

        await this.cacheGameState(gameId, state);

        return {
            diceResult: diceResult,
            dicePhase: false
        };
    }

    // 주사위바둑 라운드 종료 및 점수 계산
    async endDiceRound(gameId, userId) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        if (game.mode !== 'DICE') {
            throw new Error('This game mode does not support dice rounds');
        }

        const state = await this.getGameState(gameId);
        
        if (state.roundEnded) {
            throw new Error('Round has already ended');
        }

        const playerKey = game.blackId === userId ? 'black' : 'white';
        const roundIndex = state.currentRound - 1;

        // 현재 라운드 점수 계산: 따낸 백돌 개수
        const capturedCount = state.whiteStonesCaptured || 0;
        state.roundScores[playerKey][roundIndex] = capturedCount;

        // 마지막 백돌을 따낸 플레이어에게 보너스 점수 (+1)
        if (capturedCount > 0) {
            state.roundScores[playerKey][roundIndex] += 1;
        }

        state.roundEnded = true;

        // 다음 라운드로 진행 또는 게임 종료
        if (state.currentRound < state.maxRounds) {
            // 다음 라운드 준비
            state.currentRound += 1;
            state.dicePhase = true;
            state.diceResult = null;
            state.blackStonesPlaced = 0;
            state.whiteStonesCaptured = 0;
            state.roundEnded = false;
            
            // 보드 초기화 (boardSize 사용)
            const boardSize = state.boardSize || 19;
            state.stones = Array(boardSize).fill(null).map(() => Array(boardSize).fill(null));
            state.moves = [];
            state.moveNumber = 0;
        } else {
            // 모든 라운드 종료, 최종 점수 계산
            const blackTotal = state.roundScores.black.reduce((a, b) => a + b, 0);
            const whiteTotal = state.roundScores.white.reduce((a, b) => a + b, 0);
            
            state.ended = true;
            state.winner = blackTotal > whiteTotal ? 'black' : (whiteTotal > blackTotal ? 'white' : 'draw');
            
            // 게임 종료 처리
            await prisma.game.update({
                where: { id: gameId },
                data: {
                    endedAt: new Date(),
                    winnerId: state.winner === 'black' ? game.blackId : (state.winner === 'white' ? game.whiteId : null)
                }
            });
        }

        await this.cacheGameState(gameId, state);

        return {
            roundScores: state.roundScores,
            currentRound: state.currentRound,
            roundEnded: state.roundEnded,
            gameEnded: state.ended,
            winner: state.winner
        };
    }

    // 경찰과도둑 주사위 굴리기
    async rollCopsDice(gameId, userId) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        if (game.mode !== 'COPS') {
            throw new Error('This game mode does not support cops dice rolling');
        }

        const state = await this.getGameState(gameId);
        
        if (!state.dicePhase) {
            throw new Error('Dice phase has already ended');
        }

        const playerKey = game.blackId === userId ? 'black' : 'white';
        const role = state.currentRole[playerKey];

        // 주사위 굴리기
        if (role === 'thief') {
            // 도둑: 1개 주사위 (1-6)
            state.diceResult.thief = Math.floor(Math.random() * 6) + 1;
        } else {
            // 경찰: 2개 주사위 (각각 1-6)
            state.diceResult.cop = [
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1
            ];
        }

        // 두 플레이어 모두 주사위를 굴렸는지 확인
        if (state.diceResult.thief !== null && state.diceResult.cop !== null) {
            state.dicePhase = false;
        }

        await this.cacheGameState(gameId, state);

        return {
            diceResult: state.diceResult,
            dicePhase: state.dicePhase
        };
    }

    // 경찰과도둑 라운드 종료 및 점수 계산
    async endCopsRound(gameId, userId) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        if (game.mode !== 'COPS') {
            throw new Error('This game mode does not support cops rounds');
        }

        const state = await this.getGameState(gameId);
        
        if (state.roundEnded) {
            throw new Error('Round has already ended');
        }

        const playerKey = game.blackId === userId ? 'black' : 'white';
        const roundIndex = state.currentRound - 1;
        const role = state.currentRole[playerKey];

        // 점수 계산
        if (role === 'thief') {
            // 도둑: 살아남은 돌 개수
            let aliveStones = 0;
            for (let y = 0; y < 19; y++) {
                for (let x = 0; x < 19; x++) {
                    if (state.stones[y][x] === (playerKey === 'black' ? 'black' : 'white')) {
                        aliveStones++;
                    }
                }
            }
            state.roundScores[playerKey][roundIndex] = aliveStones;
        } else {
            // 경찰: 잡은 돌 개수 (상대의 captured 수)
            const opponentKey = playerKey === 'black' ? 'white' : 'black';
            const capturedCount = playerKey === 'black' ? state.capturedWhite : state.capturedBlack;
            state.roundScores[playerKey][roundIndex] = capturedCount;
        }

        state.roundEnded = true;

        // 다음 라운드로 진행 또는 게임 종료
        if (state.currentRound < state.maxRounds) {
            // 다음 라운드 준비 (역할 교대)
            state.currentRound += 1;
            state.currentRole = {
                black: state.currentRole.white, // 역할 교대
                white: state.currentRole.black
            };
            state.dicePhase = true;
            state.diceResult = {
                thief: null,
                cop: null
            };
            state.roundEnded = false;
            
            // 보드 초기화 (boardSize 사용)
            const boardSize = state.boardSize || 19;
            state.stones = Array(boardSize).fill(null).map(() => Array(boardSize).fill(null));
            state.moves = [];
            state.moveNumber = 0;
            state.capturedBlack = 0;
            state.capturedWhite = 0;
        } else {
            // 모든 라운드 종료, 최종 점수 계산
            const blackTotal = state.roundScores.black.reduce((a, b) => a + b, 0);
            const whiteTotal = state.roundScores.white.reduce((a, b) => a + b, 0);
            
            state.ended = true;
            state.winner = blackTotal > whiteTotal ? 'black' : (whiteTotal > blackTotal ? 'white' : 'draw');
            
            // 게임 종료 처리
            await prisma.game.update({
                where: { id: gameId },
                data: {
                    endedAt: new Date(),
                    winnerId: state.winner === 'black' ? game.blackId : (state.winner === 'white' ? game.whiteId : null)
                }
            });
        }

        await this.cacheGameState(gameId, state);

        return {
            roundScores: state.roundScores,
            currentRound: state.currentRound,
            roundEnded: state.roundEnded,
            gameEnded: state.ended,
            winner: state.winner
        };
    }

    async cacheGameState(gameId, state) {
        const redis = getRedisClient();
        if (redis) {
            try {
                await redis.setEx(`game:state:${gameId}`, 3600, JSON.stringify(state));
                const logData = {
                    gameId,
                    boardSize: state.boardSize,
                    timeLimit: state.timeLimit,
                    byoyomiSeconds: state.byoyomiSeconds,
                    byoyomiPeriods: state.byoyomiPeriods,
                    mode: state.mode,
                    baseStoneCount: state.baseStoneCount
                };
                
                // BASE 모드인 경우 베이스돌 정보도 로깅
                if (state.mode === 'BASE') {
                    logData.baseStones = state.baseStones ? 'present' : 'null';
                    logData.baseStonesRevealed = state.baseStonesRevealed;
                    logData.baseStoneCount = state.baseStoneCount;
                    if (state.baseStones) {
                        logData.baseStonesBlack = state.baseStones.black ? state.baseStones.black.length : 0;
                        logData.baseStonesWhite = state.baseStones.white ? state.baseStones.white.length : 0;
                    }
                }
                
                console.log('[GameService] cacheGameState: Saved state to Redis:', logData);
            } catch (error) {
                console.error('Redis cache error:', error);
            }
        } else {
            // Redis가 없을 때 메모리 캐시에 전체 state 저장
            if (!this.gameSettingsCache) {
                this.gameSettingsCache = {};
            }
            this.gameSettingsCache[gameId] = JSON.parse(JSON.stringify(state)); // 깊은 복사
            
            const logData = {
                gameId,
                boardSize: state.boardSize,
                timeLimit: state.timeLimit,
                byoyomiSeconds: state.byoyomiSeconds,
                byoyomiPeriods: state.byoyomiPeriods,
                mode: state.mode,
                baseStoneCount: state.baseStoneCount
            };
            
            // BASE 모드인 경우 베이스돌 정보도 로깅
            if (state.mode === 'BASE') {
                logData.baseStones = state.baseStones ? 'present' : 'null';
                logData.baseStonesRevealed = state.baseStonesRevealed;
                logData.baseStoneCount = state.baseStoneCount;
                if (state.baseStones) {
                    logData.baseStonesBlack = state.baseStones.black ? state.baseStones.black.length : 0;
                    logData.baseStonesWhite = state.baseStones.white ? state.baseStones.white.length : 0;
                }
            }
            
            console.log('[GameService] cacheGameState: Saved state to memory cache (Redis not available):', logData);
        }
    }

    async setPlayerReady(gameId, userId) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        const state = await this.getGameState(gameId);
        
        // 이미 게임이 시작되었으면 무시
        if (state.gameReady) {
            return { gameReady: true, readyStatus: state.readyStatus };
        }

        // 플레이어의 색상 확인
        let playerColor = null;
        if (game.blackId === userId) {
            playerColor = 'black';
        } else if (game.whiteId === userId) {
            playerColor = 'white';
        } else {
            throw new Error('User is not a player in this game');
        }

        // 준비 상태 업데이트
        if (!state.readyStatus) {
            state.readyStatus = { black: false, white: false };
        }
        state.readyStatus[playerColor] = true;

        // AI 게임인 경우: 유저가 준비하면 즉시 게임 시작
        if (game.isAiGame) {
            state.gameReady = true;
            // AI는 항상 준비완료 상태로 설정
            const aiColor = game.aiColor || 'white';
            state.readyStatus[aiColor] = true;
            await this.cacheGameState(gameId, state);
            
            // 게임 시작 시간 설정 (startedAt) - 베이스바둑이 아닌 경우에만
            // 베이스바둑은 setBaseGameSettings에서 이미 설정됨
            if (game.mode !== 'BASE' || game.startedAt === null) {
                await prisma.game.update({
                    where: { id: gameId },
                    data: {
                        startedAt: new Date()
                    }
                });
            }
            
            return { 
                gameReady: true, 
                readyStatus: state.readyStatus,
                started: true 
            };
        }

        // 일반 게임인 경우: 양쪽이 모두 준비되었는지 확인
        const bothReady = state.readyStatus.black && state.readyStatus.white;
        
        if (bothReady) {
            // 양쪽이 모두 준비되었으면 게임 시작
            state.gameReady = true;
            await this.cacheGameState(gameId, state);
            
            // 게임 시작 시간 설정 (startedAt)
            await prisma.game.update({
                where: { id: gameId },
                data: {
                    startedAt: new Date()
                }
            });
            
            return { 
                gameReady: true, 
                readyStatus: state.readyStatus,
                started: true 
            };
        }

        // 아직 양쪽이 준비되지 않았으면 상태만 업데이트
        await this.cacheGameState(gameId, state);
        return { 
            gameReady: false, 
            readyStatus: state.readyStatus,
            started: false 
        };
    }
    
    // 베이스바둑 AI 게임 색상 및 덤 설정
    async setBaseGameSettings(gameId, userId, color, komi) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }
        
        if (game.mode !== 'BASE') {
            throw new Error('This game mode does not support base game settings');
        }
        
        if (!game.isAiGame) {
            throw new Error('This function is only for AI games');
        }
        
        // 색상 검증
        if (color !== 'black' && color !== 'white') {
            throw new Error('Color must be "black" or "white"');
        }
        
        // 덤 검증 (0~50집)
        const komiValue = parseFloat(komi) || 0;
        if (komiValue < 0 || komiValue > 50) {
            throw new Error('Komi must be between 0 and 50');
        }
        
        const finalKomi = 0.5 + komiValue; // 기본 0.5집 + 제시한 덤
        
        // 색상에 따라 게임의 blackId/whiteId 업데이트
        const isUserBlack = color === 'black';
        const aiColor = isUserBlack ? 'white' : 'black';
        
        // 게임 상태에서 베이스돌 정보 가져오기 (업데이트 전에)
        const currentState = await this.getGameState(gameId);
        
        // 베이스돌이 없으면 오류 (이미 생성되어 있어야 함)
        if (!currentState.baseStones) {
            console.error('[GameService] setBaseGameSettings: baseStones not found in state');
            throw new Error('Base stones not found. Game may be in invalid state.');
        }
        
        // 게임 업데이트 (베이스돌 정보는 Redis 캐시에만 저장, DB에는 저장하지 않음)
        // 게임 시작: startedAt 설정
        await prisma.game.update({
            where: { id: gameId },
            data: {
                blackId: isUserBlack ? userId : null,
                whiteId: isUserBlack ? null : userId,
                aiColor: aiColor,
                komi: finalKomi,
                startedAt: new Date() // 게임 시작 시간 설정
                // baseStones, baseStonesRevealed, baseStoneCount는 Prisma 스키마에 없으므로 Redis 캐시에만 저장
            }
        });
        
        // 게임 상태 업데이트 (베이스돌은 변경하지 않고 그대로 유지)
        // 중요: 베이스돌 정보를 명시적으로 보존 (깊은 복사)
        const baseStonesBackup = currentState.baseStones ? JSON.parse(JSON.stringify(currentState.baseStones)) : null;
        if (!baseStonesBackup) {
            console.error('[GameService] setBaseGameSettings: baseStones backup failed!');
            throw new Error('Base stones backup failed. Cannot proceed.');
        }
        
        const state = currentState; // 이미 가져온 상태 재사용
        
        // 베이스돌 정보를 먼저 명시적으로 보존 (절대 변경하지 않음)
        state.baseStones = baseStonesBackup;
        
        state.gameReady = true;
        state.readyStatus = {
            black: true,
            white: true
        };
        state.finalKomi = finalKomi;
        state.currentColor = 'black'; // 게임은 항상 흑부터 시작
        state.moveNumber = 0; // 첫 수
        
        // 베이스돌 정보를 다시 한 번 명시적으로 보존 (이중 보호)
        state.baseStones = baseStonesBackup;
        
        // 베이스돌 정보를 Redis에 명시적으로 저장 (위치 보존)
        await this.cacheGameState(gameId, state);
        
        // 베이스돌이 제대로 저장되었는지 검증
        const verifyState = await this.getGameState(gameId);
        if (!verifyState.baseStones || 
            JSON.stringify(verifyState.baseStones) !== JSON.stringify(baseStonesBackup)) {
            console.error('[GameService] setBaseGameSettings: Base stones verification failed!');
            // 베이스돌을 다시 복원
            verifyState.baseStones = baseStonesBackup;
            await this.cacheGameState(gameId, verifyState);
        }
        
        console.log('[GameService] setBaseGameSettings: baseStones preserved:', {
            black: state.baseStones?.black?.length || 0,
            white: state.baseStones?.white?.length || 0
        });
        
        console.log('[GameService] setBaseGameSettings:', {
            gameId,
            userId,
            color,
            komi: komiValue,
            finalKomi,
            isUserBlack
        });
        
        return {
            color: color,
            komi: finalKomi,
            gameReady: true
        };
    }

    async checkAndStartGame(gameId) {
        const game = await this.getGame(gameId);
        if (!game) {
            return false;
        }

        // AI 게임은 자동 시작 체크 안 함
        if (game.isAiGame) {
            return false;
        }

        const state = await this.getGameState(gameId);
        
        // 이미 게임이 시작되었으면 무시
        if (state.gameReady) {
            return false;
        }

        // 30초 타이머 체크
        if (state.readyDeadline && Date.now() >= state.readyDeadline) {
            // 시간이 지났으면 자동으로 게임 시작
            state.gameReady = true;
            // 준비하지 않은 플레이어도 자동으로 준비완료 처리
            if (!state.readyStatus) {
                state.readyStatus = { black: false, white: false };
            }
            state.readyStatus.black = true;
            state.readyStatus.white = true;
            await this.cacheGameState(gameId, state);
            
            // 게임 시작 시간 설정 (startedAt)
            await prisma.game.update({
                where: { id: gameId },
                data: {
                    startedAt: new Date()
                }
            });
            
            return true;
        }

        return false;
    }

    async makeMove(gameId, userId, move) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        // Verify it's the player's turn
        const state = await this.getGameState(gameId);
        if (state.ended) {
            throw new Error('Game already ended');
        }
        
        // 클래식 모드: 게임 준비 상태 확인 (startedAt이 설정되어야 게임 진행 가능)
        const isGameReady = game.startedAt !== null;
        if (game.mode === 'CLASSIC' && !isGameReady) {
            throw new Error('Game is not ready. Please wait for both players to be ready.');
        }
        
        // 베이스바둑: 색상 선택 및 덤 설정이 완료되기 전까지 수순 금지
        // game.startedAt을 단일 소스로 사용
        if (game.mode === 'BASE' && !isGameReady) {
            // AI 게임이고 blackId/whiteId가 이미 설정된 경우는 허용 (setBaseGameSettings가 호출된 경우)
            if (game.isAiGame && game.blackId && game.whiteId && game.startedAt) {
                // startedAt이 설정되어 있으면 게임 준비 완료
                // state.gameReady도 동기화
                state.gameReady = true;
                await this.cacheGameState(gameId, state);
            } else {
                throw new Error('Game is not ready. Please complete color selection and komi settings first.');
            }
        }

        // timer.currentTurn이 유일한 차례 소스 - state.currentColor 대신 timer를 직접 확인
        const timerService = require('./timerService');
        const timer = await timerService.getTimer(gameId);
        const expectedColor = timer.currentTurn || state.currentColor;
        
        // state.currentColor를 timer.currentTurn과 동기화
        if (state.currentColor !== timer.currentTurn) {
            console.log(`makeMove: Syncing state.currentColor from timer: ${state.currentColor} -> ${timer.currentTurn}`);
            state.currentColor = timer.currentTurn;
            await this.cacheGameState(gameId, state);
        }
        
        // 클라이언트가 보낸 color와 서버의 currentColor가 일치하는지 확인 (디버깅용)
        if (move.color && move.color !== expectedColor) {
            console.warn(`Color mismatch: client sent ${move.color}, but server expects ${expectedColor} (timer.currentTurn: ${timer.currentTurn})`);
        }
        
        if (userId !== 'ai') {
            // 디버깅을 위한 상세 로그
            if (expectedColor === 'black' && game.blackId !== userId) {
                console.error(`[makeMove] Turn validation failed for BLACK:`, {
                    gameId,
                    userId,
                    expectedColor,
                    gameBlackId: game.blackId,
                    gameWhiteId: game.whiteId,
                    currentTurn: timer.currentTurn,
                    message: `User ${userId} tried to play BLACK, but game.blackId is ${game.blackId}`
                });
                throw new Error(`Not your turn (흑 차례가 아닙니다. 당신은 ${game.blackId === userId ? '흑' : game.whiteId === userId ? '백' : '관전자'}입니다)`);
            }
            if (expectedColor === 'white' && game.whiteId !== userId) {
                console.error(`[makeMove] Turn validation failed for WHITE:`, {
                    gameId,
                    userId,
                    expectedColor,
                    gameBlackId: game.blackId,
                    gameWhiteId: game.whiteId,
                    currentTurn: timer.currentTurn,
                    message: `User ${userId} tried to play WHITE, but game.whiteId is ${game.whiteId}`
                });
                throw new Error(`Not your turn (백 차례가 아닙니다. 당신은 ${game.blackId === userId ? '흑' : game.whiteId === userId ? '백' : '관전자'}입니다)`);
            }
            
            // 성공한 경우에도 디버깅 로그 (개발 환경에서만)
            if (process.env.NODE_ENV === 'development') {
                console.log(`[makeMove] Turn validation passed:`, {
                    gameId,
                    userId,
                    expectedColor,
                    gameBlackId: game.blackId,
                    gameWhiteId: game.whiteId
                });
            }
        }

        // Handle Pass
        if (move.isPass) {
            return await this.handlePass(gameId, expectedColor, state);
        }

        // Validate move (boardSize 사용)
        const boardSize = state.boardSize || 19;
        if (move.x < 0 || move.x >= boardSize || move.y < 0 || move.y >= boardSize) {
            throw new Error('Invalid move coordinates');
        }

        if (state.stones[move.y][move.x] !== null) {
            throw new Error('Position already occupied');
        }
        
        // 클래식 모드: 특별 규칙 체크 스킵, 기본 바둑 규칙만 적용
        const isClassicMode = state.mode === 'CLASSIC';
        
        // 베이스바둑: 베이스돌 위치에는 돌을 놓을 수 없음
        if (!isClassicMode && state.mode === 'BASE' && state.baseStones) {
            const allBaseStones = [...(state.baseStones.black || []), ...(state.baseStones.white || [])];
            if (allBaseStones.some(bs => bs.x === move.x && bs.y === move.y)) {
                throw new Error('Cannot place stone on a base stone position');
            }
        }

        // 주사위바둑: 주사위 결과만큼 흑돌 배치 제한
        if (!isClassicMode && state.mode === 'DICE') {
            if (state.dicePhase) {
                throw new Error('Please roll the dice first');
            }
            if (expectedColor === 'black') {
                if (state.blackStonesPlaced >= state.diceResult) {
                    throw new Error('You have already placed all black stones for this round');
                }
            }
        }
        
        // Check for Suicide and Capture
        const boardAfterMove = JSON.parse(JSON.stringify(state.stones));
        boardAfterMove[move.y][move.x] = expectedColor;
        
        const opponentColor = expectedColor === 'black' ? 'white' : 'black';
        let capturedStones = this.findCapturedStones(boardAfterMove, move.x, move.y, opponentColor);
        
        // 클래식 모드에서는 특별 모드 규칙 체크 스킵
        // 히든바둑: 착점 위치에 상대방의 히든 돌이 있는지 확인
        let hiddenStoneRevealed = false;
        let hiddenStoneRevealPositions = [];
        if (!isClassicMode && state.mode === 'HIDDEN' && state.hiddenStones) {
            const opponentKey = expectedColor === 'black' ? 'white' : 'black';
            const opponentHiddenStones = state.hiddenStones[opponentKey] || [];
            const hiddenStoneAtPosition = opponentHiddenStones.find(hs => hs.x === move.x && hs.y === move.y && !hs.revealed);
            
            if (hiddenStoneAtPosition) {
                // 히든 돌 위에 착점 시도 - 공개 처리
                hiddenStoneRevealed = true;
                hiddenStoneRevealPositions.push({
                    x: move.x,
                    y: move.y,
                    color: opponentColor
                });
            }
        }
        
        // 따목(TTAK) 특수 규칙: 상대 돌 2개가 나란히 놓인 경우 양쪽을 막아 따내기
        if (!isClassicMode && state.mode === 'TTAK' && capturedStones.length === 0) {
            const takCaptured = this.findTtakCaptures(boardAfterMove, move.x, move.y, expectedColor, opponentColor);
            if (takCaptured.length > 0) {
                capturedStones = takCaptured;
            }
        }
        
        // 주사위바둑: 백돌 따내기 점수 업데이트
        if (!isClassicMode && state.mode === 'DICE' && expectedColor === 'black' && capturedStones.length > 0) {
            state.whiteStonesCaptured = (state.whiteStonesCaptured || 0) + capturedStones.length;
        }
        
        // 베이스바둑: 베이스돌 따내기 처리
        let baseStonesCaptured = [];
        if (!isClassicMode && state.mode === 'BASE' && state.baseStones && capturedStones.length > 0) {
            const opponentBaseStonesKey = expectedColor === 'black' ? 'white' : 'black';
            const opponentBaseStones = state.baseStones[opponentBaseStonesKey] || [];
            
            // 따낸 돌 중 베이스돌이 있는지 확인
            capturedStones.forEach(captured => {
                const baseStoneIndex = opponentBaseStones.findIndex(bs => bs.x === captured.x && bs.y === captured.y);
                if (baseStoneIndex !== -1) {
                    baseStonesCaptured.push({
                        x: captured.x,
                        y: captured.y,
                        index: baseStoneIndex
                    });
                }
            });
            
            // 베이스돌을 baseStones 배열에서 제거
            if (baseStonesCaptured.length > 0) {
                // 인덱스를 역순으로 정렬하여 제거 (인덱스 변경 방지)
                baseStonesCaptured.sort((a, b) => b.index - a.index);
                baseStonesCaptured.forEach(bs => {
                    state.baseStones[opponentBaseStonesKey].splice(bs.index, 1);
                });
                console.log('[GameService] makeMove: Removed base stones:', {
                    color: opponentBaseStonesKey,
                    removed: baseStonesCaptured.length,
                    remaining: state.baseStones[opponentBaseStonesKey].length
                });
            }
        }
        
        if (capturedStones.length > 0) {
            // Remove captured stones
            capturedStones.forEach(s => {
                boardAfterMove[s.y][s.x] = null;
            });
        }
        
        // Check for suicide: 따낸 후에도 자신의 돌이 자유도를 가져야 함
        // (따낸 돌이 있어도 자유도 확인 필요) - 클래식 모드 포함 모든 모드에서 적용
        if (!this.hasLiberties(boardAfterMove, move.x, move.y, expectedColor)) {
            throw new Error('Suicide move is not allowed');
        }

        // Check for Ko rule (패 규칙)
        if (this.isKo(state, move.x, move.y, expectedColor, capturedStones, boardAfterMove)) {
            throw new Error('패 모양입니다. 연속으로 다시 따낼 수 없습니다.');
        }

        // Save move to database
        const gameMove = await prisma.gameMove.create({
            data: {
                gameId,
                userId: userId === 'ai' ? null : userId,
                moveNumber: state.moveNumber + 1,
                color: expectedColor,
                x: move.x,
                y: move.y,
                isPass: false,
            },
        });

        // 바둑컬링: 돌 던지기 개수 업데이트 및 던지기 단계 종료 확인
        if (!isClassicMode && state.mode === 'CURLING') {
            const playerKey = expectedColor === 'black' ? 'black' : 'white';
            state.stonesThrown[playerKey] = (state.stonesThrown[playerKey] || 0) + 1;
            
            // 던진 돌 정보 저장
            if (!state.curlingStones) {
                state.curlingStones = [];
            }
            state.curlingStones.push({
                x: move.x,
                y: move.y,
                color: expectedColor,
                owner: playerKey
            });
            
            // 차례 교대
            state.currentThrower = state.currentThrower === 'black' ? 'white' : 'black';
            
            // 양쪽 모두 던지기 완료 시 점수 계산 단계로 전환
            if (state.stonesThrown.black >= state.stonesPerRound && 
                state.stonesThrown.white >= state.stonesPerRound) {
                state.curlingPhase = 'scoring';
                // 점수 계산은 end_curling_round에서 수행
            }
        }
        
        // 알까기: 돌 배치 개수 업데이트 및 배치 단계 종료 확인
        if (!isClassicMode && state.mode === 'ALKKAGI') {
            const playerKey = expectedColor === 'black' ? 'black' : 'white';
            state.stonesPlaced[playerKey] = (state.stonesPlaced[playerKey] || 0) + 1;
            
            // 양쪽 모두 배치 완료 시 튕기기 단계로 전환
            if (state.stonesPlaced.black >= state.stonesPerRound && 
                state.stonesPlaced.white >= state.stonesPerRound) {
                state.placementPhase = false;
                state.tossPhase = true;
                state.currentTossPlayer = 'black'; // 흑부터 튕기기 시작
            }
        }
        
        // 주사위바둑: 흑돌 배치 개수 업데이트
        if (!isClassicMode && state.mode === 'DICE' && expectedColor === 'black') {
            state.blackStonesPlaced = (state.blackStonesPlaced || 0) + 1;
        }
        
        // Update game state
        state.stones = boardAfterMove;
        // 주의: currentColor는 timer.currentTurn이 관리하므로 여기서 업데이트하지 않음
        // makeMove 후 gameSocket에서 switchTurn()이 호출되어 timer.currentTurn이 업데이트됨
        // getGameState()는 항상 timer.currentTurn을 참조하므로 자동으로 동기화됨
        state.moveNumber = gameMove.moveNumber;
        
        // 베이스바둑: 베이스돌을 따면 5점씩, 일반 돌을 따면 1점씩
        if (!isClassicMode && state.mode === 'BASE' && baseStonesCaptured && baseStonesCaptured.length > 0) {
            // 베이스돌 따낸 개수
            const baseStoneCount = baseStonesCaptured.length;
            // 일반 돌 따낸 개수
            const normalStoneCount = capturedStones.length - baseStoneCount;
            
            if (expectedColor === 'black') {
                state.capturedBlack += (baseStoneCount * 5) + normalStoneCount;
            } else {
                state.capturedWhite += (baseStoneCount * 5) + normalStoneCount;
            }
        } else {
            // 일반 모드: 1점씩
            if (expectedColor === 'black') {
                state.capturedBlack += capturedStones.length;
            } else {
                state.capturedWhite += capturedStones.length;
            }
        }
        
        state.moves.push({
            x: move.x,
            y: move.y,
            color: expectedColor,
            isPass: false,
            moveNumber: gameMove.moveNumber,
            capturedCount: capturedStones.length,
            capturedStones: capturedStones, // 패 규칙 체크를 위해 딴 돌 위치 저장
            baseStonesCaptured: baseStonesCaptured || [] // 베이스바둑: 따낸 베이스돌 정보
        });
        state.lastPass = false;
        
        // 클래식 바둑: 제한 턴수 체크
        if (isClassicMode && state.maxMoves !== null && state.maxMoves !== undefined) {
            if (state.moveNumber >= state.maxMoves) {
                console.log('[GameService] Classic mode: Max moves reached, ending game');
                state.ended = true;
                await this.cacheGameState(gameId, state);
                const endGameResult = await this.endGame(gameId, state);
                
                return {
                    x: move.x,
                    y: move.y,
                    color: expectedColor,
                    moveNumber: gameMove.moveNumber,
                    capturedStones: capturedStones,
                    isGameOver: true,
                    isMaxMovesReached: true
                };
            }
        }

        // 믹스바둑: 모드 전환 체크 (클래식 모드에서는 스킵)
        let mixModeSwitched = false;
        if (!isClassicMode && state.mode === 'MIX' && state.mixModes && state.mixModes.length > 0) {
            const switchCount = state.mixModeSwitchCount || 50;
            // moveNumber가 switchCount의 배수일 때 모드 전환 (0은 제외)
            if (state.moveNumber > 0 && state.moveNumber % switchCount === 0) {
                // 다음 모드로 순환
                state.mixModeIndex = (state.mixModeIndex + 1) % state.mixModes.length;
                state.currentMixMode = state.mixModes[state.mixModeIndex];
                mixModeSwitched = true;
                console.log(`[GameService] Mix mode switched to: ${state.currentMixMode} at move ${state.moveNumber}`);
            }
        }

        // 히든바둑: 히든 돌 공개 처리 (클래식 모드에서는 스킵)
        let shouldMaintainTurn = false;
        if (!isClassicMode && state.mode === 'HIDDEN') {
            const revealPositions = [];
            
            // 착점 위치에 상대방의 히든 돌이 있는 경우
            if (hiddenStoneRevealed && hiddenStoneRevealPositions.length > 0) {
                revealPositions.push(...hiddenStoneRevealPositions);
                shouldMaintainTurn = true; // 차례 유지
            }
            
            // 따낸 돌 중 히든 돌이 있는 경우
            if (hiddenStonesInCaptured.length > 0) {
                revealPositions.push(...hiddenStonesInCaptured);
            }
            
            // 따내는데 역할을 한 히든 돌이 있는 경우
            if (hiddenStonesInCapturing.length > 0) {
                revealPositions.push(...hiddenStonesInCapturing);
            }
            
            // 히든 돌 공개 처리
            if (revealPositions.length > 0) {
                const reasons = [];
                if (hiddenStoneRevealed) reasons.push('clicked');
                if (hiddenStonesInCaptured.length > 0) reasons.push('captured');
                if (hiddenStonesInCapturing.length > 0) reasons.push('capturing');
                
                await this.revealHiddenStones(gameId, revealPositions, reasons.join(','));
                
                // 차례 유지가 필요한 경우 (히든 돌 위 착점)
                if (shouldMaintainTurn) {
                    // 초읽기 모드인 경우 초읽기 시간 회복
                    const timer = await timerService.getTimer(gameId);
                    if (timer) {
                        const playerKey = expectedColor === 'black' ? 'black' : 'white';
                        if (playerKey === 'black' && timer.blackInByoyomi) {
                            timer.blackByoyomiTime = timer.byoyomiSeconds;
                        } else if (playerKey === 'white' && timer.whiteInByoyomi) {
                            timer.whiteByoyomiTime = timer.byoyomiSeconds;
                        }
                        // 타이머 저장
                        const redis = getRedisClient();
                        if (redis) {
                            try {
                                await redis.setEx(`timer:${gameId}`, 7200, JSON.stringify(timer));
                            } catch (error) {
                                console.error('Redis timer update error:', error);
                            }
                        }
                        timerService.timers.set(gameId, timer);
                    }
                    
                    // 차례를 넘기지 않음 (switchTurn 호출 안 함)
                    // 하지만 게임 상태는 저장해야 함
                    await this.cacheGameState(gameId, state);
                    
                    return {
                        x: move.x,
                        y: move.y,
                        color: expectedColor,
                        isPass: false,
                        moveNumber: gameMove.moveNumber,
                        capturedStones: capturedStones,
                        isGameOver: state.ended,
                        hiddenStonesRevealed: revealPositions,
                        maintainTurn: true
                    };
                }
            }
        }

        // 클래식 모드에서는 특별 모드 승리 조건 체크 스킵
        // 믹스바둑: 현재 모드에 따라 규칙 적용
        const activeMode = !isClassicMode && state.mode === 'MIX' ? (state.currentMixMode || 'CLASSIC') : state.mode;
        
        // Check for mode-specific win conditions (클래식 모드에서는 스킵)
        if (!isClassicMode && (activeMode === 'CAPTURE' || state.mode === 'CAPTURE')) {
            // 입찰 단계가 완료되지 않았으면 게임 진행 불가
            if (state.biddingPhase) {
                throw new Error('입찰이 완료되지 않았습니다.');
            }
            
            // 동적 목표 개수 사용 (흑과 백의 목표가 다를 수 있음)
            const blackTarget = state.blackCaptureTarget || state.finalCaptureTarget || state.captureTarget || 20;
            const whiteTarget = state.whiteCaptureTarget || state.captureTarget || 20;
            
            if (expectedColor === 'black' && state.capturedBlack >= blackTarget) {
                state.ended = true;
                await this.finishGame(gameId, 'black_win', state);
            } else if (expectedColor === 'white' && state.capturedWhite >= whiteTarget) {
                state.ended = true;
                await this.finishGame(gameId, 'white_win', state);
            }
            } else if (!isClassicMode && state.mode === 'OMOK') {
            if (this.checkOmokWin(state.stones, move.x, move.y, expectedColor)) {
                state.ended = true;
                await this.finishGame(gameId, expectedColor === 'black' ? 'black_win' : 'white_win', state);
            }
        }
        
        // AI 대국 자동 계가 체크 (설정된 수순에 도달하면 자동 계가) - 클래식 모드에서도 작동
        // autoScoringMove에 도달하면 계가 시작 (>= 사용하여 정확히 도달했을 때 계가)
        if (game.isAiGame && state.autoScoringMove && state.moveNumber >= state.autoScoringMove) {
            // CAPTURE 모드나 MIX 모드의 CAPTURE에서는 자동 계가 불필요 (목표 따내기 점수로 승부 결정)
            const activeModeForScoring = !isClassicMode && state.mode === 'MIX' ? (state.currentMixMode || 'CLASSIC') : state.mode;
            if (activeModeForScoring !== 'CAPTURE' && !state.ended) {
                console.log(`[GameService] Auto scoring triggered at move ${state.moveNumber} (target: ${state.autoScoringMove})`);
                state.ended = true;
                await this.cacheGameState(gameId, state);
                const endGameResult = await this.endGame(gameId, state);
                return {
                    x: move.x,
                    y: move.y,
                    color: expectedColor,
                    isPass: false,
                    moveNumber: gameMove.moveNumber,
                    capturedStones: capturedStones,
                    isGameOver: true,
                    autoScoring: true,
                    hiddenStonesRevealed: state.mode === 'HIDDEN' ? (hiddenStonesInCaptured.length > 0 || hiddenStonesInCapturing.length > 0 ? [...hiddenStonesInCaptured, ...hiddenStonesInCapturing] : []) : [],
                    mixModeSwitched: mixModeSwitched,
                    currentMixMode: state.mode === 'MIX' ? state.currentMixMode : null
                };
            }
        }

        await this.cacheGameState(gameId, state);
        
        // 데이터베이스에 따낸 돌 수 업데이트
        await prisma.game.update({
            where: { id: gameId },
            data: {
                capturedBlack: state.capturedBlack,
                capturedWhite: state.capturedWhite
            }
        });
        
        return {
            x: move.x,
            y: move.y,
            color: expectedColor,
            isPass: false,
            moveNumber: gameMove.moveNumber,
            capturedStones: capturedStones,
            isGameOver: state.ended,
            hiddenStonesRevealed: state.mode === 'HIDDEN' ? (hiddenStonesInCaptured.length > 0 || hiddenStonesInCapturing.length > 0 ? [...hiddenStonesInCaptured, ...hiddenStonesInCapturing] : []) : [],
            mixModeSwitched: mixModeSwitched,
            currentMixMode: state.mode === 'MIX' ? state.currentMixMode : null
        };
    }

    async finishGame(gameId, result, state) {
        await prisma.game.update({
            where: { id: gameId },
            data: {
                result,
                endedAt: new Date(),
                capturedBlack: state.capturedBlack,
                capturedWhite: state.capturedWhite
            },
        });
        // Rewards and rating updates are handled in resign/endGame logic
        // We'll centralize this in reward-and-ranking task
    }

    checkOmokWin(board, x, y, color) {
        const boardSize = board.length;
        const directions = [
            [[0, 1], [0, -1]], // Vertical
            [[1, 0], [-1, 0]], // Horizontal
            [[1, 1], [-1, -1]], // Diagonal \
            [[1, -1], [-1, 1]]  // Diagonal /
        ];

        for (const dirPair of directions) {
            let count = 1;
            for (const [dx, dy] of dirPair) {
                let nx = x + dx;
                let ny = y + dy;
                while (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize && board[ny][nx] === color) {
                    count++;
                    nx += dx;
                    ny += dy;
                }
            }
            if (count >= 5) return true;
        }
        return false;
    }

    async handlePass(gameId, color, state) {
        const opponentColor = color === 'black' ? 'white' : 'black';
        
        // 더블 패스 확인: 마지막 수가 통과였는지 확인
        // state.lastPass는 마지막 수가 통과인지를 나타냄
        const isDoublePass = state.lastPass === true;

        const gameMove = await prisma.gameMove.create({
            data: {
                gameId,
                moveNumber: state.moveNumber + 1,
                color: color,
                isPass: true,
            },
        });

        // currentColor는 timer.currentTurn이 관리하므로 여기서 업데이트하지 않음
        state.moveNumber = gameMove.moveNumber;
        state.moves.push({
            color: color,
            isPass: true,
            moveNumber: gameMove.moveNumber,
        });
        
        // 현재 통과를 기록 (다음 통과 시 더블 패스 감지용)
        state.lastPass = true;

        // 더블 패스인 경우 게임 종료
        if (isDoublePass) {
            console.log('[GameService] Double pass detected, ending game');
            state.ended = true;
            await this.cacheGameState(gameId, state); // 상태 저장 후 endGame 호출
            const endGameResult = await this.endGame(gameId, state);
            
            return {
                isPass: true,
                color: color,
                moveNumber: gameMove.moveNumber,
                isGameOver: true,
                isDoublePass: true
            };
        }

        await this.cacheGameState(gameId, state);

        return {
            isPass: true,
            color: color,
            moveNumber: gameMove.moveNumber,
            isGameOver: false,
            isDoublePass: false
        };
    }

    async endGame(gameId, state) {
        // 클래식 모드: 계가 진행 (영역 + 따낸 돌 + 덤으로 승부 결정)
        // CAPTURE 모드나 MIX 모드의 CAPTURE에서는 계가 불필요 (목표 따내기 점수로 승부 결정)
        const isCaptureMode = state.mode === 'CAPTURE';
        const isMixMode = state.mode === 'MIX';
        const currentMixMode = state.currentMixMode || state.mixModes?.[0] || 'CLASSIC';
        const isMixCapture = isMixMode && currentMixMode === 'CAPTURE';
        const shouldSkipScoring = isCaptureMode || isMixCapture; // CLASSIC 모드에서는 false
        
        let score = null;
        if (!shouldSkipScoring) {
            // 클래식 모드 및 일반 모드: 영역 계산 또는 AI 서비스를 통한 정확한 계가
            const aiService = require('./aiService');
            try {
                score = await aiService.calculateScore(gameId);
                // score 형식이 일관되도록 보장
                if (score && !score.areaScore) {
                    // 구 형식 (blackScore, whiteScore)을 새 형식으로 변환
                    score = {
                        areaScore: {
                            black: score.blackScore || 0,
                            white: score.whiteScore || 0
                        },
                        winner: score.winner || 'draw'
                    };
                }
                
                // scoreDetails 초기화
                if (!score.scoreDetails) {
                    score.scoreDetails = { black: {}, white: {} };
                }
                
                // 기본 점수 정보 저장 (집/영토, 사석)
                // calculateScore가 반환한 areaScore에서 사석을 제외한 영토 점수 추정
                // (정확한 영토 계산은 AI 서비스에서 수행)
                const komi = state.komi || 6.5;
                const capturedBlack = state.capturedBlack || 0;
                const capturedWhite = state.capturedWhite || 0;
                
                // 영토 점수 = 전체 점수 - 사석 - 덤
                score.scoreDetails.black.territory = Math.max(0, (score.areaScore.black || 0) - capturedBlack);
                score.scoreDetails.black.captured = capturedBlack;
                score.scoreDetails.white.territory = Math.max(0, (score.areaScore.white || 0) - capturedWhite - komi);
                score.scoreDetails.white.captured = capturedWhite;
                score.scoreDetails.white.komi = komi;
            } catch (error) {
                console.error('[GameService] Score calculation failed:', error);
                // 폴백: 간단한 점수 계산
                const komi = state.komi || 6.5;
                const capturedBlack = state.capturedBlack || 0;
                const capturedWhite = state.capturedWhite || 0;
                score = {
                    areaScore: {
                        black: capturedBlack,
                        white: capturedWhite + komi
                    },
                    winner: capturedBlack > (capturedWhite + komi) ? 'black' : 'white',
                    scoreDetails: {
                        black: {
                            territory: 0,
                            captured: capturedBlack
                        },
                        white: {
                            territory: 0,
                            captured: capturedWhite,
                            komi: komi
                        }
                    }
                };
            }
        } else {
            // CAPTURE 모드: 계가 없이 따낸 돌 수로 승부 결정
            const blackTarget = state.blackCaptureTarget || state.finalCaptureTarget || state.captureTarget || 20;
            const whiteTarget = state.whiteCaptureTarget || state.captureTarget || 20;
            score = {
                winner: state.capturedBlack >= blackTarget ? 'black' : (state.capturedWhite >= whiteTarget ? 'white' : 'draw'),
                areaScore: {
                    black: state.capturedBlack || 0,
                    white: state.capturedWhite || 0
                }
            };
        }
        
        // CAPTURE 모드는 계가 계산 건너뛰기
        if (state.mode === 'CAPTURE') {
            // 이미 위에서 score 설정됨
        } else if (state.mode === 'SPEED') {
            // 스피드바둑 시간 점수 계산 (1초당 0.2점, 피셔 방식만 사용)
            const timer = await timerService.getTimer(gameId);
            // 남은 시간을 초로 변환 (밀리초가 아닌 초 단위로 저장되어 있음)
            // 정수 초 단위로 절삭
            const blackTimeSeconds = Math.floor(timer.blackTime || 0);
            const whiteTimeSeconds = Math.floor(timer.whiteTime || 0);
            
            // 1초당 0.2점 계산 (정수 초 단위로 계산)
            const POINTS_PER_SECOND = 0.2;
            const blackTimeScore = Math.round(blackTimeSeconds * POINTS_PER_SECOND * 10) / 10; // 소수점 첫째자리까지
            const whiteTimeScore = Math.round(whiteTimeSeconds * POINTS_PER_SECOND * 10) / 10;
            
            // 점수에 시간 점수 추가
            score.areaScore.black = (score.areaScore.black || 0) + blackTimeScore;
            score.areaScore.white = (score.areaScore.white || 0) + whiteTimeScore;
            
            // scoreDetails에 시간 점수 상세 정보 저장
            if (!score.scoreDetails) {
                score.scoreDetails = { black: {}, white: {} };
            }
            score.scoreDetails.black.timeScore = blackTimeScore;
            score.scoreDetails.black.timeSeconds = blackTimeSeconds;
            score.scoreDetails.white.timeScore = whiteTimeScore;
            score.scoreDetails.white.timeSeconds = whiteTimeSeconds;
            
            // 총점 재계산
            score.areaScore.black = Math.round((score.areaScore.black || 0) * 10) / 10;
            score.areaScore.white = Math.round((score.areaScore.white || 0) * 10) / 10;
            
            // 승자 재결정
            score.winner = score.areaScore.black > score.areaScore.white ? 'black' : 
                          (score.areaScore.white > score.areaScore.black ? 'white' : 'draw');
        }
        
        // 베이스바둑: 사석으로 남은 베이스돌 5점씩 계산
        if (state.mode === 'BASE' && state.baseStones) {
            const board = state.stones || [];
            const boardSize = state.boardSize || 19;
            
            // 흑의 베이스돌 중 사석으로 남은 것 계산
            let blackBaseStonesAlive = 0;
            if (state.baseStones.black) {
                state.baseStones.black.forEach(bs => {
                    // 베이스돌이 아직 바둑판에 있고 흑돌로 남아있는지 확인
                    if (bs.y >= 0 && bs.y < boardSize && bs.x >= 0 && bs.x < boardSize) {
                        if (board[bs.y] && board[bs.y][bs.x] === 'black') {
                            blackBaseStonesAlive++;
                        }
                    }
                });
            }
            
            // 백의 베이스돌 중 사석으로 남은 것 계산
            let whiteBaseStonesAlive = 0;
            if (state.baseStones.white) {
                state.baseStones.white.forEach(bs => {
                    // 베이스돌이 아직 바둑판에 있고 백돌로 남아있는지 확인
                    if (bs.y >= 0 && bs.y < boardSize && bs.x >= 0 && bs.x < boardSize) {
                        if (board[bs.y] && board[bs.y][bs.x] === 'white') {
                            whiteBaseStonesAlive++;
                        }
                    }
                });
            }
            
            // 사석으로 남은 베이스돌을 5점씩 추가
            const blackBaseStoneScore = blackBaseStonesAlive * 5;
            const whiteBaseStoneScore = whiteBaseStonesAlive * 5;
            
            score.areaScore.black = (score.areaScore.black || 0) + blackBaseStoneScore;
            score.areaScore.white = (score.areaScore.white || 0) + whiteBaseStoneScore;
            
            // scoreDetails에 베이스돌 점수 상세 정보 저장
            if (!score.scoreDetails) {
                score.scoreDetails = { black: {}, white: {} };
            }
            score.scoreDetails.black.baseStoneScore = blackBaseStoneScore;
            score.scoreDetails.black.baseStonesAlive = blackBaseStonesAlive;
            score.scoreDetails.white.baseStoneScore = whiteBaseStoneScore;
            score.scoreDetails.white.baseStonesAlive = whiteBaseStonesAlive;
            
            // 총점 재계산
            score.areaScore.black = Math.round((score.areaScore.black || 0) * 10) / 10;
            score.areaScore.white = Math.round((score.areaScore.white || 0) * 10) / 10;
            
            // 승자 재결정
            score.winner = score.areaScore.black > score.areaScore.white ? 'black' : 
                          (score.areaScore.white > score.areaScore.black ? 'white' : 'draw');
        }
        
        // 특수 아이템 정보를 scoreDetails에 추가 (히든/스캔/미사일 아이템 남은 개수)
        if (!score.scoreDetails) {
            score.scoreDetails = { black: {}, white: {} };
        }
        
        // 히든 아이템 남은 개수
        if (state.hiddenStoneCount && state.hiddenStonesUsed) {
            score.scoreDetails.black.hiddenItemsRemaining = Math.max(0, (state.hiddenStoneCount || 10) - (state.hiddenStonesUsed.black || 0));
            score.scoreDetails.white.hiddenItemsRemaining = Math.max(0, (state.hiddenStoneCount || 10) - (state.hiddenStonesUsed.white || 0));
        }
        
        // 스캔 아이템 남은 개수
        if (state.scanCount && state.scanUsed) {
            const blackScanCount = typeof state.scanCount === 'object' ? (state.scanCount.black || 3) : (state.scanCount || 3);
            const whiteScanCount = typeof state.scanCount === 'object' ? (state.scanCount.white || 3) : (state.scanCount || 3);
            score.scoreDetails.black.scanItemsRemaining = Math.max(0, blackScanCount - (state.scanUsed.black || 0));
            score.scoreDetails.white.scanItemsRemaining = Math.max(0, whiteScanCount - (state.scanUsed.white || 0));
        }
        
        // 미사일 아이템 남은 개수
        if (state.missileMoveLimit && state.missileMovesUsed) {
            score.scoreDetails.black.missileItemsRemaining = Math.max(0, (state.missileMoveLimit || 10) - (state.missileMovesUsed.black || 0));
            score.scoreDetails.white.missileItemsRemaining = Math.max(0, (state.missileMoveLimit || 10) - (state.missileMovesUsed.white || 0));
        }
        
        // CAPTURE 모드나 MIX 모드의 CAPTURE에서는 이미 finishGame에서 result가 설정됨
        // isCaptureMode, isMixMode, currentMixMode, isMixCapture는 함수 상단에서 이미 선언됨
        let result;
        
        if (isCaptureMode || isMixCapture) {
            const game = await this.getGame(gameId);
            result = game.result || (score.winner === 'black' ? 'black_win' : 'white_win');
        } else {
            result = score.winner === 'black' ? 'black_win' : 'white_win';
        }
        
        await prisma.game.update({
            where: { id: gameId },
            data: {
                result,
                endedAt: new Date(),
                capturedBlack: state.capturedBlack,
                capturedWhite: state.capturedWhite
            },
        });

        // Update ratings and get rewards
        const rankingService = require('./rankingService');
        const rewards = await rankingService.updateRatings(gameId, result);

        // Update user statuses to waiting
        const game = await this.getGame(gameId);
        if (global.waitingRoomSocket) {
            if (game.blackId) await global.waitingRoomSocket.setUserWaiting(game.blackId);
            if (game.whiteId) await global.waitingRoomSocket.setUserWaiting(game.whiteId);
        }

        return { result, score, rewards, game };
    }

    findCapturedStones(board, lastX, lastY, opponentColor) {
        const captured = [];
        const boardSize = board.length;
        const checked = Array(boardSize).fill(null).map(() => Array(boardSize).fill(false));
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];

        directions.forEach(([dx, dy]) => {
            const nx = lastX + dx;
            const ny = lastY + dy;

            if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize && board[ny][nx] === opponentColor && !checked[ny][nx]) {
                const group = [];
                if (!this.hasLibertiesRecursive(board, nx, ny, opponentColor, checked, group)) {
                    captured.push(...group);
                }
            }
        });

        return captured;
    }

    // 따목 특수 규칙: 상대 돌 2개가 나란히 놓인 경우 양쪽을 막아 따내기
    findTtakCaptures(board, x, y, myColor, opponentColor) {
        const captured = [];
        const boardSize = board.length;
        const directions = [
            [[0, 1], [0, -1]], // Vertical
            [[1, 0], [-1, 0]], // Horizontal
            [[1, 1], [-1, -1]], // Diagonal \
            [[1, -1], [-1, 1]]  // Diagonal /
        ];

        for (const dirPair of directions) {
            // 양쪽 방향 확인
            let leftStones = [];
            let rightStones = [];
            
            // 왼쪽/위쪽 방향 확인
            const [dx1, dy1] = dirPair[0];
            let nx = x + dx1;
            let ny = y + dy1;
            while (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize && board[ny][nx] === opponentColor) {
                leftStones.push({ x: nx, y: ny });
                nx += dx1;
                ny += dy1;
            }
            
            // 오른쪽/아래쪽 방향 확인
            const [dx2, dy2] = dirPair[1];
            nx = x + dx2;
            ny = y + dy2;
            while (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize && board[ny][nx] === opponentColor) {
                rightStones.push({ x: nx, y: ny });
                nx += dx2;
                ny += dy2;
            }
            
            // 양쪽에 각각 정확히 2개씩 돌이 있고, 내 돌이 양쪽을 막은 경우
            if (leftStones.length === 2 && rightStones.length === 2) {
                // 양쪽 돌 모두 따내기
                captured.push(...leftStones, ...rightStones);
            }
        }

        return captured;
    }

    hasLiberties(board, x, y, color) {
        const boardSize = board.length;
        const checked = Array(boardSize).fill(null).map(() => Array(boardSize).fill(false));
        return this.hasLibertiesRecursive(board, x, y, color, checked, []);
    }

    hasLibertiesRecursive(board, x, y, color, checked, group) {
        const boardSize = board.length;
        if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) return false;
        if (checked[y][x]) return false;
        
        checked[y][x] = true;
        group.push({ x, y });

        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        let hasLib = false;

        for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;

            const boardSize = board.length;
            if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize) {
                if (board[ny][nx] === null) {
                    hasLib = true;
                } else if (board[ny][nx] === color) {
                    if (this.hasLibertiesRecursive(board, nx, ny, color, checked, group)) {
                        hasLib = true;
                    }
                }
            }
        }

        return hasLib;
    }

    // 따목 특수 규칙: 상대 돌 2개가 나란히 놓인 경우 양쪽을 막아 따내기
    findTtakCaptures(board, x, y, myColor, opponentColor) {
        const captured = [];
        const boardSize = board.length;
        const directions = [
            [[0, 1], [0, -1]], // Vertical
            [[1, 0], [-1, 0]], // Horizontal
            [[1, 1], [-1, -1]], // Diagonal \
            [[1, -1], [-1, 1]]  // Diagonal /
        ];

        for (const dirPair of directions) {
            // 양쪽 방향 확인
            let leftStones = [];
            let rightStones = [];
            
            // 왼쪽/위쪽 방향 확인
            for (const [dx, dy] of [dirPair[0]]) {
                let nx = x + dx;
                let ny = y + dy;
                while (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize && board[ny][nx] === opponentColor) {
                    leftStones.push({ x: nx, y: ny });
                    nx += dx;
                    ny += dy;
                }
            }
            
            // 오른쪽/아래쪽 방향 확인
            for (const [dx, dy] of [dirPair[1]]) {
                let nx = x + dx;
                let ny = y + dy;
                while (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize && board[ny][nx] === opponentColor) {
                    rightStones.push({ x: nx, y: ny });
                    nx += dx;
                    ny += dy;
                }
            }
            
            // 양쪽에 각각 2개씩 돌이 있고, 내 돌이 양쪽을 막은 경우
            if (leftStones.length === 2 && rightStones.length === 2) {
                // 양쪽 돌 모두 따내기
                captured.push(...leftStones, ...rightStones);
            }
        }

        return captured;
    }

    /**
     * 패(ko) 규칙 체크
     * 패는 같은 형태가 반복되는 것을 방지하는 규칙입니다.
     * 
     * 단순 패(Simple Ko): 돌 1개를 무한 반복해서 서로 잡아내는 경우 (금지)
     * - 마지막 수에서 돌 1개를 딴 경우
     * - 현재 수에서도 돌 1개를 딴 경우
     * - 현재 수의 위치가 마지막 수에서 딴 돌의 위치와 같으면 → 단순 패 (금지)
     * - 한 번 따내면 상대방은 다른 곳에 한 번 두어야만 다시 따낼 수 있음
     * 
     * 환격(Circular Ko): 따낸 돌의 개수가 다른 경우 (허용)
     * - 예: 마지막 수에서 돌 1개를 딴 경우, 현재 수에서 돌 3개를 딴 경우
     * - 이런 경우는 환격이므로 바로 따낼 수 있음 (허용)
     */
    isKo(state, x, y, color, capturedStones, boardAfterMove) {
        // 단순 패는 정확히 돌 1개를 딴 경우에만 발생
        if (!capturedStones || capturedStones.length !== 1) {
            return false;
        }

        // 최소 2수 이상 있어야 패 체크 가능
        if (!state.moves || state.moves.length < 2) {
            return false;
        }

        const lastMove = state.moves[state.moves.length - 1];

        // 마지막 수가 패스가 아니어야 함
        if (lastMove.isPass) {
            return false;
        }

        // 마지막 수에서도 정확히 돌 1개를 딴 경우만 체크
        if (!lastMove.capturedStones || lastMove.capturedStones.length !== 1) {
            return false;
        }

        // 마지막 수에서 딴 돌의 위치 확인
        const lastCapturedStone = lastMove.capturedStones[0];

        // 현재 수가 마지막 수에서 딴 돌의 위치에 두려고 하는지 확인
        if (x === lastCapturedStone.x && y === lastCapturedStone.y) {
            // 단순 패: 돌 1개씩 딴 경우 (1개 vs 1개)는 단순 패로 바로 되따내는 것을 금지
            // 한 번 따내면 상대방은 다른 곳에 한 번 두어야만 다시 따낼 수 있음
            console.log('[GameService] Simple ko detected: trying to capture back at same position (1 vs 1), blocking move');
            return true;
        }

        return false;
    }

    /**
     * 환격(환형 패, Circular Ko) 체크
     * 3개 이상의 위치가 순환하는 패인지 확인
     * 환격은 허용되어야 함
     * 
     * 환격 예시:
     * - A 위치에서 돌 1개를 따냄 -> B 위치에 둠
     * - B 위치에서 돌 1개를 따냄 -> C 위치에 둠
     * - C 위치에서 돌 1개를 따냄 -> A 위치에 둠 (순환)
     */
    isCircularKo(state, x, y, color, capturedStones) {
        if (!state.moves || state.moves.length < 4) {
            // 환격은 최소 4수 이상 필요 (3개 위치가 순환하려면 최소 4수)
            return false;
        }

        // 현재 수에서 딴 돌의 위치
        const currentCapturedStone = capturedStones[0];
        
        // 최근 8수를 확인하여 환격 패턴 찾기
        const recentMoves = state.moves.slice(-8).filter(m => !m.isPass && m.capturedStones && m.capturedStones.length === 1);
        
        if (recentMoves.length < 3) {
            return false;
        }

        // 환격 패턴 추적: 각 수가 이전 수에서 딴 돌의 위치에 두는지 확인
        const koChain = [];
        
        // 최근 수들에서 패 체인 구성
        for (let i = 0; i < recentMoves.length; i++) {
            const move = recentMoves[i];
            if (move.capturedStones && move.capturedStones.length === 1) {
                const capturedPos = `${move.capturedStones[0].x},${move.capturedStones[0].y}`;
                const movePos = `${move.x},${move.y}`;
                
                // 이전 수가 있고, 이전 수에서 딴 돌의 위치에 현재 수를 둔 경우
                if (i > 0) {
                    const prevMove = recentMoves[i - 1];
                    if (prevMove.capturedStones && prevMove.capturedStones.length === 1) {
                        const prevCapturedPos = `${prevMove.capturedStones[0].x},${prevMove.capturedStones[0].y}`;
                        if (movePos === prevCapturedPos) {
                            koChain.push({
                                captured: capturedPos,
                                move: movePos,
                                capturedPosObj: { x: move.capturedStones[0].x, y: move.capturedStones[0].y },
                                movePosObj: { x: move.x, y: move.y }
                            });
                        }
                    }
                }
            }
        }
        
        // 현재 수도 체인에 추가
        const currentCapturedPos = `${currentCapturedStone.x},${currentCapturedStone.y}`;
        const currentMovePos = `${x},${y}`;
        
        // 마지막 수에서 딴 돌의 위치에 현재 수를 두는지 확인
        if (recentMoves.length > 0) {
            const lastMove = recentMoves[recentMoves.length - 1];
            if (lastMove.capturedStones && lastMove.capturedStones.length === 1) {
                const lastCapturedPos = `${lastMove.capturedStones[0].x},${lastMove.capturedStones[0].y}`;
                if (currentMovePos === lastCapturedPos) {
                    koChain.push({
                        captured: currentCapturedPos,
                        move: currentMovePos,
                        capturedPosObj: { x: currentCapturedStone.x, y: currentCapturedStone.y },
                        movePosObj: { x, y }
                    });
                }
            }
        }

        // 환격 확인: 3개 이상의 고유 위치가 순환하는지 체크
        if (koChain.length >= 3) {
            // 모든 위치 수집 (딴 돌 위치 + 착수 위치)
            const allPositions = new Set();
            koChain.forEach(link => {
                allPositions.add(link.captured);
                allPositions.add(link.move);
            });
            
            // 3개 이상의 고유 위치가 있으면 환격 가능성
            if (allPositions.size >= 3) {
                // 순환 구조 확인: 첫 번째에서 딴 돌의 위치가 마지막 수의 위치와 같은지
                const firstLink = koChain[0];
                const lastLink = koChain[koChain.length - 1];
                
                // 환격: 첫 번째에서 딴 돌의 위치가 마지막 수의 위치와 같거나,
                // 체인이 순환 구조를 이루는 경우
                if (firstLink.captured === lastLink.move || 
                    (koChain.length >= 3 && allPositions.size >= 3)) {
                    // 3개 이상의 위치가 순환하는 환격으로 판단
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * 보드 상태 비교를 통한 패 체크
     * 현재 보드 상태가 마지막 수 이전 상태와 동일한지 확인
     */
    isBoardStateKo(state, boardAfterMove) {
        if (!state.moves || state.moves.length < 2) {
            return false;
        }

        const lastMove = state.moves[state.moves.length - 1];

        // 마지막 수가 패스가 아니어야 함
        if (lastMove.isPass) {
            return false;
        }

        // 마지막 수에서 딴 돌 정보가 있어야 함
        if (!lastMove.capturedStones || lastMove.capturedStones.length !== 1) {
            return false;
        }

        // 마지막 수 이전 보드 상태 재구성
        const boardBeforeLastMove = JSON.parse(JSON.stringify(state.stones));
        
        // 마지막 수를 되돌림
        if (lastMove.x !== null && lastMove.y !== null) {
            boardBeforeLastMove[lastMove.y][lastMove.x] = null;
            
            // 마지막 수에서 딴 돌 복원 (정확한 위치를 알고 있음)
            const lastCapturedStone = lastMove.capturedStones[0];
            const lastMoveColor = lastMove.color;
            const lastOpponentColor = lastMoveColor === 'black' ? 'white' : 'black';
            
            // 딴 돌의 위치에 상대 돌 복원
            if (lastCapturedStone.x >= 0 && lastCapturedStone.x < boardBeforeLastMove.length &&
                lastCapturedStone.y >= 0 && lastCapturedStone.y < boardBeforeLastMove.length) {
                boardBeforeLastMove[lastCapturedStone.y][lastCapturedStone.x] = lastOpponentColor;
            }
        }

        // 현재 보드 상태와 마지막 수 이전 상태 비교
        return this.boardsEqual(boardAfterMove, boardBeforeLastMove);
    }

    /**
     * 두 보드 상태가 동일한지 비교
     */
    boardsEqual(board1, board2) {
        if (board1.length !== board2.length) {
            return false;
        }

        for (let y = 0; y < board1.length; y++) {
            if (board1[y].length !== board2[y].length) {
                return false;
            }
            for (let x = 0; x < board1[y].length; x++) {
                if (board1[y][x] !== board2[y][x]) {
                    return false;
                }
            }
        }

        return true;
    }

    async resign(gameId, userId) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        const result = game.blackId === userId ? 'white_win' : 'black_win';

        await prisma.game.update({
            where: { id: gameId },
            data: {
                result,
                endedAt: new Date(),
            },
        });

        // Update ratings and get rewards
        const rankingService = require('./rankingService');
        const rewards = await rankingService.updateRatings(gameId, result);

        // Stop timer
        await timerService.stopTimer(gameId);

        // Update user statuses to waiting
        if (global.waitingRoomSocket) {
            if (game.blackId !== null) {
                await global.waitingRoomSocket.setUserWaiting(game.blackId);
            }
            if (game.whiteId !== null) {
                await global.waitingRoomSocket.setUserWaiting(game.whiteId);
            }
        }

        return { result, rewards };
    }

    async handleTimeExpired(gameId, expiredColor) {
        const game = await this.getGame(gameId);
        const result = expiredColor === 'black' ? 'white_win' : 'black_win';

        await prisma.game.update({
            where: { id: gameId },
            data: {
                result,
                endedAt: new Date(),
            },
        });

        // Update ratings and get rewards
        const rankingService = require('./rankingService');
        const rewards = await rankingService.updateRatings(gameId, result);

        await timerService.stopTimer(gameId);

        // Update user statuses to waiting
        if (global.waitingRoomSocket) {
            if (game.blackId !== null) {
                await global.waitingRoomSocket.setUserWaiting(game.blackId);
            }
            if (game.whiteId !== null) {
                await global.waitingRoomSocket.setUserWaiting(game.whiteId);
            }
        }

        return { result, rewards };
    }

    // 두 플레이어가 모두 나간 경우 게임을 포기 상태로 표시
    async markGameAsAbandoned(gameId) {
        try {
            const game = await this.getGame(gameId);
            if (!game || game.endedAt) {
                return; // 이미 종료된 게임은 처리하지 않음
            }

            // 게임을 종료 상태로 변경 (결과는 없음)
            await prisma.game.update({
                where: { id: gameId },
                data: {
                    endedAt: new Date(),
                    result: 'ABANDONED' // 포기 상태
                }
            });

            // Redis 캐시 삭제
            const redis = getRedisClient();
            if (redis) {
                try {
                    await redis.del(`game:${gameId}`);
                } catch (error) {
                    console.error('Redis delete error:', error);
                }
            }

            // 타이머 중지
            await timerService.stopTimer(gameId);

            // 사용자 상태를 waiting으로 변경
            if (global.waitingRoomSocket) {
                if (game.blackId) {
                    await global.waitingRoomSocket.setUserWaiting(game.blackId);
                }
                if (game.whiteId) {
                    await global.waitingRoomSocket.setUserWaiting(game.whiteId);
                }
            }

            console.log(`Game ${gameId} marked as abandoned - both players left`);
        } catch (error) {
            console.error('Error marking game as abandoned:', error);
        }
    }
    
    async submitStonePickingChoice(gameId, userId, choice) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }
        if (game.mode !== 'SPEED') {
            throw new Error('This game mode does not support stone picking');
        }
        if (game.isAiGame) {
            throw new Error('AI games do not support stone picking');
        }
        
        const state = await this.getGameState(gameId);
        if (!state.stonePickingPhase) {
            throw new Error('Stone picking phase has already ended');
        }
        if (Date.now() > state.stonePickingDeadline) {
            throw new Error('Stone picking deadline has passed');
        }
        
        // 흑 역할인지 확인
        if (state.stonePickingRoles.black !== userId) {
            throw new Error('Only the black role player can submit a choice');
        }
        
        // 선택값 검증
        if (choice !== 'odd' && choice !== 'even') {
            throw new Error('Choice must be "odd" or "even"');
        }
        
        // 선택값 저장
        state.stonePickingChoice = choice;
        await this.cacheGameState(gameId, state);
        
        // 돌가리기 처리
        return await this.processStonePicking(gameId, game, state);
    }
    
    async processStonePicking(gameId, game, state) {
        const stoneCount = state.stoneCount;
        const choice = state.stonePickingChoice;
        
        // 홀수/짝수 판정
        const isOdd = stoneCount % 2 === 1;
        const isCorrect = (isOdd && choice === 'odd') || (!isOdd && choice === 'even');
        
        let finalBlackId = game.blackId;
        let finalWhiteId = game.whiteId;
        let winnerRole = null;
        
        if (isCorrect) {
            // 맞췄으면 흑 역할 유저가 흑
            finalBlackId = state.stonePickingRoles.black;
            finalWhiteId = state.stonePickingRoles.white;
            winnerRole = 'black';
        } else {
            // 틀렸으면 흑백 교체
            finalBlackId = state.stonePickingRoles.white;
            finalWhiteId = state.stonePickingRoles.black;
            winnerRole = 'white';
        }
        
        // 흑/백이 바뀌었으면 DB 업데이트
        if (finalBlackId !== game.blackId) {
            await prisma.game.update({
                where: { id: gameId },
                data: {
                    blackId: finalBlackId,
                    whiteId: finalWhiteId
                }
            });
            // 게임 객체 업데이트
            game.blackId = finalBlackId;
            game.whiteId = finalWhiteId;
        }
        
        // 돌가리기 단계 종료
        state.stonePickingPhase = false;
        state.stonePickingDeadline = null;
        state.stonePickingRoles = null;
        state.stonePickingChoice = null;
        state.stoneCount = null;
        
        await this.cacheGameState(gameId, state);
        
        return {
            choice: choice,
            stoneCount: stoneCount,
            isCorrect: isCorrect,
            stonePickingPhase: false,
            needProcessing: true,
            result: isCorrect ? 'correct' : 'incorrect',
            winnerRole: winnerRole,
            finalBlackId: finalBlackId,
            finalWhiteId: finalWhiteId
        };
    }
}

module.exports = new GameService();

