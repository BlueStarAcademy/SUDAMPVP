import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { prisma } from '@/lib/prisma';
import { getSocketServer } from '@/server/socket/index';

// 채팅 메시지 전송
export async function POST(request: NextRequest) {
  try {
    const user = requireAuth(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { message, gameId, type } = body;

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (message.length > 500) {
      return NextResponse.json(
        { error: 'Message is too long (max 500 characters)' },
        { status: 400 }
      );
    }

    const chatType = type === 'GAME' ? 'GAME' : 'GLOBAL';

    // 채팅 메시지 저장
    const chatMessage = await prisma.chatMessage.create({
      data: {
        userId: user.userId,
        gameId: chatType === 'GAME' ? gameId : null,
        type: chatType,
        message: message.trim(),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarId: true,
          },
        },
      },
    });

    // Socket.io로 브로드캐스트
    try {
      const io = getSocketServer();
      if (io) {
        if (chatType === 'GAME' && gameId) {
          // 대국실 채팅
          io.to(`game:${gameId}`).emit('chat:message', chatMessage);
        } else {
          // 전체 채팅
          io.to('lobby').emit('chat:message', chatMessage);
        }
      }
    } catch (error) {
      console.error('Failed to emit chat message:', error);
    }

    return NextResponse.json({ message: chatMessage });
  } catch (error) {
    console.error('Send chat message error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// 채팅 메시지 조회
export async function GET(request: NextRequest) {
  try {
    const user = requireAuth(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') as 'GLOBAL' | 'GAME' | null;
    const gameId = searchParams.get('gameId');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = {};
    if (type === 'GAME' && gameId) {
      where.gameId = gameId;
      where.type = 'GAME';
    } else {
      where.type = 'GLOBAL';
    }

    const messages = await prisma.chatMessage.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            avatarId: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return NextResponse.json({
      messages: messages.reverse(), // 오래된 순서로 정렬
    });
  } catch (error) {
    console.error('Get chat messages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

