/**
 * 스피드바둑 규칙
 * 시간 제한이 짧고 빠르게 진행
 */

import { GameRule } from '../base';

export const speedRule: GameRule = {
  gameType: 'SPEED',
  
  // 스피드바둑은 시간 제한만 다름 (게임 매니저에서 처리)
  // 기본 규칙 사용
};

