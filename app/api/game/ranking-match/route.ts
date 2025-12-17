import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { prisma } from '@/lib/prisma';
import { getCurrentSeason } from '@/lib/season/seasonManager';
import { getUserRating } from '@/lib/rating/ratingManager';
import { STRATEGY_GAME_TYPES, ALL_GAME_TYPES } from '@/lib/game/types';
import { gameManager } from '@/lib/game/gameManager';

const RATING_DIFFERENCE_THRESHOLD = 200; // 최대 점수 차이

export async function POST(request: NextRequest) {
  try {
    const user = requireAuth(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { gameType, boardSize } = body;

    if (!gameType || !ALL_GAME_TYPES[gameType]) {
      return NextResponse.json({ error: 'Invalid game type' }, { status: 400 });
    }

    // 게임 모드 결정
    const isStrategy = gameType in STRATEGY_GAME_TYPES;
    const mode = isStrategy ? 'STRATEGY' : 'PLAY';

    // 현재 시즌 및 사용자 랭킹 조회
    const currentSeason = getCurrentSeason();
    const userRating = await getUserRating(user.userId, currentSeason.season, mode);

    // 이미 대기 중인지 확인
    const existingQueue = await prisma.rankingMatchQueue.findUnique({
      where: { userId: user.userId },
    });

    if (existingQueue) {
      return NextResponse.json(
        { error: 'Already in matchmaking queue' },
        { status: 400 }
      );
    }

    // 매칭 큐에 추가
    await prisma.rankingMatchQueue.create({
      data: {
        userId: user.userId,
        gameType,
        boardSize: boardSize || 19,
        rating: userRating.rating,
      },
    });

    // 5초 후 매칭 시도
    setTimeout(async () => {
      await tryMatchmaking(user.userId, gameType, boardSize || 19, mode, userRating.rating);
    }, 5000);

    return NextResponse.json({ 
      success: true, 
      message: 'Matchmaking started. Waiting for opponent...' 
    });
  } catch (error) {
    console.error('Ranking match error:', error);
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
    // 큐에서 자신 제외하고 비슷한 점수의 상대 찾기
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
        joinedAt: 'asc', // 먼저 대기한 사람 우선
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
      // 매칭 실패 - 큐에 남아있음 (나중에 다시 시도)
      return null;
    }

    const opponent = candidates[0];

      // 상대방이 대기중이거나 관전중인지 확인
      if (opponent.user.status !== 'WAITING' && opponent.user.status !== 'SPECTATING') {
        // 상대방 큐에서 제거
        await prisma.rankingMatchQueue.delete({
          where: { userId: opponent.userId },
        });
        return null;
      }

    // 게임 생성
    // 대국 이용권 확인 및 사용
    const { useGameTicket } = await import('@/lib/tickets/recovery');
    const player1HasTicket = await useGameTicket(userId);
    const player2HasTicket = await useGameTicket(opponent.userId);

    if (!player1HasTicket || !player2HasTicket) {
      // 이용권 부족 시 큐에서 제거
      await prisma.rankingMatchQueue.deleteMany({
        where: {
          userId: { in: [userId, opponent.userId] },
        },
      });
      return null;
    }

    const currentSeason = getCurrentSeason();
    const timeLimit = 1800; // 30분

    const game = await gameManager.createGame(
      userId,
      mode,
      currentSeason.season,
      timeLimit,
      opponent.userId,
      undefined, // aiType
      undefined, // aiLevel
      gameType,
      boardSize,
      undefined // gameRules
    );

    // 게임 시작
    await gameManager.startGame(game.id);

    // 양쪽 모두 큐에서 제거
    await prisma.rankingMatchQueue.deleteMany({
      where: {
        userId: { in: [userId, opponent.userId] },
      },
    });

    // Socket.io로 양쪽에 알림
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

// 매칭 취소
export async function DELETE(request: NextRequest) {
  try {
    const user = requireAuth(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await prisma.rankingMatchQueue.deleteMany({
      where: { userId: user.userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Cancel matchmaking error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

