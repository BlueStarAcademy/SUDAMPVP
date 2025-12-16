import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/middleware';

export async function GET(request: NextRequest) {
  try {
    const user = requireAuth(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get all online users (distinct by userId)
    const sessions = await prisma.session.findMany({
      where: { isOnline: true },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
      orderBy: {
        lastSeen: 'desc',
      },
    });

    // Get distinct users
    const userMap = new Map();
    sessions.forEach((session) => {
      if (!userMap.has(session.userId)) {
        userMap.set(session.userId, {
          id: session.user.id,
          username: session.user.username,
          socketId: session.socketId,
          lastSeen: session.lastSeen,
        });
      }
    });

    const onlineUsers = Array.from(userMap.values());

    return NextResponse.json({ users: onlineUsers });
  } catch (error) {
    console.error('Get online users error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

