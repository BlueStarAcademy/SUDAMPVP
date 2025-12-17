import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const user = requireAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('mode') as 'STRATEGY' | 'PLAY' | null;

    const where: any = {
      status: 'IN_PROGRESS',
    };

    if (mode && (mode === 'STRATEGY' || mode === 'PLAY')) {
      where.mode = mode;
    }

    const games = await prisma.game.findMany({
      where,
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
        _count: {
          select: {
            spectators: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    return NextResponse.json({
      games: games.map((game) => ({
        id: game.id,
        gameType: game.gameType,
        boardSize: game.boardSize,
        mode: game.mode,
        player1: game.player1,
        player2: game.player2,
        aiType: game.aiType,
        status: game.status,
        createdAt: game.createdAt.toISOString(),
        _count: game._count,
      })),
    });
  } catch (error) {
    console.error('Get ongoing games error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

