'use client';

import React from 'react';

interface GameControlsProps {
  game: {
    status: string;
  };
  isMyTurn: boolean;
  onPass?: () => void;
  onResign?: () => void;
  isMobile?: boolean;
}

const GameControls: React.FC<GameControlsProps> = ({ 
  game, 
  isMyTurn, 
  onPass, 
  onResign,
  isMobile = false 
}) => {
  const isGameActive = game.status === 'IN_PROGRESS';

  return (
    <footer className="responsive-controls flex-shrink-0 bg-panel rounded-lg p-1 lg:p-2 flex flex-col items-stretch justify-center gap-1 w-full border border-color">
      <div className="flex flex-row gap-1 w-full">
        <div className="bg-tertiary/30 rounded-md p-2 flex flex-row items-center gap-4 flex-1 min-w-0">
          <h3 className="text-xs font-bold text-on-panel whitespace-nowrap">대국 기능</h3>
          <div className="flex items-center justify-center gap-3 flex-wrap flex-grow">
            {isGameActive && onPass && (
              <button
                onClick={onPass}
                disabled={!isMyTurn}
                className="px-4 py-2 font-bold rounded-lg transition-all duration-150 ease-in-out border-2 border-amber-400/60 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.3),0_2px_4px_-1px_rgba(0,0,0,0.2),inset_0_1px_0_0_rgba(255,255,255,0.1)] active:translate-y-0.5 active:shadow-[0_2px_4px_-1px_rgba(0,0,0,0.2)] focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:ring-offset-2 bg-accent hover:bg-accent-hover text-white disabled:bg-secondary disabled:opacity-70 disabled:cursor-not-allowed whitespace-nowrap"
              >
                패스
              </button>
            )}
            {isGameActive && onResign && (
              <button
                onClick={onResign}
                className="px-4 py-2 font-bold rounded-lg transition-all duration-150 ease-in-out border-2 border-red-400/60 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.3),0_2px_4px_-1px_rgba(0,0,0,0.2),inset_0_1px_0_0_rgba(255,255,255,0.1)] active:translate-y-0.5 active:shadow-[0_2px_4px_-1px_rgba(0,0,0,0.2)] focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:ring-offset-2 bg-red-600 hover:bg-red-700 text-white whitespace-nowrap"
              >
                기권
              </button>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default GameControls;

