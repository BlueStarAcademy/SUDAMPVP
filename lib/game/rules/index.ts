/**
 * 게임 규칙 관리자
 */

import { GameRule } from './base';
import { classicRule } from './strategy/classic';
import { captureRule } from './strategy/capture';
import { speedRule } from './strategy/speed';
import { baseRule } from './strategy/base';
import { hiddenRule } from './strategy/hidden';
import { missileRule } from './strategy/missile';
import { mixedRule } from './strategy/mixed';
import { omokRule } from './play/omok';
import { ttamokRule } from './play/ttamok';
import { diceRule } from './play/dice';
import { thiefCopRule } from './play/thiefCop';
import { alkkagiRule } from './play/alkkagi';
import { curlingRule } from './play/curling';

export const GAME_RULES: Record<string, GameRule> = {
  // 전략바둑
  CLASSIC: classicRule,
  CAPTURE: captureRule,
  SPEED: speedRule,
  BASE: baseRule,
  HIDDEN: hiddenRule,
  MISSILE: missileRule,
  MIXED: mixedRule,
  
  // 놀이바둑
  OMOK: omokRule,
  TTAMOK: ttamokRule,
  DICE: diceRule,
  THIEF_COP: thiefCopRule,
  ALKKAGI: alkkagiRule,
  CURLING: curlingRule,
};

/**
 * 게임 타입으로 규칙 가져오기
 */
export function getGameRule(gameType: string | null | undefined): GameRule | null {
  if (!gameType) return null;
  return GAME_RULES[gameType] || null;
}

/**
 * 규칙 적용: 수 검증
 */
export function validateMoveWithRule(
  boardState: any,
  player: 1 | 2,
  x: number,
  y: number,
  gameType: string | null
): { valid: boolean; error?: string } {
  const rule = getGameRule(gameType);
  if (rule?.validateMove) {
    return rule.validateMove(boardState, player, x, y);
  }
  return { valid: true };
}

/**
 * 규칙 적용: 수 후 처리
 */
export function applyRuleAfterMove(
  boardState: any,
  player: 1 | 2,
  x: number,
  y: number,
  captured: number,
  gameType: string | null
): { success: boolean; effects?: any } {
  const rule = getGameRule(gameType);
  if (rule?.afterMove) {
    return rule.afterMove(boardState, player, x, y, captured);
  }
  return { success: true };
}

/**
 * 규칙 적용: 게임 종료 확인
 */
export function checkGameEndWithRule(
  boardState: any,
  gameType: string | null
): { ended: boolean; winner?: 1 | 2; reason?: string } {
  const rule = getGameRule(gameType);
  if (rule?.checkGameEnd) {
    return rule.checkGameEnd(boardState);
  }
  return { ended: false };
}

/**
 * 규칙 적용: 점수 계산
 */
export function calculateScoreWithRule(
  boardState: any,
  gameType: string | null
): { player1Score: number; player2Score: number } | null {
  const rule = getGameRule(gameType);
  if (rule?.calculateScore) {
    return rule.calculateScore(boardState);
  }
  return null;
}

