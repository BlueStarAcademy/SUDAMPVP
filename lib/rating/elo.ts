/**
 * ELO rating system for Baduk games
 */

const K_FACTOR = 32; // Standard K-factor for ELO

/**
 * Calculate expected score (probability of winning)
 */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Calculate new ELO rating after a game
 * @param currentRating Current ELO rating
 * @param opponentRating Opponent's ELO rating
 * @param actualScore 1 for win, 0.5 for draw, 0 for loss
 * @param kFactor K-factor (default: 32)
 * @returns New ELO rating
 */
export function calculateNewRating(
  currentRating: number,
  opponentRating: number,
  actualScore: number,
  kFactor: number = K_FACTOR
): number {
  const expected = expectedScore(currentRating, opponentRating);
  const newRating = currentRating + kFactor * (actualScore - expected);
  return Math.round(newRating);
}

/**
 * Calculate rating changes for both players
 */
export function calculateRatingChanges(
  player1Rating: number,
  player2Rating: number,
  result: 'PLAYER1_WIN' | 'PLAYER2_WIN' | 'DRAW' | 'TIMEOUT'
): { player1New: number; player2New: number; player1Change: number; player2Change: number } {
  let player1Score: number;
  let player2Score: number;

  switch (result) {
    case 'PLAYER1_WIN':
      player1Score = 1;
      player2Score = 0;
      break;
    case 'PLAYER2_WIN':
      player1Score = 0;
      player2Score = 1;
      break;
    case 'DRAW':
    case 'TIMEOUT':
      player1Score = 0.5;
      player2Score = 0.5;
      break;
  }

  const player1New = calculateNewRating(player1Rating, player2Rating, player1Score);
  const player2New = calculateNewRating(player2Rating, player1Rating, player2Score);

  return {
    player1New,
    player2New,
    player1Change: player1New - player1Rating,
    player2Change: player2New - player2Rating,
  };
}

