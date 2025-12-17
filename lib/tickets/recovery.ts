/**
 * 대국 이용권 회복 시스템
 */

const TICKET_RECOVERY_INTERVAL = 2 * 60 * 60 * 1000; // 2시간 (밀리초)
const MAX_TICKETS = 10;

/**
 * 이용권 회복 처리
 */
export async function recoverGameTickets(userId: string): Promise<{
  recovered: number;
  currentTickets: number;
}> {
  const { prisma } = await import('@/lib/prisma');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      gameTickets: true,
      lastTicketRecovery: true,
      createdAt: true,
    },
  });

  if (!user) {
    return { recovered: 0, currentTickets: 0 };
  }

  const now = new Date();
  const lastRecovery = user.lastTicketRecovery || user.createdAt;
  const timeSinceLastRecovery = now.getTime() - lastRecovery.getTime();

  // 2시간마다 1개씩 회복
  const ticketsToRecover = Math.floor(timeSinceLastRecovery / TICKET_RECOVERY_INTERVAL);

  if (ticketsToRecover > 0) {
    const newTicketCount = Math.min(user.gameTickets + ticketsToRecover, MAX_TICKETS);
    const actualRecovered = newTicketCount - user.gameTickets;

    await prisma.user.update({
      where: { id: userId },
      data: {
        gameTickets: newTicketCount,
        lastTicketRecovery: now,
      },
    });

    return {
      recovered: actualRecovered,
      currentTickets: newTicketCount,
    };
  }

  return {
    recovered: 0,
    currentTickets: user.gameTickets,
  };
}

/**
 * 이용권 사용 (게임 시작 시)
 */
export async function useGameTicket(userId: string): Promise<boolean> {
  const { prisma } = await import('@/lib/prisma');

  // 먼저 회복 처리
  await recoverGameTickets(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { gameTickets: true },
  });

  if (!user || user.gameTickets <= 0) {
    return false;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      gameTickets: {
        decrement: 1,
      },
    },
  });

  return true;
}

