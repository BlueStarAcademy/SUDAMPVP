import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { getAIMove } from '@/lib/ai/aiManager';
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
    const { gameId, aiType } = body;

    if (!gameId || !aiType) {
      return NextResponse.json(
        { error: 'gameId and aiType are required' },
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

    const move = await getAIMove({
      boardState: game.boardState,
      currentPlayer: game.currentPlayer,
      aiType: 'gnugo', // KataGo는 대결에 사용하지 않음
      aiLevel: game.aiLevel || undefined,
    });

    if (!move) {
      return NextResponse.json(
        { error: 'Failed to get AI move' },
        { status: 500 }
      );
    }

    return NextResponse.json({ move });
  } catch (error) {
    console.error('AI move error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

