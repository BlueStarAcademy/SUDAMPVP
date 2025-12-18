'use client';

import React from 'react';

interface TurnDisplayProps {
  game: {
    currentPlayer: 1 | 2;
    player1?: { nickname?: string; username?: string };
    player2?: { nickname?: string; username?: string };
    status: string;
  };
  isMobile?: boolean;
}

const TurnDisplay: React.FC<TurnDisplayProps> = ({ game, isMobile = false }) => {
  const getGameStatusText = (): string => {
    if (game.status === 'FINISHED' || game.status === 'ENDED') {
      return '대국 종료';
    }
    
    const currentPlayerName = game.currentPlayer === 1
      ? (game.player1?.nickname || game.player1?.username || '플레이어 1')
      : (game.player2?.nickname || game.player2?.username || '플레이어 2');
    
    return `${currentPlayerName}님의 차례입니다.`;
  };

  const statusText = getGameStatusText();
  const isSinglePlayer = false; // 현재는 멀티플레이어만 지원
  const baseClasses = "flex-shrink-0 rounded-lg flex flex-col items-center justify-center shadow-inner py-1 h-12 border";
  const themeClasses = isSinglePlayer 
    ? "bg-stone-800/70 backdrop-blur-sm border-stone-700/50" 
    : "bg-secondary border-color";
  const textClass = isSinglePlayer ? "text-amber-300" : "text-highlight";

  return (
    <div className={`${baseClasses} ${themeClasses}`}>
      <p className={`font-bold ${textClass} tracking-wider text-[clamp(0.8rem,2.5vmin,1rem)] text-center px-2`}>
        {statusText}
      </p>
    </div>
  );
};

export default TurnDisplay;

