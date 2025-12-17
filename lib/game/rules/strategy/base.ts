/**
 * 베이스바둑 규칙
 * 특정 위치(베이스)를 점령하는 게임
 */

import { GameRule, BoardState } from '../base';

export const baseRule: GameRule = {
  gameType: 'BASE',
  
  initialize(boardState: BoardState, gameRules?: any): void {
    // 베이스 위치 설정 (중앙 3x3 영역)
    if (!gameRules) {
      gameRules = {};
    }
    const boardSize = boardState.boardSize || 19;
    const center = Math.floor(boardSize / 2);
    gameRules.basePositions = [
      { x: center - 1, y: center - 1 },
      { x: center, y: center - 1 },
      { x: center + 1, y: center - 1 },
      { x: center - 1, y: center },
      { x: center, y: center },
      { x: center + 1, y: center },
      { x: center - 1, y: center + 1 },
      { x: center, y: center + 1 },
      { x: center + 1, y: center + 1 },
    ];
  },
  
  checkGameEnd(boardState: BoardState): {
    ended: boolean;
    winner?: 1 | 2;
    reason?: string;
  } {
    // 베이스 점령 로직은 게임 매니저에서 gameRules를 통해 처리
    return { ended: false };
  },
};

