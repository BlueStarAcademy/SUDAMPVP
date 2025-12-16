/**
 * KataGo 힌트 기능
 * 대결이 아닌 힌트 제공용
 */

import { getKataGoMove, KataGoRequest } from './katago';
import { BoardState } from '../game/board';

export interface HintRequest {
  boardState: BoardState;
  currentPlayer: 1 | 2;
}

export interface HintResult {
  suggestedMove: { x: number; y: number } | null;
  winRate?: number;
  scoreLead?: number;
  pass?: boolean;
}

/**
 * Get hint from KataGo
 */
export async function getHint(request: HintRequest): Promise<HintResult | null> {
  const board: string[][] = [];
  for (let i = 0; i < 19; i++) {
    board[i] = [];
    for (let j = 0; j < 19; j++) {
      const stone = request.boardState.board[i][j];
      if (stone === 'black') {
        board[i][j] = 'B';
      } else if (stone === 'white') {
        board[i][j] = 'W';
      } else {
        board[i][j] = '';
      }
    }
  }

  const currentPlayer: 'black' | 'white' = request.currentPlayer === 1 ? 'black' : 'white';

  const katagoRequest: KataGoRequest = {
    board,
    currentPlayer,
    moveHistory: request.boardState.moveHistory.map((move) => ({
      x: move.position?.x || -1,
      y: move.position?.y || -1,
      player: (move.player === 1 ? 'black' : 'white') as 'black' | 'white',
    })),
    maxVisits: 50, // 힌트는 빠르게 (대결보다 적은 계산)
  };

  const move = await getKataGoMove(katagoRequest);
  if (!move) {
    return null;
  }

  return {
    suggestedMove: move.pass ? null : { x: move.x, y: move.y },
    winRate: move.winRate,
    scoreLead: move.scoreLead,
    pass: move.pass,
  };
}

