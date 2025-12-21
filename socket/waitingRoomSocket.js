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
            console.log('User joining room:', userId, roomType);
            this.userRoomType.set(userId, roomType || 'strategy');
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
            const games = await this.getOngoingGames();
            socket.emit('ongoing_games_update', games);
        });

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
                
                // Broadcast to all users in waiting room
                this.io.emit('chat_message', chatData);
            } catch (error) {
                console.error('Error handling chat message:', error);
                // Fallback to using the provided user name
                const chatData = {
                    user: data.user || 'Unknown',
                    message: data.message || '',
                    timestamp: data.timestamp || Date.now()
                };
                this.io.emit('chat_message', chatData);
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
            await this.startAiGame(userId, socket, data.level, data.color);
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
        // Check tickets before starting matching
        const ticketService = require('../services/ticketService');
        const ticketType = roomType === 'casual' ? 'casual' : 'strategy';
        
        try {
            const tickets = await ticketService.getTickets(userId);
            const hasTicket = ticketType === 'strategy' 
                ? tickets.strategyTickets > 0 
                : tickets.casualTickets > 0;

            if (!hasTicket) {
                socket.emit('matching_error', { 
                    error: '이용권이 부족합니다. 30분마다 이용권이 회복됩니다.' 
                });
                return;
            }
        } catch (error) {
            console.error('Ticket check error:', error);
            socket.emit('matching_error', { 
                error: '이용권 확인 중 오류가 발생했습니다.' 
            });
            return;
        }

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

    async startAiGame(userId, socket, level, color) {
        try {
            // AI 게임은 이용권 소모하지 않음 (요청사항에 따라 변경 가능)
            // 필요시 아래 주석을 해제하여 이용권 소모
            /*
            const ticketService = require('../services/ticketService');
            const roomType = this.userRoomType.get(userId) || 'strategy';
            const ticketType = roomType === 'casual' ? 'casual' : 'strategy';
            
            const hasTicket = await ticketService.consumeTicket(userId, ticketType);
            if (!hasTicket) {
                socket.emit('ai_game_error', { 
                    error: '이용권이 부족합니다. 30분마다 이용권이 회복됩니다.' 
                });
                return;
            }
            */

            const gameService = require('../services/gameService');
            const game = await gameService.createAiGame(userId, level, color);
            
            await this.updateUserStatus(userId, 'in-game');
            this.publishUserStatusChanged(userId, 'in-game');
            
            socket.emit('ai_game_started', { gameId: game.id });
        } catch (error) {
            console.error('Start AI game error:', error);
            socket.emit('ai_game_error', { error: error.message });
        }
    }

    async getOngoingGames() {
        try {
            const prisma = require('../config/database');
            const games = await prisma.game.findMany({
                where: {
                    endedAt: null
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
                        nickname: game.isAiGame ? `AI (${game.aiLevel || 1}단)` : 'Unknown', 
                        rating: game.blackRating 
                    };
                }
                
                if (game.whiteId === null || !whitePlayer) {
                    whitePlayer = { 
                        nickname: game.isAiGame ? `AI (${game.aiLevel || 1}단)` : 'Unknown', 
                        rating: game.whiteRating 
                    };
                }

                // If player is not found, fetch from userService
                if (!blackPlayer && game.blackId !== null) {
                    try {
                        const profile = await userService.getUserProfile(game.blackId);
                        if (profile) {
                            blackPlayer = {
                                nickname: profile.nickname,
                                rating: profile.rating
                            };
                        }
                    } catch (error) {
                        console.error(`Error fetching black player ${game.blackId}:`, error);
                    }
                }

                if (!whitePlayer && game.whiteId !== null) {
                    try {
                        const profile = await userService.getUserProfile(game.whiteId);
                        if (profile) {
                            whitePlayer = {
                                nickname: profile.nickname,
                                rating: profile.rating
                            };
                        }
                    } catch (error) {
                        console.error(`Error fetching white player ${game.whiteId}:`, error);
                    }
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
                    userService.getTopRankings(50),
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
            
            // 최대 5개만 반환
            const topRankings = allRankings.slice(0, 5);
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
}

module.exports = WaitingRoomSocket;

