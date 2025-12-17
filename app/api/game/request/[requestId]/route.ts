import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware';
import { prisma } from '@/lib/prisma';
import { gameManager } from '@/lib/game/gameManager';
import { getCurrentSeason } from '@/lib/season/seasonManager';
import { STRATEGY_GAME_TYPES } from '@/lib/game/types';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const user = requireAuth(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { requestId } = await params;
    const body = await request.json();
    const { action, modifiedConditions } = body; // action: 'accept', 'reject', 'modify'

    // 대국 신청 조회
    const gameRequest = await prisma.gameRequest.findUnique({
      where: { id: requestId },
      include: {
        sender: true,
        receiver: true,
      },
    });

    if (!gameRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // 수신자만 응답 가능
    if (gameRequest.receiverId !== user.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 이미 응답된 신청
    if (gameRequest.status !== 'PENDING') {
      return NextResponse.json({ error: 'Request already responded' }, { status: 400 });
    }

    if (action === 'accept') {
      // 게임 생성
      const currentSeason = getCurrentSeason();
      const isStrategy = gameRequest.gameType in STRATEGY_GAME_TYPES;
      const game = await gameManager.createGame(
        gameRequest.senderId,
        isStrategy ? 'STRATEGY' : 'PLAY',
        currentSeason.season,
        gameRequest.timeLimit,
        gameRequest.receiverId,
        undefined, // aiType
        undefined, // aiLevel
        gameRequest.gameType,
        gameRequest.boardSize,
        undefined // gameRules
      );

      // 게임 시작
      await gameManager.startGame(game.id);

      // 신청 상태 업데이트
      await prisma.gameRequest.update({
        where: { id: requestId },
        data: {
          status: 'ACCEPTED',
          respondedAt: new Date(),
        },
      });

      return NextResponse.json({ gameId: game.id, game });
    } else if (action === 'reject') {
      await prisma.gameRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          respondedAt: new Date(),
        },
      });

      return NextResponse.json({ success: true });
    } else if (action === 'modify') {
      if (!modifiedConditions) {
        return NextResponse.json({ error: 'Modified conditions required' }, { status: 400 });
      }

      await prisma.gameRequest.update({
        where: { id: requestId },
        data: {
          status: 'MODIFIED',
          modifiedConditions: modifiedConditions,
          respondedAt: new Date(),
        },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Respond to game request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

