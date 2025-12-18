/**
 * 게임 보드 관련 타입 정의
 * 참고 저장소의 타입 구조를 기반으로 함
 */

export enum Player {
  None = 0,
  Black = 1,
  White = 2,
}

export type Point = { x: number; y: number; };

export type Move = { 
  player: Player; 
  x: number; 
  y: number; 
  capturedHiddenStones?: Point[]; 
};

export type BoardState = Player[][];

export type GameStatus =
  | 'pending'
  | 'negotiating'
  | 'nigiri_choosing'
  | 'nigiri_guessing'
  | 'nigiri_reveal'
  | 'base_placement'
  | 'komi_bidding'
  | 'komi_bid_reveal'
  | 'base_game_start_confirmation'
  | 'capture_bidding'
  | 'capture_reveal'
  | 'capture_tiebreaker'
  | 'hidden_placing'
  | 'scanning'
  | 'scanning_animating'
  | 'hidden_reveal_animating'
  | 'hidden_final_reveal'
  | 'missile_selecting'
  | 'missile_animating'
  | 'dice_rps'
  | 'dice_rps_reveal'
  | 'thief_rps'
  | 'thief_rps_reveal'
  | 'alkkagi_rps'
  | 'alkkagi_rps_reveal'
  | 'curling_rps'
  | 'curling_rps_reveal'
  | 'omok_rps'
  | 'omok_rps_reveal'
  | 'ttamok_rps'
  | 'ttamok_rps_reveal'
  | 'curling_tiebreaker_rps'
  | 'curling_tiebreaker_rps_reveal'
  | 'turn_preference_selection'
  | 'alkkagi_turn_selection'
  | 'curling_turn_selection'
  | 'thief_role_selection'
  | 'thief_role_confirmed'
  | 'thief_role_dice_roll'
  | 'alkkagi_placement'
  | 'alkkagi_simultaneous_placement'
  | 'alkkagi_playing'
  | 'alkkagi_animating'
  | 'alkkagi_scoring'
  | 'alkkagi_round_end'
  | 'alkkagi_start_confirmation'
  | 'curling_playing'
  | 'curling_animating'
  | 'curling_scoring'
  | 'curling_round_end'
  | 'curling_start_confirmation'
  | 'curling_tiebreaker_preference_selection'
  | 'curling_tiebreaker_playing'
  | 'dice_turn_rolling'
  | 'dice_turn_rolling_animating'
  | 'dice_turn_choice'
  | 'dice_start_confirmation'
  | 'dice_rolling'
  | 'dice_rolling_animating'
  | 'dice_placing'
  | 'dice_round_end'
  | 'thief_rolling'
  | 'thief_rolling_animating'
  | 'thief_placing'
  | 'thief_round_end'
  | 'playing'
  | 'scoring'
  | 'ended'
  | 'rematch_pending'
  | 'no_contest'
  | 'disconnected';

export enum GameMode {
  Standard = "클래식 바둑",
  Capture = "따내기 바둑",
  Speed = "스피드 바둑",
  Base = "베이스 바둑",
  Hidden = "히든 바둑",
  Missile = "미사일 바둑",
  Mix = "믹스룰 바둑",
  Dice = "주사위 바둑",
  Omok = "오목",
  Ttamok = "따목",
  Thief = "도둑과 경찰",
  Alkkagi = "알까기",
  Curling = "바둑 컬링",
}

// 이미지 경로 상수
export const WHITE_BASE_STONE_IMG = "/images/Base.png";
export const BLACK_BASE_STONE_IMG = "/images/Base.png";
export const WHITE_HIDDEN_STONE_IMG = "/images/Hidden.png";
export const BLACK_HIDDEN_STONE_IMG = "/images/Hidden.png";

// 간소화된 타입들 (참고 저장소에서 필요한 부분만)
export type AnimationData =
  | { type: 'scan'; point: Point; success: boolean; startTime: number; duration: number; playerId: string }
  | { type: 'missile'; from: Point; to: Point; player: Player; startTime: number; duration: number }
  | { type: 'hidden_missile'; from: Point; to: Point; player: Player; startTime: number; duration: number }
  | { type: 'hidden_reveal'; stones: { point: Point; player: Player }[]; startTime: number; duration: number }
  | { type: 'bonus_text'; text: string; point: Point; player: Player; startTime: number; duration: number };

export type RecommendedMove = {
  x: number;
  y: number;
  winrate: number;
  scoreLead: number;
  order: number;
};

export type AnalysisResult = {
  winRateBlack: number;
  winRateChange?: number;
  scoreLead?: number;
  blackConfirmed: Point[];
  whiteConfirmed: Point[];
  blackRight: Point[];
  whiteRight: Point[];
  blackLikely: Point[];
  whiteLikely: Point[];
  deadStones: Point[];
  ownershipMap: number[][] | null;
  recommendedMoves: RecommendedMove[];
  areaScore: { black: number; white: number; };
};

