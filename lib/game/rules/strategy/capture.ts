/**
 * 따내기바둑 규칙
 * 따낸 돌의 개수로 승부 결정
 */

import { GameRule, BoardState } from '../base';
import { getGroup, hasLiberties, captureGroup, getStoneAt, setStone, getAdjacentPositions } from '../../board';

export const captureRule: GameRule = {
  gameType: 'CAPTURE',
  
  checkGameEnd(boardState: BoardState): {
    ended: boolean;
    winner?: 1 | 2;
    reason?: string;
  } {
    // 따내기바둑은 특정 개수 이상 따내면 승리
    // 기본값: 10개 이상 따내면 승리
    const captureThreshold = 10;
    
    if (boardState.capturedBlack >= captureThreshold) {
      return { ended: true, winner: 1, reason: '흑이 10개 이상 따냄' };
    }
    if (boardState.capturedWhite >= captureThreshold) {
      return { ended: true, winner: 2, reason: '백이 10개 이상 따냄' };
    }
    
    return { ended: false };
  },
  
  calculateScore(boardState: BoardState): {
    player1Score: number;
    player2Score: number;
  } {
    // 따낸 돌의 개수가 점수
    return {
      player1Score: boardState.capturedBlack,
      player2Score: boardState.capturedWhite,
    };
  },
};

