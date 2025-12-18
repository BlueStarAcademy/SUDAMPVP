'use client';

import React, { useMemo } from 'react';
import { Player } from '@/lib/game/boardTypes';

interface User {
  id: string;
  nickname?: string;
  username?: string;
  avatarId?: string;
  borderId?: string;
  strategyLevel?: number;
  playfulLevel?: number;
}

interface Game {
  player1?: User;
  player2?: User;
  currentPlayer: 1 | 2;
  status: string;
  mode: string;
  player1Captures?: number;
  player2Captures?: number;
  blackPlayerId?: string;
  whitePlayerId?: string;
  winner?: 1 | 2 | null;
}

interface PlayerPanelProps {
  game: Game;
  currentUserId: string | null;
  isMobile?: boolean;
}

const formatTime = (seconds: number) => {
  if (seconds < 0) seconds = 0;
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const CapturedStones: React.FC<{ 
  count: number; 
  panelType: 'black' | 'white'; 
  isMobile?: boolean 
}> = ({ count, panelType, isMobile = false }) => {
  const widthClass = isMobile ? 'w-[3rem]' : 'w-[clamp(4.5rem,16vmin,6rem)]';
  const paddingClass = isMobile ? 'p-0.5' : 'p-1';
  const labelSize = isMobile ? 'text-[0.5rem]' : 'text-[clamp(0.6rem,2vmin,0.75rem)]';
  const countSize = isMobile ? 'text-[0.9rem]' : 'text-[clamp(1rem,5vmin,2rem)]';

  const baseClasses = `flex flex-col items-center justify-center ${widthClass} rounded-lg shadow-lg border-2 ${paddingClass} text-center h-full`;
  let colorClasses = '';
  let labelColor = 'text-gray-300';
  let countColor = 'text-white';

  if (panelType === 'white') {
    colorClasses = 'bg-gradient-to-br from-gray-50 to-gray-200 border-gray-400';
    labelColor = 'text-gray-700';
    countColor = 'text-black';
  } else {
    colorClasses = 'bg-gradient-to-br from-gray-800 to-black border-gray-600';
  }

  return (
    <div className={`${baseClasses} ${colorClasses}`}>
      <span className={`${labelColor} ${labelSize} font-semibold whitespace-nowrap`}>따낸 돌</span>
      <span className={`font-mono font-bold ${countSize} tracking-tighter my-1 ${countColor}`}>
        {count}
      </span>
    </div>
  );
};

const TimeBar: React.FC<{ 
  timeLeft: number; 
  totalTime: number; 
  isActive: boolean;
  isMobile?: boolean;
}> = ({ timeLeft, totalTime, isActive, isMobile = false }) => {
  const percent = totalTime > 0 ? (timeLeft / totalTime) * 100 : 0;
  const clampedPercent = Math.max(0, Math.min(100, percent));

  return (
    <div className="w-full relative">
      <div className={`w-full h-1.5 rounded-full transition-colors bg-gray-700`}>
        <div
          className={`h-1.5 rounded-full bg-blue-500 ${isActive && timeLeft < 5 ? 'animate-pulse' : ''}`}
          style={{ width: `${clampedPercent}%`, transition: 'width 0.2s linear' }}
        />
      </div>
    </div>
  );
};

const SinglePlayerPanel: React.FC<{
  user: User;
  playerEnum: Player;
  score: number;
  isActive: boolean;
  isLeft: boolean;
  game: Game;
  isMobile?: boolean;
}> = ({ user, playerEnum, score, isActive, isLeft, game, isMobile = false }) => {
  const isGameEnded = ['FINISHED', 'ENDED'].includes(game.status);
  const isBlackPanel = playerEnum === Player.Black;
  const isWhitePanel = playerEnum === Player.White;

  const panelType = isBlackPanel ? 'black' : isWhitePanel ? 'white' : 'neutral';

  let panelColorClasses = '';
  let nameTextClasses = '';
  let levelTextClasses = '';
  let timeTextClasses = '';

  if (panelType === 'black') {
    panelColorClasses = isActive && !isGameEnded ? 'bg-gray-800 ring-2 ring-blue-400 border-gray-600' : 'bg-black/50 border-gray-700';
    nameTextClasses = 'text-white';
    levelTextClasses = 'text-gray-400';
    timeTextClasses = 'text-gray-200';
  } else if (panelType === 'white') {
    panelColorClasses = isActive && !isGameEnded ? 'bg-gray-300 ring-2 ring-blue-500 border-blue-500' : 'bg-gray-200 border-gray-400';
    nameTextClasses = 'text-black';
    levelTextClasses = 'text-gray-600';
    timeTextClasses = 'text-gray-800';
  }

  const isStrategic = game.mode === 'STRATEGY';
  const levelToDisplay = isStrategic ? (user.strategyLevel || 1) : (user.playfulLevel || 1);
  const levelLabel = isStrategic ? '전략' : '놀이';
  const levelText = `${levelLabel} Lv.${levelToDisplay}`;

  const orderClass = isLeft ? 'flex-row' : 'flex-row-reverse';
  const textAlignClass = isLeft ? 'text-left' : 'text-right';
  const justifyClass = isLeft ? 'justify-start' : 'justify-end';

  const avatarSize = isMobile ? 32 : 48;
  const nameTextSize = isMobile ? 'text-[0.7rem]' : 'text-[clamp(0.8rem,3vmin,1.125rem)]';
  const levelTextSize = isMobile ? 'text-[0.5rem]' : 'text-[clamp(0.6rem,2vmin,0.75rem)]';
  const timeTextSize = isMobile ? 'text-[0.75rem]' : 'text-[clamp(1rem,3.5vmin,1.25rem)]';
  const padding = isMobile ? 'p-0.5' : 'p-1';
  const gap = isMobile ? 'gap-1' : 'gap-2';

  // 임시 시간 값 (실제로는 게임에서 받아와야 함)
  const timeLeft = 300; // 5분
  const totalTime = 300;

  return (
    <div className={`flex items-stretch ${gap} flex-1 ${orderClass} ${padding} rounded-lg transition-all duration-300 border ${panelColorClasses}`}>
      <div className={`flex flex-col ${textAlignClass} flex-grow justify-between min-w-0`}>
        <div className={`flex items-center ${gap} ${isLeft ? '' : 'flex-row-reverse'}`}>
          <div 
            className="rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0"
            style={{ width: `${avatarSize}px`, height: `${avatarSize}px` }}
          >
            <span className="text-white text-lg">
              {playerEnum === Player.Black ? '⚫' : '⚪'}
            </span>
          </div>
          <div className="min-w-0">
            <div className={`flex items-baseline ${gap} ${justifyClass}`}>
              <h2 className={`font-bold ${nameTextSize} leading-tight whitespace-nowrap ${nameTextClasses}`}>
                {user.nickname || user.username || 'Player'}
              </h2>
            </div>
            <p className={`${levelTextSize} ${levelTextClasses}`}>{levelText}</p>
          </div>
        </div>
        <div className={isMobile ? 'mt-0.5' : 'mt-1'}>
          <TimeBar timeLeft={timeLeft} totalTime={totalTime} isActive={isActive && !isGameEnded} isMobile={isMobile} />
          <div className={`flex items-center ${isMobile ? 'mt-0' : 'mt-0.5'} ${justifyClass} gap-1`}>
            <span className={`font-mono font-bold ${timeTextClasses} ${timeTextSize}`}>
              {formatTime(timeLeft)}
            </span>
          </div>
        </div>
      </div>
      <CapturedStones count={score} panelType={panelType} isMobile={isMobile} />
    </div>
  );
};

const PlayerPanel: React.FC<PlayerPanelProps> = ({ game, currentUserId, isMobile = false }) => {
  const leftPlayerUser = game.player1;
  const rightPlayerUser = game.player2;

  const leftPlayerEnum = useMemo(() => {
    if (!leftPlayerUser) return Player.None;
    if (game.blackPlayerId === leftPlayerUser.id) return Player.Black;
    if (game.whitePlayerId === leftPlayerUser.id) return Player.White;
    return game.currentPlayer === 1 ? Player.Black : Player.White;
  }, [leftPlayerUser, game.blackPlayerId, game.whitePlayerId, game.currentPlayer]);

  const rightPlayerEnum = useMemo(() => {
    if (!rightPlayerUser) return Player.None;
    if (game.blackPlayerId === rightPlayerUser.id) return Player.Black;
    if (game.whitePlayerId === rightPlayerUser.id) return Player.White;
    return game.currentPlayer === 2 ? Player.Black : Player.White;
  }, [rightPlayerUser, game.blackPlayerId, game.whitePlayerId, game.currentPlayer]);

  const isLeftPlayerActive = game.currentPlayer === 1 && game.status === 'IN_PROGRESS';
  const isRightPlayerActive = game.currentPlayer === 2 && game.status === 'IN_PROGRESS';

  const leftPlayerScore = game.player1Captures || 0;
  const rightPlayerScore = game.player2Captures || 0;

  if (!leftPlayerUser || !rightPlayerUser) return null;

  return (
    <div className={`flex justify-between items-start ${isMobile ? 'gap-1' : 'gap-2'} flex-shrink-0 h-full`}>
      <SinglePlayerPanel
        user={leftPlayerUser}
        playerEnum={leftPlayerEnum}
        score={leftPlayerScore}
        isActive={isLeftPlayerActive}
        isLeft={true}
        game={game}
        isMobile={isMobile}
      />
      <SinglePlayerPanel
        user={rightPlayerUser}
        playerEnum={rightPlayerEnum}
        score={rightPlayerScore}
        isActive={isRightPlayerActive}
        isLeft={false}
        game={game}
        isMobile={isMobile}
      />
    </div>
  );
};

export default PlayerPanel;

