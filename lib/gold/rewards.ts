/**
 * 골드 보상 시스템
 */

const GOLD_REWARDS = {
  WIN: 100,      // 승리 시
  LOSS: 30,      // 패배 시
  DRAW: 50,      // 무승부 시
};

/**
 * 게임 종료 시 골드 보상 지급
 */
export async function awardGoldAfterGame(
  gameId: string,
  result: 'PLAYER1_WIN' | 'PLAYER2_WIN' | 'DRAW' | 'TIMEOUT',
  player1Id: string,
  player2Id: string | null
): Promise<void> {
  const { prisma } = await import('@/lib/prisma');

  // AI 대결은 골드 지급 안 함
  if (!player2Id) {
    return;
  }

  let player1Gold = 0;
  let player2Gold = 0;

  switch (result) {
    case 'PLAYER1_WIN':
      player1Gold = GOLD_REWARDS.WIN;
      player2Gold = GOLD_REWARDS.LOSS;
      break;
    case 'PLAYER2_WIN':
      player1Gold = GOLD_REWARDS.LOSS;
      player2Gold = GOLD_REWARDS.WIN;
      break;
    case 'DRAW':
    case 'TIMEOUT':
      player1Gold = GOLD_REWARDS.DRAW;
      player2Gold = GOLD_REWARDS.DRAW;
      break;
  }

  // 골드 지급
  await prisma.user.update({
    where: { id: player1Id },
    data: {
      gold: {
        increment: player1Gold,
      },
    },
  });

  await prisma.user.update({
    where: { id: player2Id },
    data: {
      gold: {
        increment: player2Gold,
      },
    },
  });
}

