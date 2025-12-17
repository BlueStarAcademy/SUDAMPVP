import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { verifyToken, JWTPayload } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export interface SocketWithUser extends SocketIOServer {
  userId?: string;
}

let globalIO: SocketIOServer | null = null;

export function getSocketServer(): SocketIOServer | null {
  return globalIO;
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
    socket.on('lobby:join', async (data?: { mode?: 'STRATEGY' | 'PLAY' }) => {
      const mode = data?.mode || 'STRATEGY'; // 기본값은 전략바둑
      const roomName = `lobby:${mode}`;
      
      // 기존 대기실에서 나가기
      socket.leave('lobby:STRATEGY');
      socket.leave('lobby:PLAY');
      
      // 선택한 대기실에 참가
      socket.join(roomName);
      
      // 해당 모드의 온라인 유저 목록 가져오기
      const onlineUsers = await getOnlineUsersByMode(mode);
      io.to(roomName).emit('lobby:users', { mode, users: onlineUsers });
      
      // Emit ongoing games update
      const ongoingGames = await getOngoingGames();
      socket.emit('game:ongoing-updated', ongoingGames);
    });

    // Handle leave lobby
    socket.on('lobby:leave', () => {
      socket.leave('lobby:STRATEGY');
      socket.leave('lobby:PLAY');
    });

    // Handle game events
    socket.on('game:join', async (gameId: string) => {
      socket.join(`game:${gameId}`);
      
      // Load game and emit current state
      const { gameManager } = await import('@/lib/game/gameManager');
      const game = await gameManager.loadGame(gameId);
      if (game) {
        // Get player info from database
        const dbGame = await prisma.game.findUnique({
          where: { id: gameId },
          include: {
            player1: {
              select: {
                id: true,
                username: true,
                nickname: true,
              },
            },
            player2: {
              select: {
                id: true,
                username: true,
                nickname: true,
              },
            },
          },
        });

        socket.emit('game:update', {
          ...game,
          player1: dbGame?.player1,
          player2: dbGame?.player2,
        });
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
        // Get player info from database
        const dbGame = await prisma.game.findUnique({
          where: { id: gameId },
          include: {
            player1: {
              select: {
                id: true,
                username: true,
                nickname: true,
              },
            },
            player2: {
              select: {
                id: true,
                username: true,
                nickname: true,
              },
            },
          },
        });

        // Broadcast update to all players and spectators
        const gameUpdate = {
          ...result.game,
          player1: dbGame?.player1,
          player2: dbGame?.player2,
        };
        io.to(`game:${gameId}`).emit('game:update', gameUpdate);
        
        // If game ended, also update ongoing games list
        if (result.game.status === 'FINISHED') {
          const ongoingGames = await getOngoingGames();
          io.to('lobby').emit('game:ongoing-updated', ongoingGames);
        }
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
        // Get player info from database
        const dbGame = await prisma.game.findUnique({
          where: { id: gameId },
          include: {
            player1: {
              select: {
                id: true,
                username: true,
                nickname: true,
              },
            },
            player2: {
              select: {
                id: true,
                username: true,
                nickname: true,
              },
            },
          },
        });

        io.to(`game:${gameId}`).emit('game:update', {
          ...result.game,
          player1: dbGame?.player1,
          player2: dbGame?.player2,
        });
      } else {
        socket.emit('game:error', { message: 'Failed to pass' });
      }
    });

    // Handle user status change
    socket.on('user:status-change', async (data: { status: string }) => {
      const { status } = data;
      
      // Update user status in database
      await prisma.user.update({
        where: { id: userId },
        data: { status: status as any },
      });

      // Broadcast status change to lobby
      const onlineUsers = await getOnlineUsers();
      io.to('lobby').emit('lobby:user-status-updated', {
        userId,
        status,
        users: onlineUsers,
      });
    });

    // Handle game request events
    socket.on('game:request-sent', async (data: { receiverId: string; requestId: string }) => {
      // 수신자에게 알림
      io.to(`user:${data.receiverId}`).emit('game:request-received', {
        id: data.requestId,
      });
    });
  });

  globalIO = io;
  return io;
}

async function getOngoingGames() {
  const games = await prisma.game.findMany({
    where: {
      status: 'IN_PROGRESS',
      player2Id: { not: null },
      aiType: null,
    },
    include: {
      player1: {
        select: {
          id: true,
          username: true,
          nickname: true,
        },
      },
      player2: {
        select: {
          id: true,
          username: true,
          nickname: true,
        },
      },
    },
    orderBy: {
      startedAt: 'desc',
    },
    take: 20,
  });

  return games.map((game) => ({
    id: game.id,
    gameType: game.gameType,
    boardSize: game.boardSize,
    player1: {
      id: game.player1.id,
      username: game.player1.username,
      nickname: game.player1.nickname,
    },
    player2: game.player2
      ? {
          id: game.player2.id,
          username: game.player2.username,
          nickname: game.player2.nickname,
        }
      : null,
    status: game.status,
    startedAt: game.startedAt?.toISOString() || null,
  }));
}

async function getOnlineUsers() {
  const sessions = await prisma.session.findMany({
    where: { 
      isOnline: true,
      lastSeen: {
        gte: new Date(Date.now() - 5 * 60 * 1000), // 최근 5분 이내
      },
    },
    include: { 
      user: {
        select: {
          id: true,
          username: true,
          nickname: true,
          status: true,
        },
      },
    },
  });

  // 중복 제거 (같은 유저의 여러 세션)
  const userMap = new Map();
  sessions.forEach((session) => {
    const userId = session.user.id;
    if (!userMap.has(userId)) {
      userMap.set(userId, {
        id: session.user.id,
        username: session.user.username,
        nickname: session.user.nickname,
        status: session.user.status || 'WAITING',
        socketId: session.socketId,
      });
    }
  });

  return Array.from(userMap.values());
}

async function getOnlineUsersByMode(mode: 'STRATEGY' | 'PLAY') {
  // Socket.io의 방에 있는 유저들을 가져오는 것은 복잡하므로
  // 일단 모든 온라인 유저를 반환하고, 클라이언트에서 필터링
  // 추후 개선 가능: User 모델에 현재 대기실 정보 추가
  return getOnlineUsers();
}
