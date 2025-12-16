/**
 * GnuGo 단계별 진행도 관리
 */

import { prisma } from '@/lib/prisma';

const MAX_LEVEL = 10;
const MIN_LEVEL = 1;

/**
 * Get or create AI progress for user
 */
export async function getOrCreateAIProgress(userId: string) {
  let progress = await prisma.aIProgress.findUnique({
    where: { userId },
  });

  if (!progress) {
    progress = await prisma.aIProgress.create({
      data: {
        userId,
        currentLevel: 1,
        highestLevel: 1,
        wins: 0,
        losses: 0,
      },
    });
  }

  return progress;
}

/**
 * Update AI progress after game
 */
export async function updateAIProgress(
  userId: string,
  won: boolean,
  level: number
): Promise<{ levelUp: boolean; newLevel: number }> {
  const progress = await getOrCreateAIProgress(userId);
  let newLevel = progress.currentLevel;
  let levelUp = false;

  if (won) {
    // 승리 시 승리 횟수 증가
    await prisma.aIProgress.update({
      where: { userId },
      data: {
        wins: progress.wins + 1,
      },
    });

    // 현재 레벨에서 승리했고, 다음 레벨이 있으면 레벨업
    if (level === progress.currentLevel && progress.currentLevel < MAX_LEVEL) {
      newLevel = progress.currentLevel + 1;
      levelUp = true;

      await prisma.aIProgress.update({
        where: { userId },
        data: {
          currentLevel: newLevel,
          highestLevel: Math.max(progress.highestLevel, newLevel),
        },
      });
    }
  } else {
    // 패배 시 패배 횟수 증가
    await prisma.aIProgress.update({
      where: { userId },
      data: {
        losses: progress.losses + 1,
      },
    });
  }

  return { levelUp, newLevel };
}

/**
 * Get current level for user
 */
export async function getCurrentLevel(userId: string): Promise<number> {
  const progress = await getOrCreateAIProgress(userId);
  return progress.currentLevel;
}

