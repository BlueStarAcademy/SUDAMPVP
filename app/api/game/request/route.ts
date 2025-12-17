import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { prisma } from '@/lib/prisma';
import { ALL_GAME_TYPES, STRATEGY_GAME_TYPES, PLAY_GAME_TYPES } from '@/lib/game/types';

export async function POST(request: NextRequest) {
  try {
    const user = requireAuth(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { receiverId, gameType, boardSize, timeLimit } = body;

    // 수신자 확인
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true, status: true },
    });

    if (!receiver) {
      return NextResponse.json({ error: 'Receiver not found' }, { status: 404 });
    }

    // 수신자가 대기중이거나 관전중이어야 함
    if (receiver.status !== 'WAITING' && receiver.status !== 'SPECTATING') {
      return NextResponse.json(
        { error: 'Receiver is not available for game requests' },
        { status: 400 }
      );
    }

    // 신청자 상태 확인
    const sender = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { id: true, status: true },
    });

    if (!sender || (sender.status !== 'WAITING' && sender.status !== 'SPECTATING')) {
      return NextResponse.json(
        { error: 'You must be waiting or spectating to send game requests' },
        { status: 400 }
      );
    }

    // 게임 타입 검증
    if (!gameType || !ALL_GAME_TYPES[gameType]) {
      return NextResponse.json({ error: 'Invalid game type' }, { status: 400 });
    }

    // 보드 크기 검증
    const gameTypeData = ALL_GAME_TYPES[gameType];
    if (!gameTypeData.boardSizes.includes(boardSize)) {
      return NextResponse.json(
        { error: `Invalid board size. Valid sizes: ${gameTypeData.boardSizes.join(', ')}` },
        { status: 400 }
      );
    }

    // 중복 신청 확인 (대기중인 신청이 있는지)
    const existingRequest = await prisma.gameRequest.findFirst({
      where: {
        senderId: user.userId,
        receiverId,
        status: 'PENDING',
      },
    });

    if (existingRequest) {
      return NextResponse.json(
        { error: 'You already have a pending request to this user' },
        { status: 400 }
      );
    }

    // 대국 신청 생성
    const gameRequest = await prisma.gameRequest.create({
      data: {
        senderId: user.userId,
        receiverId,
        gameType,
        boardSize,
        timeLimit: timeLimit || 1800,
        status: 'PENDING',
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarId: true,
          },
        },
      },
    });

    // Socket.io로 수신자에게 알림
    try {
      const { getSocketServer } = await import('@/server/socket/index');
      const io = getSocketServer();
      if (io) {
        io.to(`user:${receiverId}`).emit('game:request-received', gameRequest);
      }
    } catch (error) {
      console.error('Failed to emit socket event:', error);
    }

    return NextResponse.json({ request: gameRequest });
  } catch (error) {
    console.error('Create game request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

