/**
 * 기본 게임 규칙 인터페이스 및 공통 로직
 */

import { BoardState } from '../board';

export interface GameRule {
  // 게임 타입 ID
  gameType: string;
  
  // 게임 시작 시 초기화
  initialize?(boardState: BoardState, gameRules?: any): void;
  
  // 수를 두기 전 검증
  validateMove?(
    boardState: BoardState,
    player: 1 | 2,
    x: number,
    y: number
  ): { valid: boolean; error?: string };
  
  // 수를 둔 후 처리
  afterMove?(
    boardState: BoardState,
    player: 1 | 2,
    x: number,
    y: number,
    captured: number
  ): { success: boolean; effects?: any };
  
  // 게임 종료 조건 확인
  checkGameEnd?(boardState: BoardState): {
    ended: boolean;
    winner?: 1 | 2;
    reason?: string;
  };
  
  // 점수 계산
  calculateScore?(boardState: BoardState): {
    player1Score: number;
    player2Score: number;
  };
}

/**
 * 기본 클래식 바둑 규칙 (표준 바둑 규칙)
 */
export const classicRule: GameRule = {
  gameType: 'CLASSIC',
  
  // 클래식 바둑은 기본 규칙 사용 (별도 처리 불필요)
};

