'use client';

import { useState } from 'react';
import { STRATEGY_GAME_TYPES, PLAY_GAME_TYPES, ALL_GAME_TYPES } from '@/lib/game/types';

interface GameTypeSelectorProps {
  onSelect: (gameType: string, boardSize: number) => void;
}

export default function GameTypeSelector({ onSelect }: GameTypeSelectorProps) {
  const [selectedGameType, setSelectedGameType] = useState<string>('');
  const [selectedBoardSize, setSelectedBoardSize] = useState<number>(19);

  const handleGameTypeSelect = (gameTypeId: string) => {
    setSelectedGameType(gameTypeId);
    const gameType = ALL_GAME_TYPES[gameTypeId];
    if (gameType) {
      setSelectedBoardSize(gameType.boardSizes[0]);
    }
  };

  const handleStart = () => {
    if (selectedGameType) {
      onSelect(selectedGameType, selectedBoardSize);
    }
  };

  const selectedGame = selectedGameType ? ALL_GAME_TYPES[selectedGameType] : null;
  const availableBoardSizes = selectedGame ? selectedGame.boardSizes : [19];

  return (
    <div className="baduk-card p-6 animate-fade-in">
      <div className="mb-6 flex items-center gap-3 border-b border-gray-200 pb-4 dark:border-gray-700">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600">
          <span className="text-xl">🎯</span>
        </div>
        <h2 className="text-xl font-bold">게임 타입 선택</h2>
      </div>
      <div className="space-y-5">
        {/* 전략바둑 */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-lg">⚔️</span>
            <p className="font-bold text-gray-700 dark:text-gray-300">전략바둑</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(STRATEGY_GAME_TYPES).map((gameType) => (
              <button
                key={gameType.id}
                onClick={() => handleGameTypeSelect(gameType.id)}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  selectedGameType === gameType.id
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg scale-105'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {gameType.name}
              </button>
            ))}
          </div>
        </div>

        {/* 놀이바둑 */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-lg">🎮</span>
            <p className="font-bold text-gray-700 dark:text-gray-300">놀이바둑</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(PLAY_GAME_TYPES).map((gameType) => (
              <button
                key={gameType.id}
                onClick={() => handleGameTypeSelect(gameType.id)}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  selectedGameType === gameType.id
                    ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg scale-105'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {gameType.name}
              </button>
            ))}
          </div>
        </div>

        {/* 보드 크기 선택 */}
        {selectedGame && (
          <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg">📐</span>
              <p className="font-bold text-gray-700 dark:text-gray-300">보드 크기</p>
            </div>
            <div className="flex gap-2">
              {availableBoardSizes.map((size) => (
                <button
                  key={size}
                  onClick={() => setSelectedBoardSize(size)}
                  className={`flex-1 rounded-lg px-4 py-2.5 font-bold transition-all ${
                    selectedBoardSize === size
                      ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg scale-105'
                      : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {size}×{size}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

