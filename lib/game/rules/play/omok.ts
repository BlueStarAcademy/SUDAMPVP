/**
 * 오목 규칙
 * 5개를 연속으로 놓으면 승리
 */

import { GameRule, BoardState } from '../base';
import { getStoneAt, isValidPosition } from '../../board';

function checkFiveInRow(
  board: any[][],
  x: number,
  y: number,
  player: 1 | 2,
  boardSize: number
): boolean {
  const stone = player === 1 ? 'black' : 'white';
  const directions = [
    { dx: 1, dy: 0 },   // 가로
    { dx: 0, dy: 1 },   // 세로
    { dx: 1, dy: 1 },   // 대각선 (우하)
    { dx: 1, dy: -1 },  // 대각선 (우상)
  ];

  for (const dir of directions) {
    let count = 1; // 현재 돌 포함

    // 양방향으로 확인
    for (const direction of [-1, 1]) {
      for (let i = 1; i < 5; i++) {
        const newX = x + dir.dx * i * direction;
        const newY = y + dir.dy * i * direction;
        
        if (
          isValidPosition(newX, newY, boardSize) &&
          getStoneAt(board, newX, newY, boardSize) === stone
        ) {
          count++;
        } else {
          break;
        }
      }
    }

    if (count >= 5) {
      return true;
    }
  }

  return false;
}

export const omokRule: GameRule = {
  gameType: 'OMOK',
  
  afterMove(
    boardState: BoardState,
    player: 1 | 2,
    x: number,
    y: number,
    captured: number
  ): { success: boolean; effects?: any } {
    // 5개 연속 확인
    const hasFive = checkFiveInRow(
      boardState.board,
      x,
      y,
      player,
      boardState.boardSize
    );

    if (hasFive) {
      return {
        success: true,
        effects: { win: true, winner: player },
      };
    }

    return { success: true };
  },
  
  checkGameEnd(boardState: BoardState): {
    ended: boolean;
    winner?: 1 | 2;
    reason?: string;
  } {
    // 마지막 수에서 승리 확인 (afterMove에서 처리)
    return { ended: false };
  },
};

