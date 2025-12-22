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
    resave: true, // 세션을 항상 다시 저장 (변경사항이 없어도)
    saveUninitialized: false,
    name: 'connect.sid', // 명시적으로 세션 쿠키 이름 설정
    cookie: {
        secure: process.env.NODE_ENV === 'production', // 프로덕션에서는 HTTPS 사용 시 true
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 프로덕션에서는 cross-site 쿠키 허용
        path: '/' // 쿠키 경로 명시
    }
};

// Initialize Redis (non-blocking, won't block server startup)
// Redis is optional - app will work with memory store if Redis is unavailable
initializeRedis()
    .then(() => {
        const client = getRedisClient();
        if (client) {
            console.log('Redis initialized successfully');
        }
    })
    .catch((error) => {
        console.error('Redis initialization failed, using memory store:', error.message);
    });

// Apply session middleware to Express app
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

// Content Security Policy - 개발 환경에서는 좀 더 느슨하게 설정
// Chrome DevTools 경고를 방지하기 위해 connect-src에 localhost 허용
app.use((req, res, next) => {
    // 개발 환경에서만 CSP 헤더 추가 (프로덕션에서는 더 엄격하게 설정 가능)
    if (process.env.NODE_ENV === 'development') {
        res.setHeader(
            'Content-Security-Policy',
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob:; " +
            "font-src 'self' data:; " +
            "connect-src 'self' ws://localhost:* wss://localhost:* http://localhost:* https://localhost:*; " +
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
    console.log(`=== ${roomType === 'strategy' ? '전략바둑' : '놀이바둑'} 대기실 REQUEST ===`);
    console.log('Session userId:', req.session?.userId);
    console.log('Session nickname:', req.session?.nickname);
    console.log('Request cookies:', req.headers.cookie);
    console.log('Session ID:', req.sessionID);
    
    try {
        console.log('Getting user service...');
        const userService = require('./services/userService');
        console.log('Calling getUserProfile with userId:', req.session.userId);
        
        const user = await userService.getUserProfile(req.session.userId);
        console.log('getUserProfile completed, user:', user ? 'found' : 'not found');
        
        if (!user) {
            console.error('User not found for userId:', req.session.userId);
            return res.redirect('/login');
        }
        
        console.log('User profile loaded:', user?.nickname);
        console.log('Rendering waitingRoom template...');
        console.log('User data:', JSON.stringify(user, null, 2));
        
        res.render('waitingRoom', { user, roomType }, (err, html) => {
            if (err) {
                console.error('Template rendering error:', err);
                console.error('Error details:', {
                    message: err.message,
                    stack: err.stack
                });
                return res.status(500).send('템플릿 렌더링 오류가 발생했습니다.');
            }
            console.log('waitingRoom template rendered successfully');
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
app.use('/api/game', require('./routes/game'));
app.use('/api/ranking', require('./routes/ranking'));
app.use('/api/ticket', require('./routes/ticket'));

// Socket.io setup
const WaitingRoomSocket = require('./socket/waitingRoomSocket');
const GameSocket = require('./socket/gameSocket');

const waitingRoomSocket = new WaitingRoomSocket(io);
const gameSocket = new GameSocket(io);

// Make waitingRoomSocket available globally for status updates
global.waitingRoomSocket = waitingRoomSocket;

// Socket.io authentication middleware
// Share express-session with Socket.IO
// Note: io.engine.use is already set above when initializing Socket.IO

io.use((socket, next) => {
    // 세션 확인 - 쿠키에서 세션 ID를 추출하고 세션 스토어에서 직접 로드
    const cookies = socket.handshake.headers.cookie;
    if (!cookies) {
        console.warn('Socket connection rejected: No cookies');
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
        console.warn('Socket connection rejected: No session cookie');
        return next(new Error('Authentication required'));
    }

    // 세션 ID에서 실제 세션 ID 추출 (s: 접두사 제거)
    const actualSessionId = sessionId.startsWith('s:') 
        ? sessionId.substring(2).split('.')[0] 
        : sessionId.split('.')[0];

    // 세션 스토어에서 세션 로드
    const sessionStore = socket.request.sessionStore || sessionMiddleware.store;
    
    if (!sessionStore) {
        console.error('Session store not found');
        return next(new Error('Authentication required'));
    }

    sessionStore.get(actualSessionId, (err, session) => {
        if (err) {
            console.error('Session store error:', err);
            return next(new Error('Authentication required'));
        }

        if (!session || !session.userId) {
            console.warn('Socket connection rejected: Invalid session or no userId', {
                hasSession: !!session,
                userId: session?.userId,
                sessionId: actualSessionId
            });
            return next(new Error('Authentication required'));
        }

        // 세션 정보를 socket에 저장
        socket.userId = session.userId;
        socket.request.session = session;
        socket.request.sessionID = actualSessionId;
        console.log('Socket connection accepted for user:', session.userId);
        next();
    });
});

// Main namespace for waiting room and game rooms
io.on('connection', (socket) => {
    console.log('User connected:', socket.userId);
    
    // Handle waiting room
    waitingRoomSocket.handleConnection(socket, socket.userId);
    
    // Handle game room join
    socket.on('join_game', (gameId) => {
        console.log('User joining game:', gameId, socket.userId);
        socket.join(`game-${gameId}`);
        gameSocket.handleConnection(socket, gameId, socket.userId);
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };

