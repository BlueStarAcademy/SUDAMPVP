require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { initializeRedis, getRedisClient } = require('./config/redis');
const { requireAuth } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);

// Session configuration
// Use memory store by default (Redis is optional for caching, not required for sessions)
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: true, // 세션을 항상 다시 저장 (안정성을 위해 true로 유지)
    saveUninitialized: false,
    name: 'connect.sid', // 명시적으로 세션 쿠키 이름 설정
    cookie: {
        secure: process.env.NODE_ENV === 'production', // 프로덕션에서는 HTTPS 사용 시 true
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (새로고침 시에도 로그인 유지)
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 프로덕션에서는 cross-site 쿠키 허용
        path: '/', // 쿠키 경로 명시
        domain: undefined // 모든 도메인에서 사용 가능하도록 설정
    },
    rolling: true // 매 요청마다 세션 만료 시간 갱신
};

// Initialize Redis for session store (non-blocking)
// Redis를 사용 가능하면 사용, 아니면 메모리 스토어 사용
// 메모리 스토어는 기본값으로 작동하며 Redis가 나중에 연결되면 자동으로 사용됨
// 비동기로 Redis 초기화 시도 (실패해도 계속 진행)
initializeRedis()
    .then(() => {
        const client = getRedisClient();
        if (client) {
            try {
                const RedisStore = require('connect-redis').default;
                const redisStore = new RedisStore({
                    client: client,
                    prefix: 'sess:'
                });
                // 세션 미들웨어가 이미 생성되었으므로 store를 동적으로 변경할 수 없음
                // 대신 다음 요청부터 Redis를 사용하도록 설정
                console.log('Redis initialized successfully (will be used for new sessions)');
            } catch (error) {
                console.error('Failed to create Redis store:', error.message);
            }
        }
    })
    .catch((error) => {
        console.log('Redis initialization skipped, using memory store:', error.message);
    });

// Apply session middleware to Express app
// 메모리 스토어로 시작하며, Redis가 나중에 연결되면 새로운 세션에 Redis 사용
const sessionMiddleware = session(sessionConfig);
app.use(sessionMiddleware);

// Initialize Socket.io AFTER session middleware
const io = new Server(server, {
    cors: {
        origin: true,
        credentials: true,
        methods: ['GET', 'POST']
    },
    allowEIO3: true // Socket.IO v3 호환성
});

// Share express-session with Socket.IO
// Socket.IO v4에서는 io.engine.use를 사용하여 세션 미들웨어를 적용
io.engine.use((req, res, next) => {
    sessionMiddleware(req, res, next);
});

// Make io available globally
app.set('io', io);
global.io = io;

// CORS 설정 (같은 origin이므로 실제로는 필요 없지만 명시적으로 설정)
const cors = require('cors');
app.use(cors({
  origin: true, // 모든 origin 허용 (로컬 개발용)
  credentials: true
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', './views');

// 세션 유지 확인 미들웨어 (개발 환경에서만 로그)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    // 세션 쿠키가 있으면 세션이 제대로 로드되었는지 확인
    if (req.headers.cookie && req.headers.cookie.includes('connect.sid')) {
      // 세션이 있지만 userId가 없으면 세션 만료 가능성
      if (req.session && !req.session.userId && req.path !== '/login' && !req.path.startsWith('/api/auth/login')) {
        console.log('Session exists but no userId:', {
          path: req.path,
          sessionID: req.sessionID,
          hasSession: !!req.session
        });
      }
    }
    next();
  });
}

// Content Security Policy - 개발 환경에서는 좀 더 느슨하게 설정
// 모바일 접속을 위해 네트워크 IP도 허용
app.use((req, res, next) => {
    // 개발 환경에서만 CSP 헤더 추가 (프로덕션에서는 더 엄격하게 설정 가능)
    if (process.env.NODE_ENV === 'development') {
        // 네트워크 IP 주소 가져오기
        const os = require('os');
        const networkInterfaces = os.networkInterfaces();
        const networkIPs = [];
        
        Object.keys(networkInterfaces).forEach((interfaceName) => {
            networkInterfaces[interfaceName].forEach((iface) => {
                if (iface.family === 'IPv4' && !iface.internal) {
                    networkIPs.push(iface.address);
                }
            });
        });
        
        // CSP에 네트워크 IP 추가
        let connectSrc = "'self' ws://localhost:* wss://localhost:* http://localhost:* https://localhost:*";
        networkIPs.forEach((ip) => {
            connectSrc += ` ws://${ip}:* wss://${ip}:* http://${ip}:* https://${ip}:*`;
        });
        
        res.setHeader(
            'Content-Security-Policy',
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob:; " +
            "font-src 'self' data:; " +
            `connect-src ${connectSrc}; ` +
            "frame-ancestors 'none';"
        );
    }
    next();
});

// Ignore favicon requests (404 방지)
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Handle .well-known requests (Chrome DevTools, etc.)
app.get('/.well-known/*', (req, res) => res.status(404).end());

// Routes
app.get('/', (req, res) => {
    if (req.session.userId) {
        res.redirect('/waiting-room');
    } else {
        res.redirect('/login');
    }
});

app.get('/login', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/waiting-room');
    }
    res.render('login');
});

// 대기실 렌더링 공통 함수
async function renderWaitingRoom(req, res, roomType = 'strategy') {
    // 개발 환경에서만 상세 로그 출력
    if (process.env.NODE_ENV === 'development') {
        console.log(`=== ${roomType === 'strategy' ? '전략바둑' : '놀이바둑'} 대기실 REQUEST ===`);
        console.log('Session userId:', req.session?.userId);
        console.log('Session ID:', req.sessionID);
    }
    
    try {
        const userService = require('./services/userService');
        
        const user = await userService.getUserProfile(req.session.userId);
        
        if (!user) {
            console.error('User not found for userId:', req.session.userId);
            return res.redirect('/login');
        }
        
        if (process.env.NODE_ENV === 'development') {
            console.log('User profile loaded:', user?.nickname);
        }
        
        res.render('waitingRoom', { user, roomType }, (err, html) => {
            if (err) {
                console.error('Template rendering error:', err);
                console.error('Error details:', {
                    message: err.message,
                    stack: err.stack
                });
                return res.status(500).send('템플릿 렌더링 오류가 발생했습니다.');
            }
            if (process.env.NODE_ENV === 'development') {
                console.log('waitingRoom template rendered successfully');
            }
            res.send(html);
        });
    } catch (error) {
        console.error('Waiting room error:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('Error code:', error.code);
        res.redirect('/login');
    }
}

app.get('/waiting-room', requireAuth, async (req, res) => {
    await renderWaitingRoom(req, res, 'strategy');
});

app.get('/waiting-room-casual', requireAuth, async (req, res) => {
    await renderWaitingRoom(req, res, 'casual');
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/game', require('./routes/game'));
app.use('/api/ranking', require('./routes/ranking'));
app.use('/api/ticket', require('./routes/ticket'));

// Socket.io setup
const WaitingRoomSocket = require('./socket/waitingRoomSocket');
const GameSocket = require('./socket/gameSocket');

const waitingRoomSocket = new WaitingRoomSocket(io);
const gameSocket = new GameSocket(io);

// Make waitingRoomSocket and gameSocket available globally for status updates
global.waitingRoomSocket = waitingRoomSocket;
global.gameSocket = gameSocket;

// Socket.io authentication middleware
// Share express-session with Socket.IO
// Note: io.engine.use is already set above when initializing Socket.IO

io.use((socket, next) => {
    // 세션 확인 - 쿠키에서 세션 ID를 추출하고 세션 스토어에서 직접 로드
    const cookies = socket.handshake.headers.cookie;
    if (!cookies) {
        console.warn('[Socket Auth] Connection rejected: No cookies in handshake');
        return next(new Error('Authentication required'));
    }

    // 쿠키 파싱
    const cookieParser = require('cookie-parser');
    const parsedCookies = {};
    cookies.split(';').forEach(cookie => {
        const parts = cookie.trim().split('=');
        if (parts.length === 2) {
            parsedCookies[parts[0].trim()] = decodeURIComponent(parts[1].trim());
        }
    });

    // 세션 ID 추출 (connect.sid 형식: s:sessionId.signature)
    const sessionCookieName = sessionConfig.name || 'connect.sid';
    const sessionId = parsedCookies[sessionCookieName];
    
    if (!sessionId) {
        console.warn('[Socket Auth] Connection rejected: No session cookie found', {
            cookieNames: Object.keys(parsedCookies),
            expectedCookie: sessionCookieName
        });
        return next(new Error('Authentication required'));
    }

    // 세션 ID에서 실제 세션 ID 추출 (s: 접두사 제거)
    const actualSessionId = sessionId.startsWith('s:') 
        ? sessionId.substring(2).split('.')[0] 
        : sessionId.split('.')[0];

    // 세션 스토어에서 세션 로드
    const sessionStore = socket.request.sessionStore || sessionMiddleware.store;
    
    if (!sessionStore) {
        console.error('[Socket Auth] Session store not found');
        return next(new Error('Authentication required'));
    }

    // 세션 로드 (타임아웃 추가)
    const timeout = setTimeout(() => {
        console.error('[Socket Auth] Session load timeout');
        return next(new Error('Authentication required'));
    }, 5000); // 5초 타임아웃

    sessionStore.get(actualSessionId, (err, session) => {
        clearTimeout(timeout);
        
        if (err) {
            console.error('[Socket Auth] Session store error:', err);
            return next(new Error('Authentication required'));
        }

        if (!session) {
            console.warn('[Socket Auth] Session not found in store', {
                sessionId: actualSessionId,
                storeType: sessionStore.constructor.name
            });
            return next(new Error('Authentication required'));
        }

        if (!session.userId) {
            console.warn('[Socket Auth] Session found but no userId', {
                sessionId: actualSessionId,
                sessionKeys: Object.keys(session)
            });
            return next(new Error('Authentication required'));
        }

        // 세션 정보를 socket에 저장
        socket.userId = session.userId;
        socket.request.session = session;
        socket.request.sessionID = actualSessionId;
        console.log('[Socket Auth] Connection accepted for user:', session.userId);
        next();
    });
});

// Main namespace for waiting room and game rooms
io.on('connection', (socket) => {
    console.log('User connected:', socket.userId);
    
    // Handle waiting room
    waitingRoomSocket.handleConnection(socket, socket.userId);
    
    // Handle game room join
    socket.on('join_game', async (gameId) => {
        console.log('User joining game:', gameId, socket.userId);
        if (!gameId || gameId === '' || gameId === 'undefined' || gameId === 'null') {
            console.error('[Server] join_game: gameId is null, undefined, or invalid:', gameId);
            socket.emit('game_error', { error: 'Invalid game ID' });
            return;
        }
        const gameRoom = `game-${gameId}`;
        console.log(`[Server] join_game: Joining room ${gameRoom} for socket ${socket.id}, user ${socket.userId}`);
        socket.join(gameRoom);
        
        // Room join 확인
        const roomSockets = await io.in(gameRoom).fetchSockets();
        console.log(`[Server] join_game: Room ${gameRoom} now has ${roomSockets.length} socket(s):`, roomSockets.map(s => s.id));
        
        gameSocket.handleConnection(socket, gameId, socket.userId);
    });
});

// Start server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // 모든 네트워크 인터페이스에서 접근 가능

server.listen(PORT, HOST, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Local access: http://localhost:${PORT}`);
    
    // 네트워크 IP 주소 가져오기 (Windows)
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    const addresses = [];
    
    Object.keys(networkInterfaces).forEach((interfaceName) => {
        networkInterfaces[interfaceName].forEach((iface) => {
            // IPv4 주소만 표시하고, 내부 루프백 주소는 제외
            if (iface.family === 'IPv4' && !iface.internal) {
                addresses.push(iface.address);
            }
        });
    });
    
    if (addresses.length > 0) {
        console.log('\n=== 네트워크 접속 정보 ===');
        addresses.forEach((address) => {
            console.log(`Network access: http://${address}:${PORT}`);
        });
        console.log('같은 네트워크의 모바일 기기에서 위 주소로 접속하세요.\n');
    } else {
        console.log('\n네트워크 IP 주소를 찾을 수 없습니다.');
        console.log('같은 네트워크의 모바일 기기에서 접속하려면 PC의 IP 주소를 확인하세요.\n');
    }
});

module.exports = { app, server, io };

