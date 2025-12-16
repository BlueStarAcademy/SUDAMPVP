import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { verifyToken, JWTPayload } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export interface SocketWithUser extends SocketIOServer {
  userId?: string;
}

export function initializeSocket(server: HTTPServer) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/api/socket',
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const payload = verifyToken(token);
      if (!payload) {
        return next(new Error('Authentication error: Invalid token'));
      }

      (socket as any).userId = payload.userId;
      (socket as any).user = payload;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = (socket as any).userId;
    const user = (socket as any).user;

    console.log(`User connected: ${user.username} (${userId})`);

    // Create or update session
    await prisma.session.upsert({
      where: { socketId: socket.id },
      update: {
        isOnline: true,
        lastSeen: new Date(),
      },
      create: {
        userId,
        socketId: socket.id,
        isOnline: true,
        lastSeen: new Date(),
      },
    });

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Emit connection success
    socket.emit('connected', { userId, username: user.username });

    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${user.username} (${userId})`);
      
      // Update session
      await prisma.session.updateMany({
        where: { socketId: socket.id },
        data: {
          isOnline: false,
          lastSeen: new Date(),
        },
      });
    });

    // Handle join lobby
    socket.on('lobby:join', async () => {
      socket.join('lobby');
      const onlineUsers = await getOnlineUsers();
      io.to('lobby').emit('lobby:users', onlineUsers);
    });

    // Handle leave lobby
    socket.on('lobby:leave', () => {
      socket.leave('lobby');
    });

    // Handle game events
    socket.on('game:join', async (gameId: string) => {
      socket.join(`game:${gameId}`);
      
      // Load game and emit current state
      const { gameManager } = await import('@/lib/game/gameManager');
      const game = await gameManager.loadGame(gameId);
      if (game) {
        socket.emit('game:update', game);
      }
    });

    socket.on('game:leave', (gameId: string) => {
      socket.leave(`game:${gameId}`);
    });

    socket.on('game:move', async (data: { gameId: string; x: number; y: number }) => {
      const { gameId, x, y } = data;
      const { gameManager } = await import('@/lib/game/gameManager');
      
      // Determine player number
      const game = gameManager.getGame(gameId);
      if (!game) {
        socket.emit('game:error', { message: 'Game not found' });
        return;
      }

      const player = game.player1Id === userId ? 1 : game.player2Id === userId ? 2 : null;
      if (!player) {
        socket.emit('game:error', { message: 'Not authorized' });
        return;
      }

      const result = await gameManager.makeMove(gameId, player, x, y);
      if (result.success && result.game) {
        // Broadcast update to all players and spectators
        io.to(`game:${gameId}`).emit('game:update', result.game);
      } else {
        socket.emit('game:error', { message: result.error || 'Invalid move' });
      }
    });

    socket.on('game:pass', async (data: { gameId: string }) => {
      const { gameId } = data;
      const { gameManager } = await import('@/lib/game/gameManager');
      
      const game = gameManager.getGame(gameId);
      if (!game) {
        socket.emit('game:error', { message: 'Game not found' });
        return;
      }

      const player = game.player1Id === userId ? 1 : game.player2Id === userId ? 2 : null;
      if (!player) {
        socket.emit('game:error', { message: 'Not authorized' });
        return;
      }

      const result = await gameManager.passMove(gameId, player);
      if (result.success && result.game) {
        io.to(`game:${gameId}`).emit('game:update', result.game);
      } else {
        socket.emit('game:error', { message: 'Failed to pass' });
      }
    });
  });

  return io;
}

async function getOnlineUsers() {
  const sessions = await prisma.session.findMany({
    where: { isOnline: true },
    include: { user: true },
    distinct: ['userId'],
  });

  return sessions.map((session) => ({
    id: session.user.id,
    username: session.user.username,
    socketId: session.socketId,
  }));
}

