/**
 * 히든바둑 규칙
 * 상대방의 돌을 볼 수 없는 게임
 */

import { GameRule } from '../base';

export const hiddenRule: GameRule = {
  gameType: 'HIDDEN',
  
  // 히든바둑은 UI에서 처리 (서버 로직은 기본 규칙 사용)
  // 클라이언트에서 상대방 돌을 숨김 처리
};

