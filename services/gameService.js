const prisma = require('../config/database');
const { getRedisClient } = require('../config/redis');
const timerService = require('./timerService');

class GameService {
    async createGame(blackId, whiteId, blackRating, whiteRating, options = {}) {
        const game = await prisma.game.create({
            data: {
                blackId,
                whiteId,
                blackRating,
                whiteRating,
                matchType: options.matchType || 'RANKED',
                mode: options.mode || 'CLASSIC',
                komi: options.komi || 6.5,
            },
        });

        // Initialize timer
        const isSpeedMode = game.mode === 'SPEED';
        const timePerPlayer = isSpeedMode ? (options.timeLimit || 10) * 60 : 30 * 60; // 스피드바둑은 분 단위, 기본 10분
        await timerService.initializeTimer(game.id, timePerPlayer, {
            isFischer: isSpeedMode,
            fischerIncrement: options.timeIncrement || 5 // 기본 5초 추가
        });

        // Cache game state
        const boardSize = options.boardSize || 19;
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
            boardSize: boardSize
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
        
        // 베이스바둑 베이스돌 배치 시스템 초기화
        if (game.mode === 'BASE') {
            initialState.basePlacementPhase = true;
            initialState.baseStones = {
                black: [], // blackId의 베이스돌
                white: []  // whiteId의 베이스돌
            };
            initialState.baseStoneCount = options.baseStones || 4; // 기본 4개
            initialState.basePlacementDeadline = Date.now() + 30000; // 30초 배치 시간
            initialState.baseStonesRevealed = false; // 베이스돌 공개 여부
            initialState.komiBiddingPhase = false; // 덤 입찰 단계
            initialState.komiBids = {}; // 덤 입찰 정보 {userId: {komi: number, color: 'black'|'white'}}
            initialState.komiBiddingRound = 1; // 덤 입찰 라운드
            initialState.komiBiddingDeadline = null; // 덤 입찰 마감 시간
            initialState.finalKomi = 0.5; // 베이스바둑은 기본 덤 0.5집, 입찰로 추가 결정
        }
        
        // 히든바둑 히든 착수 시스템 초기화
        if (game.mode === 'HIDDEN') {
            initialState.hiddenStones = {
                black: [], // blackId의 히든돌 {x, y, revealed: false}
                white: []  // whiteId의 히든돌 {x, y, revealed: false}
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
        }
        
        // 미사일바둑 미사일 이동 시스템 초기화
        if (game.mode === 'MISSILE') {
            initialState.missileMovesUsed = {
                black: 0,
                white: 0
            };
            initialState.missileMoveLimit = options.missileMoveLimit || 10; // 기본 10회
        }
        
        await this.cacheGameState(game.id, initialState);

        return game;
    }

    async createAiGame(userId, aiLevel, userColor = 'black', options = {}) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new Error('User not found');
        }
        
        // Determine which color the user plays
        const isUserBlack = userColor === 'black' || (userColor === 'random' && Math.random() < 0.5);
        const aiColor = isUserBlack ? 'white' : 'black';
        
        // 놀이바둑일 때는 단일 AI봇 사용 (aiLevel은 null)
        const isCasualMode = options.isCasualMode || false;
        const finalAiLevel = isCasualMode ? null : aiLevel;
        
        // AI 레이팅 계산 (놀이바둑일 때는 기본값 1500 사용)
        const aiRating = isCasualMode ? 1500 : (1500 + (aiLevel * 100));

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
                komi: options.komi || 6.5,
            },
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
        const timePerPlayer = isSpeedMode ? (options.timeLimit || 10) * 60 : 30 * 60; // 스피드바둑은 분 단위, 기본 10분
        await timerService.initializeTimer(game.id, timePerPlayer, {
            isFischer: isSpeedMode,
            fischerIncrement: options.timeIncrement || 5 // 기본 5초 추가
        });

        // Cache game state
        const boardSize = options.boardSize || 19;
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
            boardSize: boardSize
        };
        
        // 따내기바둑 입찰 시스템 초기화 (AI 게임)
        if (game.mode === 'CAPTURE') {
            aiGameState.biddingPhase = true;
            aiGameState.bids = {};
            aiGameState.biddingRound = 1;
            aiGameState.captureTarget = options.captureTarget || 20;
            aiGameState.captureBidDeadline = Date.now() + 30000;
            aiGameState.finalCaptureTarget = null;
        }
        
        await this.cacheGameState(game.id, aiGameState);

        return game;
    }

    async getGame(gameId) {
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
                    select: { id: true, nickname: true, rating: true, mannerScore: true },
                },
                whitePlayer: {
                    select: { id: true, nickname: true, rating: true, mannerScore: true },
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
        const redis = getRedisClient();
        if (redis) {
            try {
                const state = await redis.get(`game:state:${gameId}`);
                if (state) {
                    return JSON.parse(state);
                }
            } catch (error) {
                console.error('Redis get error:', error);
            }
        }

        // Load from database if not in cache
        const game = await this.getGame(gameId);
        const moves = await prisma.gameMove.findMany({
            where: { gameId },
            orderBy: { moveNumber: 'asc' },
        });

        // Redis에서 boardSize 가져오기 시도
        let boardSize = 19;
        if (redis) {
            try {
                const cachedState = await redis.get(`game:state:${gameId}`);
                if (cachedState) {
                    const parsed = JSON.parse(cachedState);
                    if (parsed.boardSize) {
                        boardSize = parsed.boardSize;
                    }
                }
            } catch (error) {
                console.error('Redis get error in getGameState:', error);
            }
        }

        const gameState = {
            stones: Array(boardSize).fill(null).map(() => Array(boardSize).fill(null)),
            currentColor: 'black',
            moveNumber: moves.length,
            moves: moves.map(m => ({
                x: m.x,
                y: m.y,
                color: m.color,
                isPass: m.isPass,
                moveNumber: m.moveNumber,
            })),
            capturedBlack: 0,
            capturedWhite: 0,
            boardSize: boardSize
        };

        // Reconstruct board from moves
        moves.forEach(move => {
            if (!move.isPass && move.x !== null && move.y !== null) {
                if (move.y < boardSize && move.x < boardSize) {
                    gameState.stones[move.y][move.x] = move.color;
                }
            }
            gameState.currentColor = move.color === 'black' ? 'white' : 'black';
        });

        await this.cacheGameState(gameId, gameState);
        return gameState;
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

        // 입찰 값 검증 (1-50)
        if (bid < 1 || bid > 50) {
            throw new Error('Bid must be between 1 and 50');
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
            state.finalCaptureTarget = finalTarget;
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

    // 베이스바둑 덤 입찰 처리
    async submitKomiBid(gameId, userId, color, komi) {
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

        // 입찰 저장
        if (!state.komiBids) {
            state.komiBids = {};
        }
        state.komiBids[userId] = { color, komi };
        
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
        let winnerId = null;
        let winnerColor = null;
        let finalKomi = null;
        let needRebid = false;

        // 둘 다 흑을 원하는 경우: 덤이 더 낮은 쪽이 흑
        if (blackBid.color === 'black' && whiteBid.color === 'black') {
            if (blackBid.komi < whiteBid.komi) {
                winnerId = game.blackId;
                winnerColor = 'black';
                finalKomi = blackBid.komi;
            } else if (whiteBid.komi < blackBid.komi) {
                winnerId = game.whiteId;
                winnerColor = 'black';
                finalKomi = whiteBid.komi;
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
            } else {
                // 동점인 경우
                if (state.komiBiddingRound >= 2) {
                    // 랜덤 결정
                    const randomWinner = Math.random() < 0.5 ? game.blackId : game.whiteId;
                    winnerId = randomWinner;
                    winnerColor = 'black';
                    finalKomi = blackBid.komi;
                    
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
                    }
                } else {
                    needRebid = true;
                    state.komiBiddingRound = 2;
                    state.komiBids = {};
                    state.komiBiddingDeadline = Date.now() + 30000;
                }
            }
        }
        // 둘 다 백을 원하는 경우: 덤이 더 높은 쪽이 백
        else if (blackBid.color === 'white' && whiteBid.color === 'white') {
            if (blackBid.komi > whiteBid.komi) {
                winnerId = game.blackId;
                winnerColor = 'white';
                finalKomi = blackBid.komi;
            } else if (whiteBid.komi > blackBid.komi) {
                winnerId = game.whiteId;
                winnerColor = 'white';
                finalKomi = whiteBid.komi;
            } else {
                if (state.komiBiddingRound >= 2) {
                    const randomWinner = Math.random() < 0.5 ? game.blackId : game.whiteId;
                    winnerId = randomWinner;
                    winnerColor = 'white';
                    finalKomi = blackBid.komi;
                    
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
                    }
                } else {
                    needRebid = true;
                    state.komiBiddingRound = 2;
                    state.komiBids = {};
                    state.komiBiddingDeadline = Date.now() + 30000;
                }
            }
        }
        // 서로 다른 색을 원하는 경우: 흑을 원하는 쪽이 흑
        else {
            if (blackBid.color === 'black') {
                winnerId = game.blackId;
                winnerColor = 'black';
                finalKomi = whiteBid.komi;
            } else {
                winnerId = game.whiteId;
                winnerColor = 'black';
                finalKomi = blackBid.komi;
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
        }

        await this.cacheGameState(gameId, state);

        return {
            komiBids: needRebid ? {} : { [winnerId]: { color: winnerColor, komi: finalKomi } },
            komiBiddingRound: state.komiBiddingRound,
            komiBiddingPhase: state.komiBiddingPhase,
            finalKomi: finalKomi,
            winnerId: winnerId,
            winnerColor: winnerColor,
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
        
        // 스캔 사용 횟수 확인
        const playerKey = game.blackId === userId ? 'black' : 'white';
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

        // 상대의 히든돌 확인
        const opponentKey = playerKey === 'black' ? 'white' : 'black';
        const opponentHiddenStones = state.hiddenStones[opponentKey] || [];
        const scannedStone = opponentHiddenStones.find(hs => hs.x === x && hs.y === y && !hs.revealed);
        
        // 스캔 사용 횟수 증가
        state.scanUsed[playerKey] = scanUsed + 1;
        
        // 히든돌이 발견되면 공개
        if (scannedStone) {
            scannedStone.revealed = true;
        }

        await this.cacheGameState(gameId, state);

        return {
            found: !!scannedStone,
            scanUsed: state.scanUsed,
            hiddenStones: state.hiddenStones
        };
    }

    // 미사일바둑 미사일 이동
    async moveMissile(gameId, userId, fromX, fromY, toX, toY) {
        const game = await this.getGame(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        if (game.mode !== 'MISSILE') {
            throw new Error('This game mode does not support missile moves');
        }

        const state = await this.getGameState(gameId);
        
        // 미사일 사용 횟수 확인
        const playerKey = game.blackId === userId ? 'black' : 'white';
        const usedCount = state.missileMovesUsed[playerKey] || 0;
        const moveLimit = state.missileMoveLimit || 10;
        
        if (usedCount >= moveLimit) {
            throw new Error('All missile moves have been used');
        }

        // 위치 검증 (boardSize 사용)
        const boardSize = state.boardSize || 19;
        if (fromX < 0 || fromX >= boardSize || fromY < 0 || fromY >= boardSize ||
            toX < 0 || toX >= boardSize || toY < 0 || toY >= boardSize) {
            throw new Error('Invalid coordinates');
        }

        // 출발 위치에 자신의 돌이 있는지 확인
        const playerColor = playerKey === 'black' ? 'black' : 'white';
        if (state.stones[fromY][fromX] !== playerColor) {
            throw new Error('You can only move your own stones');
        }

        // 도착 위치가 비어있는지 확인
        if (state.stones[toY][toX] !== null) {
            throw new Error('Destination position is not empty');
        }

        // 상하좌우 직선 이동만 허용
        const dx = toX - fromX;
        const dy = toY - fromY;
        
        if (dx !== 0 && dy !== 0) {
            throw new Error('Missile can only move in straight lines (horizontal or vertical)');
        }
        
        if (dx === 0 && dy === 0) {
            throw new Error('Cannot move to the same position');
        }

        // 경로에 장애물이 있는지 확인
        const stepX = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
        const stepY = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        
        for (let i = 1; i < steps; i++) {
            const checkX = fromX + stepX * i;
            const checkY = fromY + stepY * i;
            if (state.stones[checkY][checkX] !== null) {
                throw new Error('Path is blocked');
            }
        }

        // 돌 이동
        state.stones[fromY][fromX] = null;
        state.stones[toY][toX] = playerColor;

        // 미사일 사용 횟수 증가
        state.missileMovesUsed[playerKey] = usedCount + 1;

        // 이동한 돌 주변의 상대 돌 따내기 체크
        const opponentColor = playerColor === 'black' ? 'white' : 'black';
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

        await this.cacheGameState(gameId, state);

        return {
            fromX: fromX,
            fromY: fromY,
            toX: toX,
            toY: toY,
            color: playerColor,
            moveNumber: gameMove.moveNumber,
            capturedStones: capturedStones,
            missileMovesUsed: state.missileMovesUsed
        };
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
            } catch (error) {
                console.error('Redis cache error:', error);
            }
        }
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

        const expectedColor = state.currentColor;
        
        if (userId !== 'ai') {
            if (expectedColor === 'black' && game.blackId !== userId) {
                throw new Error('Not your turn');
            }
            if (expectedColor === 'white' && game.whiteId !== userId) {
                throw new Error('Not your turn');
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

        // 주사위바둑: 주사위 결과만큼 흑돌 배치 제한
        if (state.mode === 'DICE') {
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
        const capturedStones = this.findCapturedStones(boardAfterMove, move.x, move.y, opponentColor);
        
        // 주사위바둑: 백돌 따내기 점수 업데이트
        if (state.mode === 'DICE' && expectedColor === 'black' && capturedStones.length > 0) {
            state.whiteStonesCaptured = (state.whiteStonesCaptured || 0) + capturedStones.length;
        }
        
        // 베이스바둑: 베이스돌 따내기 보너스 체크
        let baseStoneBonus = 0;
        if (state.mode === 'BASE' && state.baseStones && capturedStones.length > 0) {
            const opponentBaseStones = expectedColor === 'black' ? (state.baseStones.white || []) : (state.baseStones.black || []);
            capturedStones.forEach(captured => {
                if (opponentBaseStones.some(bs => bs.x === captured.x && bs.y === captured.y)) {
                    baseStoneBonus += 5; // 베이스돌 따낼 시 +5점 보너스
                }
            });
        }
        
        if (capturedStones.length > 0) {
            // Remove captured stones
            capturedStones.forEach(s => {
                boardAfterMove[s.y][s.x] = null;
            });
        } else {
            // Check for suicide (if no captures, check if the placed stone has liberties)
            if (!this.hasLiberties(boardAfterMove, move.x, move.y, expectedColor)) {
                throw new Error('Suicide move is not allowed');
            }
        }

        // Check for Ko rule
        if (this.isKo(state.moves, move.x, move.y, expectedColor, capturedStones)) {
            throw new Error('Ko rule violation');
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

        // 주사위바둑: 흑돌 배치 개수 업데이트
        if (state.mode === 'DICE' && expectedColor === 'black') {
            state.blackStonesPlaced = (state.blackStonesPlaced || 0) + 1;
        }
        
        // Update game state
        state.stones = boardAfterMove;
        state.currentColor = opponentColor;
        state.moveNumber = gameMove.moveNumber;
        if (expectedColor === 'black') {
            state.capturedBlack += capturedStones.length;
        } else {
            state.capturedWhite += capturedStones.length;
        }
        state.moves.push({
            x: move.x,
            y: move.y,
            color: expectedColor,
            isPass: false,
            moveNumber: gameMove.moveNumber,
            capturedCount: capturedStones.length
        });
        state.lastPass = false;

        // Check for mode-specific win conditions
        if (state.mode === 'CAPTURE') {
            // 입찰 단계가 완료되지 않았으면 게임 진행 불가
            if (state.biddingPhase) {
                throw new Error('입찰이 완료되지 않았습니다.');
            }
            
            // 동적 목표 개수 사용
            const WIN_CAPTURE_COUNT = state.finalCaptureTarget || state.captureTarget || 20;
            if (expectedColor === 'black' && state.capturedBlack >= WIN_CAPTURE_COUNT) {
                state.ended = true;
                await this.finishGame(gameId, 'black_win', state);
            } else if (expectedColor === 'white' && state.capturedWhite >= WIN_CAPTURE_COUNT) {
                state.ended = true;
                await this.finishGame(gameId, 'white_win', state);
            }
        } else if (state.mode === 'OMOK') {
            if (this.checkOmokWin(state.stones, move.x, move.y, expectedColor)) {
                state.ended = true;
                await this.finishGame(gameId, expectedColor === 'black' ? 'black_win' : 'white_win', state);
            }
        }

        await this.cacheGameState(gameId, state);

        return {
            x: move.x,
            y: move.y,
            color: expectedColor,
            isPass: false,
            moveNumber: gameMove.moveNumber,
            capturedStones: capturedStones,
            isGameOver: state.ended
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
        const isDoublePass = state.lastPass === true;

        const gameMove = await prisma.gameMove.create({
            data: {
                gameId,
                moveNumber: state.moveNumber + 1,
                color: color,
                isPass: true,
            },
        });

        state.currentColor = opponentColor;
        state.moveNumber = gameMove.moveNumber;
        state.moves.push({
            color: color,
            isPass: true,
            moveNumber: gameMove.moveNumber,
        });
        state.lastPass = true;

        if (isDoublePass) {
            state.ended = true;
            await this.endGame(gameId, state);
        }

        await this.cacheGameState(gameId, state);

        return {
            isPass: true,
            color: color,
            moveNumber: gameMove.moveNumber,
            isGameOver: isDoublePass
        };
    }

    async endGame(gameId, state) {
        // Simple territory calculation or call AI service for accurate scoring
        const aiService = require('./aiService');
        const score = await aiService.calculateScore(gameId);
        
        // 스피드바둑 시간 보너스 계산 (5초당 1집)
        if (state.mode === 'SPEED') {
            const timer = await timerService.getTimer(gameId);
            const TIME_BONUS_SECONDS_PER_POINT = 5;
            
            const blackTimeBonus = Math.floor((timer.blackTime || 0) / TIME_BONUS_SECONDS_PER_POINT);
            const whiteTimeBonus = Math.floor((timer.whiteTime || 0) / TIME_BONUS_SECONDS_PER_POINT);
            
            // 점수에 시간 보너스 추가
            score.areaScore.black = (score.areaScore.black || 0) + blackTimeBonus;
            score.areaScore.white = (score.areaScore.white || 0) + whiteTimeBonus;
            
            // scoreDetails에 시간 보너스 추가
            if (!score.scoreDetails) {
                score.scoreDetails = { black: {}, white: {} };
            }
            score.scoreDetails.black.timeBonus = blackTimeBonus;
            score.scoreDetails.white.timeBonus = whiteTimeBonus;
            
            // 총점 재계산
            score.areaScore.black = (score.areaScore.black || 0);
            score.areaScore.white = (score.areaScore.white || 0);
            
            // 승자 재결정
            score.winner = score.areaScore.black > score.areaScore.white ? 'black' : 
                          (score.areaScore.white > score.areaScore.black ? 'white' : 'draw');
        }
        
        const result = score.winner === 'black' ? 'black_win' : 'white_win';
        
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

        return { result, score, rewards };
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

    isKo(moves, x, y, color, capturedCount) {
        if (capturedCount !== 1) return false;
        if (moves.length < 2) return false;

        const lastMove = moves[moves.length - 1];
        const prevMove = moves[moves.length - 2];

        // Ko occurs when:
        // 1. Current move captures exactly 1 stone
        // 2. Last move captured exactly 1 stone
        // 3. Current move is at the position of the stone captured by the last move
        // 4. Last move was at the position of the stone captured by the current move
        
        if (lastMove.capturedCount === 1 && prevMove.x === x && prevMove.y === y) {
            // This is a simplified Ko check, for full accuracy we'd compare full board states
            // but for Go it's usually enough.
            return true;
        }
        return false;
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
}

module.exports = new GameService();

