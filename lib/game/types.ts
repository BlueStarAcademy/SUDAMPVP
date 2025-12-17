/**
 * 게임 타입 정의 및 상수
 */

export interface GameType {
  id: string;
  name: string;
  boardSizes: number[];
}

export const STRATEGY_GAME_TYPES: Record<string, GameType> = {
  CLASSIC: { id: 'CLASSIC', name: '클래식바둑', boardSizes: [9, 13, 19] },
  CAPTURE: { id: 'CAPTURE', name: '따내기바둑', boardSizes: [9, 13, 19] },
  SPEED: { id: 'SPEED', name: '스피드바둑', boardSizes: [9, 13, 19] },
  BASE: { id: 'BASE', name: '베이스바둑', boardSizes: [9, 13, 19] },
  HIDDEN: { id: 'HIDDEN', name: '히든바둑', boardSizes: [9, 13, 19] },
  MISSILE: { id: 'MISSILE', name: '미사일바둑', boardSizes: [9, 13, 19] },
  MIXED: { id: 'MIXED', name: '믹스룰바둑', boardSizes: [9, 13, 19] },
};

export const PLAY_GAME_TYPES: Record<string, GameType> = {
  OMOK: { id: 'OMOK', name: '오목', boardSizes: [19] },
  TTAMOK: { id: 'TTAMOK', name: '따목', boardSizes: [19] },
  DICE: { id: 'DICE', name: '주사위바둑', boardSizes: [19] },
  THIEF_COP: { id: 'THIEF_COP', name: '도둑과경찰', boardSizes: [19] },
  ALKKAGI: { id: 'ALKKAGI', name: '알까기', boardSizes: [19] },
  CURLING: { id: 'CURLING', name: '바둑컬링', boardSizes: [19] },
};

export const ALL_GAME_TYPES = {
  ...STRATEGY_GAME_TYPES,
  ...PLAY_GAME_TYPES,
};

/**
 * 게임 타입 ID로 게임 타입 정보 가져오기
 */
export function getGameType(gameTypeId: string): GameType | undefined {
  return ALL_GAME_TYPES[gameTypeId];
}

/**
 * 게임 타입이 전략바둑인지 확인
 */
export function isStrategyGame(gameTypeId: string): boolean {
  return gameTypeId in STRATEGY_GAME_TYPES;
}

/**
 * 게임 타입이 놀이바둑인지 확인
 */
export function isPlayGame(gameTypeId: string): boolean {
  return gameTypeId in PLAY_GAME_TYPES;
}

