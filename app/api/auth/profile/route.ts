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
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // 전적 조회 (현재 시즌)
    const currentSeason = Math.floor((new Date().getMonth() + 3) / 3); // 분기별 시즌
    const ratings = await prisma.rating.findMany({
      where: {
        userId: payload.userId,
        season: currentSeason,
      },
    });

    // 게임 통계
    const [wins, losses, draws] = await Promise.all([
      prisma.game.count({
        where: {
          OR: [
            { player1Id: payload.userId, winnerId: payload.userId },
            { player2Id: payload.userId, winnerId: payload.userId },
          ],
          status: 'FINISHED',
        },
      }),
      prisma.game.count({
        where: {
          OR: [
            { player1Id: payload.userId, winnerId: { not: payload.userId } },
            { player2Id: payload.userId, winnerId: { not: payload.userId } },
          ],
          status: 'FINISHED',
        },
      }),
      prisma.game.count({
        where: {
          OR: [{ player1Id: payload.userId }, { player2Id: payload.userId }],
          status: 'FINISHED',
          result: 'DRAW',
        },
      }),
    ]);

    return NextResponse.json({
      user,
      stats: {
        wins,
        losses,
        draws,
        total: wins + losses + draws,
      },
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

