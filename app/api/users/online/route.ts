import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
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
    onlineSessions.forEach((session) => {
      const userId = session.user.id;
      if (!userMap.has(userId)) {
        userMap.set(userId, {
          id: session.user.id,
          username: session.user.username,
          nickname: session.user.nickname,
          status: session.user.status || 'WAITING',
        });
      }
    });

    return NextResponse.json({
      users: Array.from(userMap.values()),
    });
  } catch (error) {
    console.error('Get online users error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
