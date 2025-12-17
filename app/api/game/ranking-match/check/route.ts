import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { prisma } from '@/lib/prisma';
import { getUserRating } from '@/lib/rating/ratingManager';
import { getCurrentSeason } from '@/lib/season/seasonManager';
import { STRATEGY_GAME_TYPES } from '@/lib/game/types';
import { gameManager } from '@/lib/game/gameManager';

const RATING_DIFFERENCE_THRESHOLD = 200;

export async function GET(request: NextRequest) {
  try {
    const user = requireAuth(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 큐에서 자신 찾기
    const queueEntry = await prisma.rankingMatchQueue.findUnique({
      where: { userId: user.userId },
    });

    if (!queueEntry) {
      return NextResponse.json({ matched: false, inQueue: false });
    }

    // 매칭 시도
    const isStrategy = queueEntry.gameType in STRATEGY_GAME_TYPES;
    const mode = isStrategy ? 'STRATEGY' : 'PLAY';
    const currentSeason = getCurrentSeason();
    const userRating = await getUserRating(user.userId, currentSeason.season, mode);

    const matchResult = await tryMatchmaking(
      user.userId,
      queueEntry.gameType,
      queueEntry.boardSize,
      mode,
      userRating.rating
    );

    if (matchResult?.gameId) {
      return NextResponse.json({
        matched: true,
        gameId: matchResult.gameId,
      });
    }

    return NextResponse.json({ matched: false, inQueue: true });
  } catch (error) {
    console.error('Check matchmaking error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function tryMatchmaking(
  userId: string,
  gameType: string,
  boardSize: number,
  mode: 'STRATEGY' | 'PLAY',
  rating: number
): Promise<{ gameId: string } | null> {
  try {
    const candidates = await prisma.rankingMatchQueue.findMany({
      where: {
        userId: { not: userId },
        gameType,
        boardSize,
        rating: {
          gte: rating - RATING_DIFFERENCE_THRESHOLD,
          lte: rating + RATING_DIFFERENCE_THRESHOLD,
        },
      },
      orderBy: {
        joinedAt: 'asc',
      },
      take: 1,
      include: {
        user: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (candidates.length === 0) {
      return null;
    }

    const opponent = candidates[0];

    if (opponent.user.status !== 'WAITING' && opponent.user.status !== 'SPECTATING') {
      await prisma.rankingMatchQueue.delete({
        where: { userId: opponent.userId },
      });
      return null;
    }

    const currentSeason = getCurrentSeason();
    const timeLimit = 1800;

    const game = await gameManager.createGame(
      userId,
      mode,
      currentSeason.season,
      timeLimit,
      opponent.userId,
      undefined,
      undefined,
      gameType,
      boardSize,
      undefined
    );

    await gameManager.startGame(game.id);

    await prisma.rankingMatchQueue.deleteMany({
      where: {
        userId: { in: [userId, opponent.userId] },
      },
    });

    try {
      const { getSocketServer } = await import('@/server/socket/index');
      const io = getSocketServer();
      if (io) {
        io.to(`user:${userId}`).emit('game:match-found', { gameId: game.id });
        io.to(`user:${opponent.userId}`).emit('game:match-found', { gameId: game.id });
      }
    } catch (error) {
      console.error('Failed to emit match found event:', error);
    }

    return { gameId: game.id };
  } catch (error) {
    console.error('Matchmaking error:', error);
    return null;
  }
}

