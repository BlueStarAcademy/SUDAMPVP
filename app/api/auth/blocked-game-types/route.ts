import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromRequest, verifyToken } from '@/lib/auth';
import { ALL_GAME_TYPES } from '@/lib/game/types';

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

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { blockedGameTypes: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const blockedTypes = Array.isArray(user.blockedGameTypes)
      ? (user.blockedGameTypes as string[])
      : [];

    return NextResponse.json({ blockedGameTypes: blockedTypes });
  } catch (error) {
    console.error('Get blocked game types error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
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

    const body = await request.json();
    const { blockedGameTypes } = body;

    // 검증: 배열인지 확인
    if (!Array.isArray(blockedGameTypes)) {
      return NextResponse.json(
        { error: 'blockedGameTypes must be an array' },
        { status: 400 }
      );
    }

    // 검증: 모든 게임 타입이 유효한지 확인
    for (const gameType of blockedGameTypes) {
      if (typeof gameType !== 'string' || !ALL_GAME_TYPES[gameType]) {
        return NextResponse.json(
          { error: `Invalid game type: ${gameType}` },
          { status: 400 }
        );
      }
    }

    // 업데이트
    const user = await prisma.user.update({
      where: { id: payload.userId },
      data: { blockedGameTypes: blockedGameTypes },
      select: { blockedGameTypes: true },
    });

    return NextResponse.json({
      success: true,
      blockedGameTypes: Array.isArray(user.blockedGameTypes)
        ? (user.blockedGameTypes as string[])
        : [],
    });
  } catch (error) {
    console.error('Update blocked game types error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

