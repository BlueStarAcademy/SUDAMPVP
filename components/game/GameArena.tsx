'use client';

import React from 'react';
import GoBoard from './GoBoard';
import { Player, Point, BoardState, GameStatus } from '@/lib/game/boardTypes';

interface GameArenaProps {
  boardState: BoardState;
  boardSize: number;
  onBoardClick: (x: number, y: number) => void;
  lastMove: Point | null;
  isBoardDisabled: boolean;
  stoneColor: Player;
  currentPlayer: Player;
  isMyTurn: boolean;
  showLastMoveMarker?: boolean;
  mode?: string;
  gameStatus?: string;
  isMobile?: boolean;
}

const GameArena: React.FC<GameArenaProps> = (props) => {
  const {
    boardState,
    boardSize,
    onBoardClick,
    lastMove,
    isBoardDisabled,
    stoneColor,
    currentPlayer,
    isMyTurn,
    showLastMoveMarker = true,
    mode,
    gameStatus,
    isMobile = false,
  } = props;

  // 현재는 일반 바둑만 지원하므로 GoBoard를 직접 사용
  // 나중에 다른 게임 모드(알까기, 컬링 등)를 추가할 때 확장 가능
  return (
    <div className="w-full h-full flex items-center justify-center">
      <GoBoard
        boardState={boardState}
        boardSize={boardSize}
        onBoardClick={onBoardClick}
        lastMove={lastMove}
        isBoardDisabled={isBoardDisabled}
        stoneColor={stoneColor}
        currentPlayer={currentPlayer}
        isMyTurn={isMyTurn}
        showLastMoveMarker={showLastMoveMarker}
        mode={mode}
        gameStatus={gameStatus}
      />
    </div>
  );
};

export default GameArena;

