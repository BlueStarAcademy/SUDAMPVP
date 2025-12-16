import { prisma } from '@/lib/prisma';
import { calculateRatingChanges } from './elo';
import { getOrCreateRating } from '../season/seasonManager';
import { GameResult } from '@prisma/client';

/**
 * Update ratings after a game finishes
 */
export async function updateRatingsAfterGame(
  gameId: string,
  result: GameResult
): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      player1: true,
      player2: true,
    },
  });

  if (!game || !game.player2Id) {
    // AI game or invalid game - skip rating update
    return;
  }

  const season = game.season;
  const mode = game.mode;

  // Get or create ratings for both players
  const player1Rating = await getOrCreateRating(game.player1Id, season, mode);
  const player2Rating = await getOrCreateRating(game.player2Id, season, mode);

  // Calculate new ratings
  const changes = calculateRatingChanges(
    player1Rating.rating,
    player2Rating.rating,
    result
  );

  // Determine wins/losses/draws
  let player1Wins = player1Rating.wins;
  let player1Losses = player1Rating.losses;
  let player1Draws = player1Rating.draws;
  let player2Wins = player2Rating.wins;
  let player2Losses = player2Rating.losses;
  let player2Draws = player2Rating.draws;

  switch (result) {
    case 'PLAYER1_WIN':
      player1Wins++;
      player2Losses++;
      break;
    case 'PLAYER2_WIN':
      player1Losses++;
      player2Wins++;
      break;
    case 'DRAW':
    case 'TIMEOUT':
      player1Draws++;
      player2Draws++;
      break;
  }

  // Update ratings
  await prisma.rating.update({
    where: { id: player1Rating.id },
    data: {
      rating: changes.player1New,
      wins: player1Wins,
      losses: player1Losses,
      draws: player1Draws,
    },
  });

  await prisma.rating.update({
    where: { id: player2Rating.id },
    data: {
      rating: changes.player2New,
      wins: player2Wins,
      losses: player2Losses,
      draws: player2Draws,
    },
  });
}

/**
 * Get user's rating for current season
 */
export async function getUserRating(
  userId: string,
  season: number,
  mode: 'STRATEGY' | 'PLAY'
) {
  return await getOrCreateRating(userId, season, mode);
}

/**
 * Get user's rating history
 */
export async function getUserRatingHistory(
  userId: string,
  mode: 'STRATEGY' | 'PLAY',
  limit: number = 10
) {
  return await prisma.rating.findMany({
    where: {
      userId,
      mode: mode as any,
    },
    orderBy: {
      season: 'desc',
    },
    take: limit,
  });
}

