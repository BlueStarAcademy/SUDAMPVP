import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { gameManager } from '@/lib/game/gameManager';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const user = requireAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { gameId } = await params;
    let game = gameManager.getGame(gameId);

    // If not in memory, try to load from database
    if (!game) {
      game = await gameManager.loadGame(gameId);
    }

    if (!game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    // Get player info from database
    const { prisma } = await import('@/lib/prisma');
    const dbGame = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        player1: {
          select: {
            id: true,
            username: true,
          },
        },
        player2: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    return NextResponse.json({
      game: {
        ...game,
        gameType: dbGame?.gameType || game.gameType,
        boardSize: dbGame?.boardSize || game.boardSize,
        player1: dbGame?.player1,
        player2: dbGame?.player2,
      },
    });
  } catch (error) {
    console.error('Get game error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

