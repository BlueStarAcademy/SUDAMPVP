import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { getHint } from '@/lib/ai/hint';
import { gameManager } from '@/lib/game/gameManager';

export async function POST(request: NextRequest) {
  try {
    const user = requireAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { gameId } = body;

    if (!gameId) {
      return NextResponse.json(
        { error: 'gameId is required' },
        { status: 400 }
      );
    }

    const game = gameManager.getGame(gameId);
    if (!game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    // Verify user is part of the game
    if (game.player1Id !== user.userId && game.player2Id !== user.userId) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }

    const hint = await getHint({
      boardState: game.boardState,
      currentPlayer: game.currentPlayer,
    });

    if (!hint) {
      return NextResponse.json(
        { error: 'Failed to get hint' },
        { status: 500 }
      );
    }

    return NextResponse.json({ hint });
  } catch (error) {
    console.error('AI hint error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

