'use client';

import { useState } from 'react';
import GameTypeSelector from './GameTypeSelector';
import OnlineUsersList from './OnlineUsersList';
import RankingMatchButton from './RankingMatchButton';

export default function GameMatchPanel() {
  const [selectedGameType, setSelectedGameType] = useState<string>('');
  const [selectedBoardSize, setSelectedBoardSize] = useState<number>(19);

  const handleGameTypeSelect = (gameType: string, boardSize: number) => {
    setSelectedGameType(gameType);
    setSelectedBoardSize(boardSize);
  };

  return (
    <div className="space-y-6">
      {/* 게임 타입 선택 */}
      <GameTypeSelector onSelect={handleGameTypeSelect} />

      {/* 접속 유저 목록 */}
      <OnlineUsersList />

      {/* 랭킹전 매칭 버튼 */}
      <div className="baduk-card p-6 animate-fade-in">
        <div className="mb-4 flex items-center gap-3 border-b border-gray-200 pb-4 dark:border-gray-700">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-red-600">
            <span className="text-xl">🏆</span>
          </div>
          <h2 className="text-xl font-bold">랭킹전 매칭</h2>
        </div>
        <RankingMatchButton
          selectedGameType={selectedGameType}
          selectedBoardSize={selectedBoardSize}
        />
      </div>
    </div>
  );
}

