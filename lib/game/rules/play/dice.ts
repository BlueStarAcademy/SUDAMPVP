/**
 * 주사위바둑 규칙
 * 주사위를 굴려 나온 수만큼 돌을 놓을 수 있음
 */

import { GameRule } from '../base';

export const diceRule: GameRule = {
  gameType: 'DICE',
  
  // 주사위바둑은 클라이언트에서 주사위 결과에 따라 수를 제한
  // 서버에서는 기본 규칙 사용
};

