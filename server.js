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

// Initialize Socket.io
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Make io available globally
app.set('io', io);
global.io = io;

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

// Session configuration
// Use memory store by default (Redis is optional for caching, not required for sessions)
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', './views');

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

app.get('/waiting-room', requireAuth, async (req, res) => {
    try {
        const userService = require('./services/userService');
        const user = await userService.getUserProfile(req.session.userId);
        res.render('waitingRoom', { user });
    } catch (error) {
        console.error('Waiting room error:', error);
        res.redirect('/login');
    }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/game', require('./routes/game'));
app.use('/api/ranking', require('./routes/ranking'));

// Socket.io setup
const WaitingRoomSocket = require('./socket/waitingRoomSocket');
const GameSocket = require('./socket/gameSocket');

const waitingRoomSocket = new WaitingRoomSocket(io);
const gameSocket = new GameSocket(io);

// Socket.io authentication middleware
io.use((socket, next) => {
    const session = socket.request.session;
    if (session && session.userId) {
        socket.userId = session.userId;
        next();
    } else {
        next(new Error('Authentication required'));
    }
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

