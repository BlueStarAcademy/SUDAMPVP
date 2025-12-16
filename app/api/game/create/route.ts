import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { gameManager } from '@/lib/game/gameManager';
import { getCurrentSeason } from '@/lib/season/seasonManager';
import { prisma } from '@/lib/prisma';

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
    const { mode, opponentId, aiType, aiLevel } = body;

    if (!mode || (mode !== 'STRATEGY' && mode !== 'PLAY')) {
      return NextResponse.json(
        { error: 'Invalid mode. Must be STRATEGY or PLAY' },
        { status: 400 }
      );
    }

    // Validate: either opponentId or aiType, not both
    if (opponentId && aiType) {
      return NextResponse.json(
        { error: 'Cannot specify both opponent and AI' },
        { status: 400 }
      );
    }

    // Validate aiLevel if aiType is gnugo
    if (aiType === 'gnugo' && aiLevel) {
      if (aiLevel < 1 || aiLevel > 10) {
        return NextResponse.json(
          { error: 'AI level must be between 1 and 10' },
          { status: 400 }
        );
      }
    }

    const currentSeason = getCurrentSeason();
    const timeLimit = 1800; // 30 minutes default

    // Get user's current AI level if playing against AI
    let userAILevel = aiLevel;
    if (aiType === 'gnugo' && !userAILevel) {
      const { getCurrentLevel } = await import('@/lib/ai/progress');
      userAILevel = await getCurrentLevel(user.userId);
    }

    // Create game
    const game = await gameManager.createGame(
      user.userId,
      mode as 'STRATEGY' | 'PLAY',
      currentSeason.season,
      timeLimit,
      opponentId || undefined,
      aiType || undefined,
      userAILevel || undefined
    );

    // If opponent is specified, start the game immediately
    if (opponentId || aiType) {
      await gameManager.startGame(game.id);
    }

    return NextResponse.json({ gameId: game.id, game });
  } catch (error) {
    console.error('Create game error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

