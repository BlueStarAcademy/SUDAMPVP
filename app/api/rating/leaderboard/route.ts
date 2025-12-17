import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSeason } from '@/lib/season/seasonManager';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') as 'STRATEGY' | 'PLAY' | null;
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    if (!mode || (mode !== 'STRATEGY' && mode !== 'PLAY')) {
      return NextResponse.json(
        { error: 'Invalid mode. Must be STRATEGY or PLAY' },
        { status: 400 }
      );
    }

    const currentSeason = getCurrentSeason();

    const rankings = await prisma.rating.findMany({
      where: {
        season: currentSeason.season,
        mode: mode as any,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
          },
        },
      },
      orderBy: {
        rating: 'desc',
      },
      take: limit,
    });

    return NextResponse.json({
      rankings: rankings.map((r) => ({
        id: r.id,
        rating: r.rating,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
        user: r.user,
      })),
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

