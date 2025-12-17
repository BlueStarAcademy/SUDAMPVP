/**
 * 따목 규칙
 * 오목 + 따내기 규칙 조합
 */

import { GameRule, BoardState } from '../base';
import { omokRule } from './omok';
import { captureRule } from '../strategy/capture';

export const ttamokRule: GameRule = {
  gameType: 'TTAMOK',
  
  afterMove(
    boardState: BoardState,
    player: 1 | 2,
    x: number,
    y: number,
    captured: number
  ): { success: boolean; effects?: any } {
    // 오목 승리 확인
    const omokResult = omokRule.afterMove?.(
      boardState,
      player,
      x,
      y,
      captured
    );
    
    if (omokResult?.effects?.win) {
      return omokResult;
    }

    // 따내기 승리 확인
    const captureResult = captureRule.checkGameEnd?.(boardState);
    if (captureResult?.ended) {
      return {
        success: true,
        effects: { win: true, winner: captureResult.winner },
      };
    }

    return { success: true };
  },
  
  checkGameEnd(boardState: BoardState): {
    ended: boolean;
    winner?: 1 | 2;
    reason?: string;
  } {
    return captureRule.checkGameEnd?.(boardState) || { ended: false };
  },
};

