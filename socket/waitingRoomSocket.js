const { getRedisClient, getPubClient, getSubClient } = require('../config/redis');
const userService = require('../services/userService');

class WaitingRoomSocket {
    constructor(io) {
        this.io = io;
        this.onlineUsers = new Map(); // userId -> socketId
        this.strategyRoomUsers = new Map(); // userId -> socketId (전략바둑 대기실)
        this.casualRoomUsers = new Map(); // userId -> socketId (놀이바둑 대기실)
        this.userRoomType = new Map(); // userId -> 'strategy' | 'casual'
        this.setupRedisPubSub().catch(console.error);
        
        // 주기적으로 진행중인 게임 목록 업데이트 (30초마다)
        // 무한 루프 방지를 위한 플래그
        this.isUpdatingOngoingGames = false;
        setInterval(async () => {
            if (this.isUpdatingOngoingGames) {
                console.log('Skipping ongoing games update - already in progress');
                return;
            }
            try {
                this.isUpdatingOngoingGames = true;
                const games = await this.getOngoingGames();
                this.io.to('waiting-room-strategy').emit('ongoing_games_update', games);
                this.io.to('waiting-room-casual').emit('ongoing_games_update', games);
            } catch (error) {
                console.error('Error in periodic ongoing games update:', error);
            } finally {
                this.isUpdatingOngoingGames = false;
            }
        }, 30000);
    }

    async setupRedisPubSub() {
        try {
            const subClient = getSubClient();
            if (!subClient) {
                console.log('Redis not available, using in-memory pub/sub');
                return;
            }
            
            // Subscribe to user events
            await subClient.subscribe('user:joined');
            await subClient.subscribe('user:left');
            await subClient.subscribe('user:status_changed');
            
            // Handle messages
            subClient.on('message', (channel, message) => {
                try {
                    const data = JSON.parse(message);
                    
                    if (channel === 'user:joined') {
                        this.broadcastUserJoined(data);
                    } else if (channel === 'user:left') {
                        this.broadcastUserLeft(data);
                    } else if (channel === 'user:status_changed') {
                        this.broadcastUserStatusChanged(data);
                    }
                } catch (error) {
                    console.error('Error processing pub/sub message:', error);
                }
            });
        } catch (error) {
            console.error('Redis Pub/Sub setup error:', error);
            console.log('Continuing without Redis Pub/Sub');
        }
    }

    handleConnection(socket, userId) {
        // Add user to online list
        this.onlineUsers.set(userId, socket.id);
        
        // Default room type to strategy
        this.userRoomType.set(userId, 'strategy');
        
        // Update user status in Redis
        this.updateUserStatus(userId, 'waiting');

        // Broadcast user joined (fire-and-forget, errors handled internally)
        this.publishUserJoined(userId).catch(err => {
            console.error('Error in publishUserJoined:', err);
        });

        // Handle room join
        socket.on('join_waiting_room', (roomType) => {
            console.log('[Server] User joining room:', userId, roomType);
            const finalRoomType = roomType || 'strategy';
            this.userRoomType.set(userId, finalRoomType);
            // 실제로 소켓 룸에 조인
            const roomName = `waiting-room-${finalRoomType}`;
            socket.join(roomName);
            console.log('[Server] User', userId, 'joined room:', roomName, 'socket.id:', socket.id);
            
            // 조인 확인을 위해 클라이언트에 알림
            socket.emit('room_joined', { roomType: finalRoomType });
        });

        // Send current user list
        socket.on('get_user_list', async (roomType) => {
            try {
                console.log('get_user_list called with roomType:', roomType);
                const users = await this.getOnlineUsers(roomType);
                console.log('Sending user_list_update with', users.length, 'users');
                socket.emit('user_list_update', users);
            } catch (error) {
                console.error('Error in get_user_list handler:', error);
                // 오류 발생 시 빈 배열 전송
                socket.emit('user_list_update', []);
            }
        });

        // Get ongoing games
        socket.on('get_ongoing_games', async () => {
            // 무한 루프 방지
            if (this.isUpdatingOngoingGames) {
                console.log('Skipping get_ongoing_games - already updating');
                return;
            }
            try {
                this.isUpdatingOngoingGames = true;
                const games = await this.getOngoingGames();
                socket.emit('ongoing_games_update', games);
            } catch (error) {
                console.error('Error getting ongoing games:', error);
            } finally {
                this.isUpdatingOngoingGames = false;
            }
        });

        // 주기적 업데이트는 생성자에서만 수행 (중복 방지)

        // Get game by room number
        socket.on('get_game_by_room_number', async (data, callback) => {
            try {
                const { roomNumber } = data;
                if (!roomNumber) {
                    return callback({ success: false, error: 'Room number required' });
                }
                
                // 방번호를 숫자로 변환 (문자열이면 숫자 추출)
                const roomNum = typeof roomNumber === 'string' 
                    ? parseInt(roomNumber.replace(/[^0-9]/g, '')) 
                    : parseInt(roomNumber);
                
                if (isNaN(roomNum) || roomNum < 1 || roomNum > 5) {
                    return callback({ success: false, error: 'Invalid room number (1-5)' });
                }
                
                // 현재 진행중인 게임 목록 가져오기
                const games = await this.getOngoingGames();
                
                // 방번호에 해당하는 게임 찾기 (1-based index)
                if (games.length >= roomNum) {
                    const game = games[roomNum - 1];
                    if (game && !game.isDemo) {
                        return callback({ success: true, gameId: game.id });
                    }
                }
                
                // 게임을 찾지 못한 경우
                return callback({ success: false, error: 'Game not found' });
            } catch (error) {
                console.error('Error getting game by room number:', error);
                return callback({ success: false, error: 'Internal server error' });
            }
        });

        // Get rankings
        socket.on('get_rankings', async () => {
            try {
                console.log('get_rankings called');
                const rankings = await this.getRankings();
                console.log('Sending rankings_update with', rankings.length, 'rankings');
                socket.emit('rankings_update', rankings);
            } catch (error) {
                console.error('Error in get_rankings handler:', error);
                // 오류 발생 시 데모 데이터 전송
                const demoRankings = [
                    { rank: 1, nickname: '바둑마스터', rating: 2500, wins: 150, losses: 20, draws: 5, isDemo: true },
                    { rank: 2, nickname: '전략의신', rating: 2400, wins: 120, losses: 30, draws: 10, isDemo: true },
                    { rank: 3, nickname: '명수왕', rating: 2300, wins: 100, losses: 40, draws: 15, isDemo: true },
                    { rank: 4, nickname: '고수킹', rating: 2200, wins: 80, losses: 50, draws: 20, isDemo: true },
                    { rank: 5, nickname: '바둑천재', rating: 2100, wins: 60, losses: 60, draws: 25, isDemo: true }
                ];
                socket.emit('rankings_update', demoRankings);
            }
        });

        // Get user game statistics by mode
        socket.on('get_user_game_stats', async (data) => {
            try {
                const { userId, mode } = data;
                if (!userId || !mode) {
                    socket.emit('user_game_stats', { error: 'Invalid parameters' });
                    return;
                }

                const prisma = require('../config/database');
                
                // 해당 모드의 게임만 필터링
                const games = await prisma.game.findMany({
                    where: {
                        OR: [
                            { blackId: userId },
                            { whiteId: userId }
                        ],
                        mode: mode,
                        result: { not: null },
                        isAiGame: false
                    }
                });

                // 승/패 계산
                const wins = games.filter(game => {
                    if (game.blackId === userId) return game.result === 'black_win';
                    if (game.whiteId === userId) return game.result === 'white_win';
                    return false;
                }).length;

                const losses = games.filter(game => {
                    if (game.blackId === userId) return game.result === 'white_win';
                    if (game.whiteId === userId) return game.result === 'black_win';
                    return false;
                }).length;

                socket.emit('user_game_stats', {
                    userId: userId,
                    mode: mode,
                    wins: wins,
                    losses: losses
                });
            } catch (error) {
                console.error('Error getting user game stats:', error);
                socket.emit('user_game_stats', { error: 'Failed to get stats' });
            }
        });

        // Handle chat messages
        socket.on('chat_message', async (data) => {
            try {
                console.log('Chat message received from user:', userId, 'Message:', data.message);
                
                // Validate message
                if (!data || !data.message || typeof data.message !== 'string') {
                    console.error('Invalid chat message data:', data);
                    socket.emit('chat_error', { error: 'Invalid message format' });
                    return;
                }
                
                // Trim and validate message length
                const message = data.message.trim();
                if (message.length === 0) {
                    socket.emit('chat_error', { error: 'Message cannot be empty' });
                    return;
                }
                if (message.length > 200) {
                    socket.emit('chat_error', { error: 'Message too long (max 200 characters)' });
                    return;
                }
                
                // Get user profile to ensure we have the correct nickname
                const profile = await userService.getUserProfile(userId);
                const nickname = profile ? profile.nickname : data.user || 'Unknown';
                
                // Get user's current room type
                const roomType = this.userRoomType.get(userId) || 'strategy';
                
                const chatData = {
                    user: nickname,
                    message: message,
                    timestamp: data.timestamp || Date.now(),
                    roomType: roomType
                };
                
                console.log('Broadcasting chat message:', chatData);
                
                // Broadcast to all users in the specific waiting room
                const targetRoom = `waiting-room-${roomType}`;
                this.io.to(targetRoom).emit('chat_message', chatData);
            } catch (error) {
                console.error('Error handling chat message:', error);
                // Fallback to using the provided user name
                const roomType = this.userRoomType.get(userId) || 'strategy';
                const chatData = {
                    user: data.user || 'Unknown',
                    message: data.message || '',
                    timestamp: data.timestamp || Date.now(),
                    roomType: roomType
                };
                const targetRoom = `waiting-room-${roomType}`;
                this.io.to(targetRoom).emit('chat_message', chatData);
            }
        });

        // Handle status change
        socket.on('change_status', async (data) => {
            const { status } = data;
            // Only allow waiting or resting status changes from client
            if (status === 'waiting' || status === 'resting') {
                await this.updateUserStatus(userId, status);
                this.publishUserStatusChanged(userId, status).catch(err => {
                    console.error('Error in publishUserStatusChanged:', err);
                });
                socket.emit('status_changed', { userId, status });
            }
        });

        // Handle matching
        socket.on('start_matching', async (data) => {
            // Check if user can start matching (not in-game, not resting, not spectating)
            const currentStatus = await this.getUserStatus(userId);
            if (currentStatus === 'in-game' || currentStatus === 'resting' || currentStatus === 'spectating') {
                socket.emit('matching_error', { 
                    error: '대국 중이거나 휴식 중일 때는 매칭을 시작할 수 없습니다.' 
                });
                return;
            }
            const roomType = data?.roomType || this.userRoomType.get(userId) || 'strategy';
            await this.startMatching(userId, socket, roomType);
        });

        socket.on('cancel_matching', async () => {
            await this.cancelMatching(userId);
        });

        // Handle AI game
        socket.on('start_ai_game', async (data) => {
            console.log('[WaitingRoomSocket] start_ai_game received:', {
                boardSize: data.boardSize,
                timeLimit: data.timeLimit,
                byoyomiSeconds: data.byoyomiSeconds,
                byoyomiPeriods: data.byoyomiPeriods,
                mode: data.mode,
                level: data.level,
                color: data.color,
                captureTarget: data.captureTarget,
                captureTargetType: typeof data.captureTarget
            });
            
            // 놀이바둑 모드 목록
            const casualModes = ['DICE', 'COPS', 'OMOK', 'TTAK', 'ALKKAGI', 'CURLING'];
            const isCasualMode = casualModes.includes(data.mode);
            
            // 놀이바둑일 때는 level을 null로 전달 (단일 AI봇 사용)
            const aiLevel = isCasualMode ? null : (data.level || 1);
            
            // captureTarget 처리: 명시적으로 숫자로 변환
            let captureTarget = 20; // 기본값
            if (data.captureTarget !== undefined && data.captureTarget !== null) {
                const parsed = parseInt(data.captureTarget);
                if (!isNaN(parsed) && parsed > 0) {
                    captureTarget = parsed;
                }
            }
            
            const gameOptions = {
                mode: data.mode,
                komi: data.komi,
                isCasualMode: isCasualMode,
                captureTarget: captureTarget,
                timeLimit: data.timeLimit,
                timeIncrement: data.timeIncrement,
                baseStones: data.baseStones,
                hiddenStones: data.hiddenStones,
                scanCount: data.scanCount,
                missileMoveLimit: data.missileMoveLimit,
                boardSize: data.boardSize !== undefined && data.boardSize !== null ? parseInt(data.boardSize) : undefined,
                byoyomiSeconds: data.byoyomiSeconds,
                byoyomiPeriods: data.byoyomiPeriods,
                autoScoringMove: data.autoScoringMove !== undefined && data.autoScoringMove !== null ? parseInt(data.autoScoringMove) : undefined
            };
            
            console.log('[WaitingRoomSocket] start_ai_game gameOptions:', JSON.stringify(gameOptions, null, 2));
            
            console.log('[WaitingRoomSocket] Calling startAiGame with options:', JSON.stringify(gameOptions, null, 2));
            console.log('[WaitingRoomSocket] captureTarget details:', {
                dataCaptureTarget: data.captureTarget,
                dataType: typeof data.captureTarget,
                finalCaptureTarget: gameOptions.captureTarget,
                finalType: typeof gameOptions.captureTarget
            });
            
            await this.startAiGame(userId, socket, aiLevel, data.color, gameOptions);
        });

        // Handle PVP Game Request
        socket.on('send_game_request', async (data) => {
            try {
                const { targetUserId, mode, komi, captureTarget, timeLimit, timeIncrement, baseStones, hiddenStones, scanCount, missileMoveLimit, boardSize, byoyomiSeconds, byoyomiPeriods, mixRules, mixModes, mixModeSwitchCount, mixCaptureTarget, mixTimeLimit, mixTimeIncrement, mixBaseCount, mixHiddenCount, mixScanCount, mixMissileMoveLimit, maxRounds, stonesPerRound, maxMoves } = data;
                const targetSocketId = this.onlineUsers.get(targetUserId);
                
                if (!targetSocketId) {
                    return socket.emit('game_request_error', { error: '유저가 오프라인 상태입니다.' });
                }

                const senderProfile = await userService.getUserProfile(userId);
                
                this.io.to(targetSocketId).emit('game_request_received', {
                    fromUserId: userId,
                    fromNickname: senderProfile.nickname,
                    mode,
                    komi,
                    captureTarget,
                    timeLimit,
                    timeIncrement,
                    baseStones,
                    hiddenStones,
                    scanCount,
                    missileMoveLimit,
                    boardSize,
                    byoyomiSeconds,
                    byoyomiPeriods,
                    mixRules,
                    mixModes,
                    mixModeSwitchCount,
                    mixCaptureTarget,
                    mixTimeLimit,
                    mixTimeIncrement,
                    mixBaseCount,
                    mixHiddenCount,
                    mixScanCount,
                    mixMissileMoveLimit,
                    maxRounds,
                    stonesPerRound
                });
            } catch (error) {
                console.error('Send game request error:', error);
                socket.emit('game_request_error', { error: '대국 신청 중 오류가 발생했습니다.' });
            }
        });

        socket.on('accept_game_request', async (data) => {
            try {
                const { fromUserId, mode, komi, captureTarget, timeLimit, timeIncrement, baseStones, hiddenStones, scanCount, missileMoveLimit, boardSize, byoyomiSeconds, byoyomiPeriods, mixRules, mixModes, mixModeSwitchCount, mixCaptureTarget, mixTimeLimit, mixTimeIncrement, mixBaseCount, mixHiddenCount, mixScanCount, mixMissileMoveLimit, maxRounds, stonesPerRound, maxMoves } = data;
                const fromSocketId = this.onlineUsers.get(fromUserId);

                if (!fromSocketId) {
                    return socket.emit('game_request_error', { error: '상대방이 오프라인 상태입니다.' });
                }

                const gameService = require('../services/gameService');
                // Friendly match (matchType: FRIENDLY)
                const gameOptions = {
                    matchType: 'FRIENDLY',
                    mode: mode || 'CLASSIC',
                    komi: komi !== undefined && komi !== null ? komi : 6.5,
                    boardSize: boardSize || 19
                };
                
                // 따내기바둑 설정 추가
                if (mode === 'CAPTURE' && captureTarget) {
                    gameOptions.captureTarget = captureTarget;
                }
                // 스피드바둑 설정 추가
                if (mode === 'SPEED' && timeLimit) {
                    gameOptions.timeLimit = timeLimit;
                    gameOptions.timeIncrement = timeIncrement;
                }
                // 베이스바둑 설정 추가
                if (mode === 'BASE') {
                    // baseStones가 제공되었으면 사용, 없으면 기본값 4
                    if (baseStones !== undefined && baseStones !== null && baseStones !== '') {
                        const parsed = parseInt(baseStones);
                        if (!isNaN(parsed) && parsed > 0) {
                            gameOptions.baseStones = parsed;
                        } else {
                            gameOptions.baseStones = 4; // 기본값
                        }
                    } else {
                        gameOptions.baseStones = 4; // 기본값
                    }
                    gameOptions.komi = 0.5; // 베이스바둑은 덤 0.5집 고정
                }
                // 히든바둑 설정 추가
                if (mode === 'HIDDEN' && hiddenStones) {
                    gameOptions.hiddenStones = hiddenStones;
                    gameOptions.scanCount = scanCount || 3;
                }
                // 미사일바둑 설정 추가
                if (mode === 'MISSILE' && missileMoveLimit) {
                    gameOptions.missileMoveLimit = missileMoveLimit;
                }
                // 믹스바둑 설정 추가
                if (mode === 'MIX') {
                    // mixRules 또는 mixModes를 mixModes로 변환
                    if (mixRules && Array.isArray(mixRules) && mixRules.length >= 2) {
                        gameOptions.mixModes = mixRules;
                    } else if (mixModes && Array.isArray(mixModes) && mixModes.length >= 2) {
                        gameOptions.mixModes = mixModes;
                    }
                    if (mixModeSwitchCount) {
                        gameOptions.mixModeSwitchCount = mixModeSwitchCount;
                    }
                    // 믹스바둑 세부 설정
                    if (mixCaptureTarget) gameOptions.mixCaptureTarget = mixCaptureTarget;
                    if (mixTimeLimit) gameOptions.mixTimeLimit = mixTimeLimit;
                    if (mixTimeIncrement) gameOptions.mixTimeIncrement = mixTimeIncrement;
                    if (mixBaseCount) gameOptions.mixBaseCount = mixBaseCount;
                    if (mixHiddenCount) gameOptions.mixHiddenCount = mixHiddenCount;
                    if (mixScanCount) gameOptions.mixScanCount = mixScanCount;
                    if (mixMissileMoveLimit) gameOptions.mixMissileMoveLimit = mixMissileMoveLimit;
                }
                // 놀이바둑 모드별 설정 추가
                if (mode === 'DICE' && maxRounds) {
                    gameOptions.maxRounds = maxRounds;
                }
                if (mode === 'COPS' && maxRounds) {
                    gameOptions.maxRounds = maxRounds;
                }
                if (mode === 'TTAK' && captureTarget) {
                    gameOptions.captureTarget = captureTarget;
                }
                if (mode === 'ALKKAGI') {
                    if (maxRounds) gameOptions.maxRounds = maxRounds;
                    if (stonesPerRound) gameOptions.stonesPerRound = stonesPerRound;
                }
                if (mode === 'CURLING' && stonesPerRound) {
                    gameOptions.stonesPerRound = stonesPerRound;
                }
                // 시간 설정 추가 (전략바둑 모드에만 적용, 놀이바둑은 시간 제한 없음)
                const casualModes = ['DICE', 'COPS', 'OMOK', 'TTAK', 'ALKKAGI', 'CURLING'];
                if (!casualModes.includes(mode)) {
                    if (timeLimit !== undefined && timeLimit !== null) {
                        gameOptions.timeLimit = timeLimit;
                    }
                    if (timeIncrement !== undefined && timeIncrement !== null) {
                        gameOptions.timeIncrement = timeIncrement;
                    }
                    if (byoyomiSeconds !== undefined && byoyomiSeconds !== null) {
                        gameOptions.byoyomiSeconds = byoyomiSeconds;
                    }
                    if (byoyomiPeriods !== undefined && byoyomiPeriods !== null) {
                        gameOptions.byoyomiPeriods = byoyomiPeriods;
                    }
                }
                
                // boardSize 추가 확인
                if (boardSize !== undefined && boardSize !== null) {
                    gameOptions.boardSize = parseInt(boardSize);
                }
                
                // 클래식 바둑: 제한 턴수 설정 추가
                if (mode === 'CLASSIC' && maxMoves !== undefined && maxMoves !== null && maxMoves !== '') {
                    const parsed = parseInt(maxMoves);
                    if (!isNaN(parsed) && parsed > 0) {
                        gameOptions.maxMoves = parsed;
                    }
                }
                
                console.log('Creating game with options:', JSON.stringify(gameOptions, null, 2));
                const game = await gameService.createGame(fromUserId, userId, 0, 0, gameOptions);

                if (!game || !game.id) {
                    throw new Error('Failed to create game');
                }
                
                console.log('Game created:', {
                    id: game.id,
                    mode: game.mode,
                    komi: game.komi,
                    boardSize: gameOptions.boardSize
                });

                await this.setUserInGame(userId);
                await this.setUserInGame(fromUserId);

                const gameData = { gameId: game.id };
                console.log('[WaitingRoomSocket] Emitting game_started to users:', { 
                    userId, 
                    fromUserId, 
                    gameId: game.id,
                    socketId: socket.id,
                    fromSocketId: fromSocketId
                });
                
                // 수락한 사용자에게 전송
                socket.emit('game_started', gameData);
                console.log('[WaitingRoomSocket] game_started emitted to socket:', socket.id);
                
                // 신청한 사용자에게 전송
                if (fromSocketId) {
                    this.io.to(fromSocketId).emit('game_started', gameData);
                    console.log('[WaitingRoomSocket] game_started emitted to fromSocketId:', fromSocketId);
                } else {
                    console.warn('[WaitingRoomSocket] fromSocketId not found, cannot emit game_started to requester');
                }
            } catch (error) {
                console.error('Accept game request error:', error);
                socket.emit('game_request_error', { error: '대국 수락 중 오류가 발생했습니다.' });
            }
        });

        socket.on('reject_game_request', (data) => {
            const { fromUserId } = data;
            const fromSocketId = this.onlineUsers.get(fromUserId);
            if (fromSocketId) {
                this.io.to(fromSocketId).emit('game_request_rejected', { message: '상대방이 대국 신청을 거절했습니다.' });
            }
        });

        // 수정제안 처리
        socket.on('modify_game_request', async (data) => {
            try {
                const { targetUserId, mode, komi, captureTarget, timeLimit, timeIncrement, baseStones, hiddenStones, scanCount, missileMoveLimit, boardSize, byoyomiSeconds, byoyomiPeriods, mixRules, mixCaptureTarget, mixTimeLimit, mixTimeIncrement, mixBaseCount, mixHiddenCount, mixScanCount, mixMissileMoveLimit, maxRounds, stonesPerRound } = data;
                const targetSocketId = this.onlineUsers.get(targetUserId);
                
                if (!targetSocketId) {
                    return socket.emit('game_request_error', { error: '유저가 오프라인 상태입니다.' });
                }

                const senderProfile = await userService.getUserProfile(userId);
                
                // 수정된 신청서를 상대방에게 전송
                this.io.to(targetSocketId).emit('game_request_modified', {
                    fromUserId: userId,
                    fromNickname: senderProfile.nickname,
                    fromRating: senderProfile.rating,
                    mode,
                    komi,
                    captureTarget,
                    timeLimit,
                    timeIncrement,
                    baseStones,
                    hiddenStones,
                    scanCount,
                    missileMoveLimit,
                    boardSize,
                    byoyomiSeconds,
                    byoyomiPeriods,
                    mixRules,
                    mixCaptureTarget,
                    mixTimeLimit,
                    mixTimeIncrement,
                    mixBaseCount,
                    mixHiddenCount,
                    mixScanCount,
                    mixMissileMoveLimit,
                    maxRounds,
                    stonesPerRound
                });
            } catch (error) {
                console.error('Modify game request error:', error);
                socket.emit('game_request_error', { error: '수정제안 중 오류가 발생했습니다.' });
            }
        });


        // Handle disconnect
        socket.on('disconnect', () => {
            this.handleDisconnect(userId);
        });
    }

    async getOnlineUsers(roomType) {
        try {
            console.log('getOnlineUsers called with roomType:', roomType);
            const userIds = Array.from(this.onlineUsers.keys());
            console.log('Online user IDs:', userIds);
            const userStatusMap = new Map(); // In-memory status storage
            
            // Try to get status from Redis, fallback to in-memory
            const redis = getRedisClient();
            console.log('getOnlineUsers: Redis client status:', redis ? 'available' : 'not available');
            if (redis) {
                try {
                    console.log('getOnlineUsers: fetching statuses from Redis');
                    // Redis 작업에 타임아웃 추가 (2초)
                    const statusPromises = userIds.map(async (userId) => {
                        try {
                            const status = await Promise.race([
                                redis.get(`user:status:${userId}`),
                                new Promise((_, reject) => 
                                    setTimeout(() => reject(new Error('Redis timeout')), 2000)
                                )
                            ]);
                            return { userId, status: status || 'waiting' };
                        } catch (error) {
                            console.log(`getOnlineUsers: Redis get failed for user ${userId}, using default status`);
                            return { userId, status: 'waiting' };
                        }
                    });
                    const statuses = await Promise.all(statusPromises);
                    statuses.forEach(({ userId, status }) => {
                        userStatusMap.set(userId, status);
                    });
                    console.log('getOnlineUsers: Redis statuses fetched');
                } catch (error) {
                    console.error('Redis status fetch error:', error);
                    // Redis 실패 시 기본 상태 사용
                }
            }
            
            // If Redis is not available, use default status
            console.log('getOnlineUsers: setting default statuses');
            userIds.forEach(userId => {
                if (!userStatusMap.has(userId)) {
                    userStatusMap.set(userId, 'waiting');
                }
            });
            console.log('getOnlineUsers: default statuses set');
            
            let users = [];
            console.log('getOnlineUsers: checking userIds.length:', userIds.length);
            if (userIds.length > 0) {
                console.log('getOnlineUsers: fetching profiles for', userIds.length, 'users');
                try {
                    users = await Promise.race([
                        Promise.all(
                            userIds.map(async (userId) => {
                                try {
                                    console.log('getOnlineUsers: fetching profile for user', userId);
                                    const profile = await userService.getUserProfile(userId);
                                    console.log('getOnlineUsers: profile fetched for user', userId, profile ? 'found' : 'not found');
                                    if (!profile) return null;
                                    
                                    // Filter by room type if specified
                                    const userRoomType = this.userRoomType.get(userId) || 'strategy';
                                    if (roomType && userRoomType !== roomType) {
                                        console.log('getOnlineUsers: filtering out user', userId, 'from room', userRoomType);
                                        return null; // Filter out users from different room
                                    }
                                    
                                    return {
                                        id: profile.id,
                                        nickname: profile.nickname,
                                        rating: profile.rating,
                                        status: userStatusMap.get(userId) || 'waiting',
                                        manner: profile.mannerScore || 1500
                                    };
                                } catch (error) {
                                    console.error(`Error fetching profile for user ${userId}:`, error);
                                    return null;
                                }
                            })
                        ),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('getUserProfile timeout')), 10000)
                        )
                    ]);
                    console.log('getOnlineUsers: all profiles fetched');
                } catch (error) {
                    console.error('getOnlineUsers: error fetching profiles:', error);
                    users = [];
                }
            }

            const realUsers = users.filter(u => u !== null);
            console.log('Real users found:', realUsers.length);
            
            // 데모 데이터 추가 (항상 5명이 되도록)
            const demoUsers = [];
            const demoNicknames = [
                { nickname: '바둑고수', rating: 2500, manner: 1600 },
                { nickname: '전략의신', rating: 2400, manner: 1550 },
                { nickname: '명수왕', rating: 2300, manner: 1500 },
                { nickname: '고수킹', rating: 2200, manner: 1450 },
                { nickname: '바둑천재', rating: 2100, manner: 1400 }
            ];
            
            // 항상 5명이 되도록 데모 데이터 추가
            const needed = Math.max(0, 5 - realUsers.length);
            console.log('Adding', needed, 'demo users');
            for (let i = 0; i < needed; i++) {
                const demoUser = demoNicknames[i % demoNicknames.length];
                demoUsers.push({
                    id: `demo-user-${i}`,
                    nickname: demoUser.nickname,
                    rating: demoUser.rating,
                    manner: demoUser.manner,
                    status: ['waiting', 'resting', 'matching'][Math.floor(Math.random() * 3)],
                    isDemo: true
                });
            }

            // 실제 유저와 데모 유저 합치기
            const allUsers = [...realUsers, ...demoUsers];
            console.log('getOnlineUsers returning:', allUsers.length, 'users for roomType:', roomType);
            return allUsers;
        } catch (error) {
            console.error('Error in getOnlineUsers:', error);
            // 오류 발생 시 데모 데이터만 반환
            const demoUsers = [
                { id: 'demo-user-0', nickname: '바둑고수', rating: 2500, manner: 1600, status: 'waiting', isDemo: true },
                { id: 'demo-user-1', nickname: '전략의신', rating: 2400, manner: 1550, status: 'waiting', isDemo: true },
                { id: 'demo-user-2', nickname: '명수왕', rating: 2300, manner: 1500, status: 'waiting', isDemo: true },
                { id: 'demo-user-3', nickname: '고수킹', rating: 2200, manner: 1450, status: 'waiting', isDemo: true },
                { id: 'demo-user-4', nickname: '바둑천재', rating: 2100, manner: 1400, status: 'waiting', isDemo: true }
            ];
            return demoUsers;
        }
    }

    async updateUserStatus(userId, status) {
        const redis = getRedisClient();
        if (redis) {
            try {
                await redis.setEx(`user:status:${userId}`, 3600, status); // 1 hour TTL
            } catch (error) {
                console.error('Redis status update error:', error);
            }
        }
        // Status is also tracked in memory via onlineUsers map
    }

    async getUserStatus(userId) {
        const redis = getRedisClient();
        if (redis) {
            try {
                const status = await redis.get(`user:status:${userId}`);
                return status || 'waiting';
            } catch (error) {
                console.error('Redis status get error:', error);
            }
        }
        return 'waiting';
    }

    // 게임 시작 시 상태를 'in-game'으로 변경
    async setUserInGame(userId) {
        await this.updateUserStatus(userId, 'in-game');
        this.publishUserStatusChanged(userId, 'in-game');
    }

    // 관전 시작 시 상태를 'spectating'으로 변경
    async setUserSpectating(userId) {
        await this.updateUserStatus(userId, 'spectating');
        this.publishUserStatusChanged(userId, 'spectating');
    }

    // 게임 종료 시 상태를 'waiting'으로 변경
    async setUserWaiting(userId) {
        await this.updateUserStatus(userId, 'waiting');
        this.publishUserStatusChanged(userId, 'waiting');
    }

    async publishUserJoined(userId) {
        try {
            const pubClient = getPubClient();
            if (pubClient) {
                try {
                    // Redis v4의 publish는 Promise를 반환하므로 await 사용
                    await pubClient.publish('user:joined', JSON.stringify({ userId, timestamp: Date.now() }));
                } catch (redisError) {
                    // Redis 오류 발생 시 fallback (클라이언트가 닫혀있을 수 있음)
                    if (redisError.name === 'ClientClosedError' || redisError.message?.includes('closed')) {
                        console.log('Redis client closed, using fallback');
                    } else {
                        console.error('Redis publish error:', redisError);
                    }
                    this.broadcastUserJoined({ userId, timestamp: Date.now() });
                }
            } else {
                // If Redis is not available, broadcast directly
                this.broadcastUserJoined({ userId, timestamp: Date.now() });
            }
        } catch (error) {
            console.error('Error publishing user joined:', error);
            // Fallback to direct broadcast
            this.broadcastUserJoined({ userId, timestamp: Date.now() });
        }
    }

    async publishUserLeft(userId) {
        try {
            const pubClient = getPubClient();
            if (pubClient) {
                try {
                    // Redis v4의 publish는 Promise를 반환하므로 await 사용
                    await pubClient.publish('user:left', JSON.stringify({ userId, timestamp: Date.now() }));
                } catch (redisError) {
                    // Redis 오류 발생 시 fallback (클라이언트가 닫혀있을 수 있음)
                    if (redisError.name === 'ClientClosedError' || redisError.message?.includes('closed')) {
                        console.log('Redis client closed, using fallback');
                    } else {
                        console.error('Redis publish error:', redisError);
                    }
                    this.broadcastUserLeft({ userId, timestamp: Date.now() });
                }
            } else {
                this.broadcastUserLeft({ userId, timestamp: Date.now() });
            }
        } catch (error) {
            console.error('Error publishing user left:', error);
            this.broadcastUserLeft({ userId, timestamp: Date.now() });
        }
    }

    async publishUserStatusChanged(userId, status) {
        try {
            const pubClient = getPubClient();
            if (pubClient) {
                try {
                    // Redis v4의 publish는 Promise를 반환하므로 await 사용
                    await pubClient.publish('user:status_changed', JSON.stringify({ userId, status, timestamp: Date.now() }));
                } catch (redisError) {
                    // Redis 오류 발생 시 fallback (클라이언트가 닫혀있을 수 있음)
                    if (redisError.name === 'ClientClosedError' || redisError.message?.includes('closed')) {
                        console.log('Redis client closed, using fallback');
                    } else {
                        console.error('Redis publish error:', redisError);
                    }
                    this.broadcastUserStatusChanged({ userId, status, timestamp: Date.now() });
                }
            } else {
                this.broadcastUserStatusChanged({ userId, status, timestamp: Date.now() });
            }
        } catch (error) {
            console.error('Error publishing status changed:', error);
            this.broadcastUserStatusChanged({ userId, status, timestamp: Date.now() });
        }
    }

    broadcastUserJoined(data) {
        const roomType = data.roomType || 'strategy';
        this.io.to(`waiting-room-${roomType}`).emit('user_joined', data);
        // Update all clients in the room with new user list
        this.broadcastUserListUpdate(roomType);
    }

    broadcastUserLeft(data) {
        const roomType = data.roomType || 'strategy';
        this.io.to(`waiting-room-${roomType}`).emit('user_left', data);
        this.broadcastUserListUpdate(roomType);
    }

    broadcastUserStatusChanged(data) {
        this.io.emit('user_status_changed', data);
        this.broadcastUserListUpdate();
    }

    async broadcastUserListUpdate(roomType = 'strategy') {
        const users = await this.getOnlineUsers(roomType);
        this.io.to(`waiting-room-${roomType}`).emit('user_list_update', users);
    }

    async startMatching(userId, socket, roomType = 'strategy') {
        const rankingService = require('../services/rankingService');
        await this.updateUserStatus(userId, 'matching');
        this.publishUserStatusChanged(userId, 'matching');
        
        // Add to matching queue with room type
        await rankingService.addToMatchingQueue(userId, roomType);
    }

    async cancelMatching(userId) {
        const rankingService = require('../services/rankingService');
        await this.updateUserStatus(userId, 'waiting');
        this.publishUserStatusChanged(userId, 'waiting');
        
        // Remove from matching queue
        await rankingService.removeFromMatchingQueue(userId);
    }

    async startAiGame(userId, socket, level, color, options = {}) {
        try {
            console.log('[WaitingRoomSocket] startAiGame called with:', {
                level,
                color,
                options: {
                    boardSize: options.boardSize,
                    timeLimit: options.timeLimit,
                    byoyomiSeconds: options.byoyomiSeconds,
                    byoyomiPeriods: options.byoyomiPeriods,
                    mode: options.mode
                }
            });
            
            const gameService = require('../services/gameService');
            // captureTarget 처리: 명시적으로 숫자로 변환
            let captureTarget = 20; // 기본값
            if (options.captureTarget !== undefined && options.captureTarget !== null) {
                const parsed = parseInt(options.captureTarget);
                if (!isNaN(parsed) && parsed > 0) {
                    captureTarget = parsed;
                }
            }
            
            console.log('[WaitingRoomSocket] startAiGame - captureTarget processing:', {
                optionsCaptureTarget: options.captureTarget,
                optionsType: typeof options.captureTarget,
                finalCaptureTarget: captureTarget,
                finalType: typeof captureTarget
            });
            
            const gameOptions = {
                mode: options.mode || 'CLASSIC',
                komi: options.komi || 6.5,
                isCasualMode: options.isCasualMode || false,
                captureTarget: captureTarget,
                timeLimit: options.timeLimit !== undefined && options.timeLimit !== null ? options.timeLimit : undefined,
                timeIncrement: options.timeIncrement !== undefined && options.timeIncrement !== null ? options.timeIncrement : undefined,
                baseStones: (() => {
                    if (options.baseStones === undefined || options.baseStones === null || options.baseStones === '') {
                        console.log('[WaitingRoomSocket] baseStones is undefined/null/empty, using default 4');
                        return 4;
                    }
                    const parsed = parseInt(String(options.baseStones));
                    if (isNaN(parsed) || parsed <= 0) {
                        console.log('[WaitingRoomSocket] baseStones parse failed:', options.baseStones, 'parsed:', parsed, 'using default 4');
                        return 4;
                    }
                    console.log('[WaitingRoomSocket] baseStones parsed successfully:', options.baseStones, '->', parsed);
                    return parsed;
                })(),
                hiddenStones: options.hiddenStones || 10,
                scanCount: options.scanCount || 3,
                missileMoveLimit: options.missileMoveLimit || 10,
                autoScoringMove: options.autoScoringMove ? parseInt(options.autoScoringMove) : undefined,
                boardSize: options.boardSize !== undefined && options.boardSize !== null ? parseInt(options.boardSize) : undefined,
                byoyomiSeconds: options.byoyomiSeconds !== undefined && options.byoyomiSeconds !== null ? options.byoyomiSeconds : undefined,
                byoyomiPeriods: options.byoyomiPeriods !== undefined && options.byoyomiPeriods !== null ? options.byoyomiPeriods : undefined,
                maxMoves: options.maxMoves !== undefined && options.maxMoves !== null && options.maxMoves !== '' ? parseInt(options.maxMoves) : undefined
            };
            
            console.log('[WaitingRoomSocket] startAiGame - Final gameOptions:', {
                ...gameOptions,
                captureTarget: gameOptions.captureTarget,
                captureTargetType: typeof gameOptions.captureTarget,
                originalCaptureTarget: options.captureTarget,
                originalType: typeof options.captureTarget,
                baseStones: gameOptions.baseStones,
                baseStonesType: typeof gameOptions.baseStones,
                originalBaseStones: options.baseStones,
                originalBaseStonesType: typeof options.baseStones
            });
            
            console.log('[WaitingRoomSocket] Final gameOptions:', gameOptions);
            
            // 베이스바둑은 덤 0.5집 고정
            if (options.mode === 'BASE') {
                gameOptions.komi = 0.5;
            }
            
            const game = await gameService.createAiGame(userId, level, color, gameOptions);
            
            console.log('[WaitingRoomSocket] AI game created successfully:', {
                gameId: game.id,
                gameIdType: typeof game.id,
                game: {
                    id: game.id,
                    mode: game.mode,
                    isAiGame: game.isAiGame
                }
            });
            
            await this.updateUserStatus(userId, 'in-game');
            this.publishUserStatusChanged(userId, 'in-game');
            
            // 게임 ID를 명시적으로 문자열로 변환하여 전송
            const gameId = String(game.id);
            console.log('[WaitingRoomSocket] Emitting ai_game_started with gameId:', gameId, 'type:', typeof gameId);
            socket.emit('ai_game_started', { gameId: gameId });
            console.log('[WaitingRoomSocket] ai_game_started event emitted');
        } catch (error) {
            console.error('[WaitingRoomSocket] Start AI game error:', error);
            console.error('[WaitingRoomSocket] Error stack:', error.stack);
            socket.emit('ai_game_error', { error: error.message || '게임 생성 중 오류가 발생했습니다.' });
        }
    }

    async getOngoingGames() {
        try {
            const prisma = require('../config/database');
            // endedAt이 null이고, startedAt이 있는 게임만 가져오기
            // 또한 너무 오래된 게임(24시간 이상)은 제외
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const games = await prisma.game.findMany({
                where: {
                    endedAt: null,
                    startedAt: {
                        gte: oneDayAgo // 24시간 이내에 시작된 게임만 (null이 아닌 것은 자동으로 보장됨)
                    },
                    isAiGame: false // AI 게임은 제외 (관전 불가)
                },
                include: {
                    blackPlayer: {
                        select: {
                            id: true,
                            nickname: true,
                            rating: true
                        }
                    },
                    whitePlayer: {
                        select: {
                            id: true,
                            nickname: true,
                            rating: true
                        }
                    },
                    _count: {
                        select: {
                            moves: true
                        }
                    }
                },
                orderBy: {
                    startedAt: 'desc'
                },
                take: 20
            });

            const realGames = await Promise.all(games.map(async (game) => {
                let blackPlayer = game.blackPlayer;
                let whitePlayer = game.whitePlayer;

                // Handle AI players
                if (game.blackId === null || !blackPlayer) {
                    blackPlayer = { 
                        nickname: game.isAiGame ? `AI (${game.aiLevel || 1}단계)` : 'Unknown', 
                        rating: game.blackRating 
                    };
                }
                
                if (game.whiteId === null || !whitePlayer) {
                    whitePlayer = { 
                        nickname: game.isAiGame ? `AI (${game.aiLevel || 1}단계)` : 'Unknown', 
                        rating: game.whiteRating 
                    };
                }

                // Prisma include로 이미 데이터를 가져왔으므로 추가 쿼리 불필요
                // 무한 루프 방지를 위해 getUserProfile 호출 제거
                if (!blackPlayer && game.blackId !== null) {
                    blackPlayer = { 
                        nickname: 'Unknown', 
                        rating: game.blackRating 
                    };
                }

                if (!whitePlayer && game.whiteId !== null) {
                    whitePlayer = { 
                        nickname: 'Unknown', 
                        rating: game.whiteRating 
                    };
                }

                // 랜덤 타이틀 생성
                const titles = [
                    '두뇌싸움의 끝판왕!',
                    '명수들의 대결',
                    '전략의 극치',
                    '바둑 고수들의 만남',
                    '실력자들의 격전',
                    '두뇌 게임의 정점',
                    '고수들의 대결',
                    '전략 바둑의 달인들',
                    '실력파들의 대전',
                    '명수들의 격돌'
                ];
                const randomTitle = titles[Math.floor(Math.random() * titles.length)];
                
                return {
                    id: game.id,
                    title: game.title || randomTitle, // 나중에 관리자가 설정할 수 있도록 title 필드 추가
                    blackPlayer: blackPlayer || { nickname: 'Unknown', rating: game.blackRating },
                    whitePlayer: whitePlayer || { nickname: 'Unknown', rating: game.whiteRating },
                    moveCount: game._count.moves,
                    startedAt: game.startedAt,
                    isAiGame: game.isAiGame,
                    isDemo: false
                };
            }));

            // 데모 데이터 추가 (항상 최소 5개가 되도록)
            const demoGames = [];
            const demoPlayers = [
                { nickname: '바둑고수', rating: 2450 },
                { nickname: '전략가', rating: 2380 },
                { nickname: '명수', rating: 2320 },
                { nickname: '고수', rating: 2280 },
                { nickname: '초고수', rating: 2250 },
                { nickname: '달인', rating: 2200 },
                { nickname: '고수왕', rating: 2150 },
                { nickname: '바둑신', rating: 2100 }
            ];
            const demoTitles = [
                '두뇌싸움의 끝판왕!',
                '명수들의 대결',
                '전략의 극치',
                '바둑 고수들의 만남',
                '실력자들의 격전'
            ];
            
            // 실제 게임이 5개 미만이면 데모 게임 추가
            const neededDemoCount = Math.max(0, 5 - realGames.length);
            for (let i = 0; i < neededDemoCount; i++) {
                const blackIdx = (realGames.length + i) * 2;
                const whiteIdx = (realGames.length + i) * 2 + 1;
                const demoId = `demo-${realGames.length + i}`;
                demoGames.push({
                    id: demoId,
                    title: demoTitles[i % demoTitles.length],
                    blackPlayer: { nickname: demoPlayers[blackIdx % demoPlayers.length].nickname, rating: demoPlayers[blackIdx % demoPlayers.length].rating },
                    whitePlayer: { nickname: demoPlayers[whiteIdx % demoPlayers.length].nickname, rating: demoPlayers[whiteIdx % demoPlayers.length].rating },
                    moveCount: Math.floor(Math.random() * 100) + 20,
                    startedAt: new Date(Date.now() - (Math.random() * 3600000)), // 최근 1시간 내
                    isDemo: true
                });
            }

            // 실제 게임과 데모 게임 합치기 (최대 5개)
            const allGames = [...realGames, ...demoGames].slice(0, 5);
            
            // 방번호를 1, 2, 3, 4, 5 형식으로 부여 (순서대로)
            allGames.forEach((game, index) => {
                game.roomNumber = index + 1; // 1부터 시작
            });
            
            return allGames;
        } catch (error) {
            console.error('Error getting ongoing games:', error);
            // 에러 발생 시 데모 데이터만 반환
            const demoGames = [];
            const demoPlayers = [
                { nickname: '바둑고수', rating: 2450 },
                { nickname: '전략가', rating: 2380 },
                { nickname: '명수', rating: 2320 },
                { nickname: '고수', rating: 2280 },
                { nickname: '초고수', rating: 2250 },
                { nickname: '달인', rating: 2200 },
                { nickname: '고수왕', rating: 2150 },
                { nickname: '바둑신', rating: 2100 }
            ];
            const demoTitles = [
                '두뇌싸움의 끝판왕!',
                '명수들의 대결',
                '전략의 극치',
                '바둑 고수들의 만남',
                '실력자들의 격전'
            ];
            
            for (let i = 0; i < 5; i++) {
                const blackIdx = i * 2;
                const whiteIdx = i * 2 + 1;
                demoGames.push({
                    id: `demo-${i}`,
                    title: demoTitles[i % demoTitles.length],
                    blackPlayer: { nickname: demoPlayers[blackIdx % demoPlayers.length].nickname, rating: demoPlayers[blackIdx % demoPlayers.length].rating },
                    whitePlayer: { nickname: demoPlayers[whiteIdx % demoPlayers.length].nickname, rating: demoPlayers[whiteIdx % demoPlayers.length].rating },
                    moveCount: Math.floor(Math.random() * 100) + 20,
                    startedAt: new Date(Date.now() - (Math.random() * 3600000)),
                    isDemo: true
                });
            }
            
            // 방번호를 1, 2, 3, 4, 5 형식으로 부여
            demoGames.forEach((game, index) => {
                game.roomNumber = index + 1;
            });
            
            return demoGames;
        }
    }

    async getRankings() {
        try {
            console.log('getRankings: starting');
            console.log('getRankings: fetching from userService.getTopRankings');
            let rankings = [];
            try {
                // getTopRankings 내부에서 이미 타임아웃 처리를 하므로, 여기서는 더 긴 타임아웃 설정
                rankings = await Promise.race([
                    userService.getTopRankings(100),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('getTopRankings timeout')), 15000)
                    )
                ]);
                console.log('getRankings: received', rankings.length, 'rankings from database');
            } catch (error) {
                console.error('Error fetching rankings from database:', error.message);
                rankings = [];
            }
            
            // 데모 데이터 추가 (랭킹이 5개 미만일 때)
            const demoRankings = [];
            const demoData = [
                { nickname: '바둑고수', rating: 2500, wins: 150, losses: 20, draws: 5 },
                { nickname: '전략의신', rating: 2400, wins: 120, losses: 30, draws: 10 },
                { nickname: '명수왕', rating: 2300, wins: 100, losses: 40, draws: 15 },
                { nickname: '고수킹', rating: 2200, wins: 80, losses: 50, draws: 20 },
                { nickname: '바둑천재', rating: 2100, wins: 60, losses: 60, draws: 25 }
            ];
            
            // 항상 5개가 되도록 데모 데이터 추가
            const needed = Math.max(0, 5 - rankings.length);
            console.log('getRankings: adding', needed, 'demo rankings');
            for (let i = 0; i < needed; i++) {
                const demo = demoData[i % demoData.length];
                demoRankings.push({
                    rank: rankings.length + i + 1,
                    nickname: demo.nickname,
                    rating: demo.rating,
                    wins: demo.wins,
                    losses: demo.losses,
                    draws: demo.draws,
                    isDemo: true
                });
            }

            // 실제 랭킹과 데모 랭킹 합치기
            const allRankings = [...rankings, ...demoRankings];
            
            // 레이팅 기준으로 내림차순 정렬 (1등이 맨 위에 오도록)
            allRankings.sort((a, b) => (b.rating || 0) - (a.rating || 0));
            
            // 정렬 후 rank 번호 재설정
            allRankings.forEach((rank, index) => {
                rank.rank = index + 1;
            });
            
            // 최대 100개 반환
            const topRankings = allRankings.slice(0, 100);
            console.log('getRankings: returning', topRankings.length, 'rankings');
            return topRankings;
        } catch (error) {
            console.error('Error getting rankings:', error);
            // 에러 발생 시 데모 데이터만 반환
            const demoRankings = [
                { rank: 1, nickname: '바둑고수', rating: 2500, wins: 150, losses: 20, draws: 5, isDemo: true },
                { rank: 2, nickname: '전략의신', rating: 2400, wins: 120, losses: 30, draws: 10, isDemo: true },
                { rank: 3, nickname: '명수왕', rating: 2300, wins: 100, losses: 40, draws: 15, isDemo: true },
                { rank: 4, nickname: '고수킹', rating: 2200, wins: 80, losses: 50, draws: 20, isDemo: true },
                { rank: 5, nickname: '바둑천재', rating: 2100, wins: 60, losses: 60, draws: 25, isDemo: true }
            ];
            console.log('getRankings: returning demo rankings only');
            return demoRankings;
        }
    }

    handleDisconnect(userId) {
        this.onlineUsers.delete(userId);
        this.publishUserLeft(userId).catch(err => {
            console.error('Error in publishUserLeft:', err);
        });
        
        // Remove from matching queue if in queue
        const rankingService = require('../services/rankingService');
        rankingService.removeFromMatchingQueue(userId);
    }

    // 진행중인 게임 목록 업데이트를 모든 대기실에 브로드캐스트
    async broadcastOngoingGamesUpdate() {
        // 무한 루프 방지
        if (this.isUpdatingOngoingGames) {
            console.log('Skipping broadcast - already updating');
            return;
        }
        try {
            this.isUpdatingOngoingGames = true;
            const games = await this.getOngoingGames();
            this.io.to('waiting-room-strategy').emit('ongoing_games_update', games);
            this.io.to('waiting-room-casual').emit('ongoing_games_update', games);
        } catch (error) {
            console.error('Error broadcasting ongoing games update:', error);
        } finally {
            this.isUpdatingOngoingGames = false;
        }
    }
}

module.exports = WaitingRoomSocket;

