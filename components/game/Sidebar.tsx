'use client';

import React from 'react';
import ChatPanel from '@/components/chat/ChatPanel';

interface SidebarProps {
  gameId: string;
  game: {
    mode: string;
    boardSize?: number;
    currentPlayer: 1 | 2;
    player1?: { nickname?: string; username?: string };
    player2?: { nickname?: string; username?: string };
    status: string;
  };
  onClose?: () => void;
  isMobile?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ gameId, game, onClose, isMobile = false }) => {
  return (
    <div className="h-full flex flex-col gap-2 bg-panel rounded-lg p-2 border border-color">
      {/* 게임 정보 */}
      <div className="bg-tertiary/30 p-2 rounded-md flex-shrink-0 border border-color">
        <h3 className="text-base font-bold border-b border-color pb-1 mb-2 text-highlight">
          대국 정보
        </h3>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-on-panel">
          <div className="font-semibold text-secondary">게임 모드:</div>
          <div>{game.mode === 'STRATEGY' ? '전략바둑' : '놀이바둑'}</div>
          <div className="font-semibold text-secondary">판 크기:</div>
          <div>{game.boardSize || 19}×{game.boardSize || 19}</div>
          <div className="font-semibold text-secondary">현재 차례:</div>
          <div>
            {game.currentPlayer === 1
              ? game.player1?.nickname || game.player1?.username || '플레이어 1'
              : game.player2?.nickname || game.player2?.username || '플레이어 2'}
          </div>
        </div>
      </div>

      {/* 채팅 */}
      <div className="flex-1 min-h-0">
        <ChatPanel gameId={gameId} type="GAME" />
      </div>
    </div>
  );
};

export default Sidebar;

