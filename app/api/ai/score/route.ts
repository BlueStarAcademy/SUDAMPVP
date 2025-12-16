import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { getAIScoring } from '@/lib/ai/aiManager';
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

    // Verify user is part of the game or spectator
    if (game.player1Id !== user.userId && game.player2Id !== user.userId) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }

    const scoring = await getAIScoring({
      boardState: game.boardState,
      currentPlayer: game.currentPlayer,
    });

    if (!scoring) {
      return NextResponse.json(
        { error: 'Failed to get scoring' },
        { status: 500 }
      );
    }

    return NextResponse.json({ scoring });
  } catch (error) {
    console.error('AI scoring error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

