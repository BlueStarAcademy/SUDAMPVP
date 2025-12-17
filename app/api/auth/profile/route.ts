import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // 사용자 정보 및 전적 조회
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        avatarId: true,
        hasCompletedSetup: true,
        status: true,
        gold: true,
        gameTickets: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // 전략바둑 통합 전적
    const strategyGames = await prisma.game.findMany({
      where: {
        OR: [{ player1Id: payload.userId }, { player2Id: payload.userId }],
        mode: 'STRATEGY',
        status: 'FINISHED',
        aiType: null, // AI 대결 제외
      },
    });

    const strategyStats = {
      wins: strategyGames.filter(
        (g) => g.winnerId === payload.userId
      ).length,
      losses: strategyGames.filter(
        (g) => g.winnerId && g.winnerId !== payload.userId
      ).length,
      draws: strategyGames.filter((g) => g.result === 'DRAW' || g.result === 'TIMEOUT').length,
    };
    strategyStats.total = strategyStats.wins + strategyStats.losses + strategyStats.draws;

    // 놀이바둑 통합 전적
    const playGames = await prisma.game.findMany({
      where: {
        OR: [{ player1Id: payload.userId }, { player2Id: payload.userId }],
        mode: 'PLAY',
        status: 'FINISHED',
        aiType: null, // AI 대결 제외
      },
    });

    const playStats = {
      wins: playGames.filter((g) => g.winnerId === payload.userId).length,
      losses: playGames.filter(
        (g) => g.winnerId && g.winnerId !== payload.userId
      ).length,
      draws: playGames.filter((g) => g.result === 'DRAW' || g.result === 'TIMEOUT').length,
    };
    playStats.total = playStats.wins + playStats.losses + playStats.draws;

    // 게임 타입별 상세 전적
    const gameStats = await prisma.gameStats.findMany({
      where: { userId: payload.userId },
    });

    // 전적 조회 (현재 시즌)
    const currentSeason = Math.floor((new Date().getMonth() + 3) / 3); // 분기별 시즌
    const ratings = await prisma.rating.findMany({
      where: {
        userId: payload.userId,
        season: currentSeason,
      },
    });

    return NextResponse.json({
      user,
      strategyStats,
      playStats,
      gameStats: gameStats.map((gs) => ({
        gameType: gs.gameType,
        mode: gs.mode,
        wins: gs.wins,
        losses: gs.losses,
        draws: gs.draws,
        total: gs.wins + gs.losses + gs.draws,
      })),
      ratings: ratings.map((r) => ({
        mode: r.mode,
        rating: r.rating,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
      })),
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

