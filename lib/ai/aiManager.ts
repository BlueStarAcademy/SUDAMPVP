import { getGnuGoMove, checkGnuGoServer, GnuGoRequest } from './gnugo';
import { getKataGoMove, getKataGoScoring, checkKataGoServer, KataGoScoringRequest } from './katago';
import { BoardState } from '../game/board';

export type AIType = 'gnugo' | 'katago';

export interface AIMoveRequest {
  boardState: BoardState;
  currentPlayer: 1 | 2; // 1 = black, 2 = white
  aiType: 'gnugo'; // KataGo는 대결에 사용하지 않음
  aiLevel?: number; // GnuGo 난이도 (1-10)
}

export interface AIScoringRequest {
  boardState: BoardState;
  currentPlayer: 1 | 2;
}

/**
 * Convert board state to AI format
 */
function boardStateToAIFormat(boardState: BoardState): string[][] {
  const boardSize = boardState.boardSize || 19;
  const board: string[][] = [];
  for (let i = 0; i < boardSize; i++) {
    board[i] = [];
    for (let j = 0; j < boardSize; j++) {
      const stone = boardState.board[i]?.[j];
      if (stone === 'black') {
        board[i][j] = 'B';
      } else if (stone === 'white') {
        board[i][j] = 'W';
      } else {
        board[i][j] = '';
      }
    }
  }
  return board;
}

/**
 * Get AI move (GnuGo only for battles)
 */
export async function getAIMove(request: AIMoveRequest): Promise<{ x: number; y: number } | null> {
  const board = boardStateToAIFormat(request.boardState);
  const currentPlayer: 'black' | 'white' = request.currentPlayer === 1 ? 'black' : 'white';

  const aiRequest: GnuGoRequest = {
    board,
    currentPlayer,
    moveHistory: request.boardState.moveHistory.map((move) => ({
      x: move.position?.x || -1,
      y: move.position?.y || -1,
      player: (move.player === 1 ? 'black' : 'white') as 'black' | 'white',
    })),
    level: request.aiLevel || 5, // 기본 난이도 5
  };

  // GnuGo만 대결에 사용
  if (request.aiType === 'gnugo') {
    const move = await getGnuGoMove(aiRequest);
    if (move && !move.pass) {
      return { x: move.x, y: move.y };
    }
  }

  return null;
}

/**
 * Get scoring from KataGo
 */
export async function getAIScoring(
  request: AIScoringRequest
): Promise<{ winner: 1 | 2; score: number } | null> {
  const board = boardStateToAIFormat(request.boardState);
  const currentPlayer: 'black' | 'white' = request.currentPlayer === 1 ? 'black' : 'white';

  const scoringRequest: KataGoScoringRequest = {
    board,
    currentPlayer,
    moveHistory: request.boardState.moveHistory.map((move) => ({
      x: move.position?.x || -1,
      y: move.position?.y || -1,
      player: (move.player === 1 ? 'black' : 'white') as 'black' | 'white',
    })),
  };

  const result = await getKataGoScoring(scoringRequest);
  if (!result) {
    return null;
  }

  return {
    winner: result.winner === 'black' ? 1 : 2,
    score: result.score,
  };
}

/**
 * Check AI server availability
 */
export async function checkAIServers(): Promise<{ gnugo: boolean; katago: boolean }> {
  const [gnugo, katago] = await Promise.all([
    checkGnuGoServer(),
    checkKataGoServer(),
  ]);

  return { gnugo, katago };
}

