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
    const { mode, opponentId, aiType, aiLevel, gameType, boardSize } = body;

    if (!mode || (mode !== 'STRATEGY' && mode !== 'PLAY')) {
      return NextResponse.json(
        { error: 'Invalid mode. Must be STRATEGY or PLAY' },
        { status: 400 }
      );
    }

    // Validate gameType if provided
    if (gameType) {
      const { ALL_GAME_TYPES, STRATEGY_GAME_TYPES, PLAY_GAME_TYPES } = await import('@/lib/game/types');
      
      if (!ALL_GAME_TYPES[gameType]) {
        return NextResponse.json(
          { error: 'Invalid game type' },
          { status: 400 }
        );
      }

      // Validate mode matches gameType
      const isStrategyGame = gameType in STRATEGY_GAME_TYPES;
      const isPlayGame = gameType in PLAY_GAME_TYPES;
      
      if (mode === 'STRATEGY' && !isStrategyGame) {
        return NextResponse.json(
          { error: 'Game type does not match mode (STRATEGY)' },
          { status: 400 }
        );
      }
      
      if (mode === 'PLAY' && !isPlayGame) {
        return NextResponse.json(
          { error: 'Game type does not match mode (PLAY)' },
          { status: 400 }
        );
      }

      // Validate boardSize if provided
      if (boardSize) {
        const validBoardSizes = ALL_GAME_TYPES[gameType].boardSizes;
        if (!validBoardSizes.includes(boardSize)) {
          return NextResponse.json(
            { error: `Invalid board size. Valid sizes for ${gameType}: ${validBoardSizes.join(', ')}` },
            { status: 400 }
          );
        }
      }
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
      userAILevel || undefined,
      gameType || undefined,
      boardSize || undefined,
      undefined // gameRules (추후 구현)
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

