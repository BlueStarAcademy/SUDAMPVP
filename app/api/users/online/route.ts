import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentSeason } from '@/lib/season/seasonManager';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('mode') as 'STRATEGY' | 'PLAY' | null;
    
    // 온라인 유저 목록 조회 (상태 포함)
    const onlineSessions = await prisma.session.findMany({
      where: {
        isOnline: true,
        lastSeen: {
          gte: new Date(Date.now() - 5 * 60 * 1000), // 최근 5분 이내
        },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            status: true,
          },
        },
      },
    });

    // 중복 제거 (같은 유저의 여러 세션)
    const userMap = new Map();
    const userIds: string[] = [];
    
    onlineSessions.forEach((session) => {
      const userId = session.user.id;
      if (!userMap.has(userId)) {
        userMap.set(userId, {
          id: session.user.id,
          username: session.user.username,
          nickname: session.user.nickname,
          status: session.user.status || 'WAITING',
        });
        userIds.push(userId);
      }
    });

    // 레이팅 정보 가져오기 (mode가 제공된 경우)
    const ratingsMap = new Map<string, number>();
    if (mode && (mode === 'STRATEGY' || mode === 'PLAY')) {
      const currentSeason = getCurrentSeason();
      const ratings = await prisma.rating.findMany({
        where: {
          userId: { in: userIds },
          season: currentSeason.season,
          mode: mode as any,
        },
        select: {
          userId: true,
          rating: true,
        },
      });

      ratings.forEach((rating) => {
        ratingsMap.set(rating.userId, rating.rating);
      });
    }

    // 유저 목록에 레이팅 정보 추가
    const users = Array.from(userMap.values()).map((user: any) => {
      const rating = ratingsMap.get(user.id);
      return {
        ...user,
        rating: rating !== undefined ? rating : 1500, // 기본값 1500
      };
    });

    return NextResponse.json({
      users,
    });
  } catch (error) {
    console.error('Get online users error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
