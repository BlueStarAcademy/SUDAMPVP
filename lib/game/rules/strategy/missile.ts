/**
 * 미사일바둑 규칙
 * 특정 위치에 미사일을 발사하여 주변 돌을 제거
 */

import { GameRule, BoardState } from '../base';
import { getStoneAt, setStone, isValidPosition } from '../../board';

export const missileRule: GameRule = {
  gameType: 'MISSILE',
  
  afterMove(
    boardState: BoardState,
    player: 1 | 2,
    x: number,
    y: number,
    captured: number
  ): { success: boolean; effects?: any } {
    // 미사일 발사 로직 (게임 매니저에서 특수 액션으로 처리)
    // 여기서는 기본 처리만
    return { success: true };
  },
};

