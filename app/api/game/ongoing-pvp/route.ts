import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // 진행중인 PVP 게임 조회 (AI 대결 제외, player2Id가 있는 게임만)
    const games = await prisma.game.findMany({
      where: {
        status: 'IN_PROGRESS',
        player2Id: { not: null }, // 유저간 대결만
        aiType: null, // AI 대결 제외
      },
      include: {
        player1: {
          select: {
            id: true,
            username: true,
            nickname: true,
          },
        },
        player2: {
          select: {
            id: true,
            username: true,
            nickname: true,
          },
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
      take: 20, // 최대 20개
    });

    return NextResponse.json({
      games: games.map((game) => ({
        id: game.id,
        gameType: game.gameType,
        boardSize: game.boardSize,
        player1: {
          id: game.player1.id,
          username: game.player1.username,
          nickname: game.player1.nickname,
        },
        player2: game.player2
          ? {
              id: game.player2.id,
              username: game.player2.username,
              nickname: game.player2.nickname,
            }
          : null,
        status: game.status,
        startedAt: game.startedAt?.toISOString() || null,
      })),
    });
  } catch (error) {
    console.error('Get ongoing PVP games error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

