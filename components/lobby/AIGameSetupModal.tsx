'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { STRATEGY_GAME_TYPES, PLAY_GAME_TYPES, ALL_GAME_TYPES } from '@/lib/game/types';

interface AIGameSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AIGameSetupModal({ isOpen, onClose }: AIGameSetupModalProps) {
  const router = useRouter();
  const [selectedGameType, setSelectedGameType] = useState<string>('');
  const [selectedBoardSize, setSelectedBoardSize] = useState<number>(19);
  const [aiLevel, setAiLevel] = useState<number>(1);
  const [loading, setLoading] = useState(false);

  const handleStartGame = async () => {
    if (!selectedGameType) {
      alert('게임 타입을 선택해주세요.');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        alert('로그인이 필요합니다.');
        return;
      }

      const gameType = ALL_GAME_TYPES[selectedGameType];
      const mode = selectedGameType in STRATEGY_GAME_TYPES ? 'STRATEGY' : 'PLAY';

      const response = await fetch('/api/game/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode,
          gameType: selectedGameType,
          boardSize: selectedBoardSize,
          aiType: 'gnugo',
          aiLevel,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || '게임 생성 실패');
        return;
      }

      router.push(`/game/${data.gameId}`);
    } catch (error) {
      console.error('Game creation error:', error);
      alert('게임 생성 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const selectedGame = selectedGameType ? ALL_GAME_TYPES[selectedGameType] : null;
  const availableBoardSizes = selectedGame ? selectedGame.boardSizes : [19];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl dark:bg-gray-800 animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="mb-6 flex items-center justify-between border-b border-gray-200 pb-4 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600">
              <span className="text-2xl">🤖</span>
            </div>
            <h2 className="text-2xl font-bold">AI 대결 대국 설정</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <span className="text-2xl">✕</span>
          </button>
        </div>

        <div className="space-y-6">
          {/* 게임 타입 선택 */}
          <div>
            <label className="mb-3 block text-sm font-bold text-gray-700 dark:text-gray-300">
              게임 타입
            </label>
            <div className="space-y-3">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-lg">⚔️</span>
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">전략바둑</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(STRATEGY_GAME_TYPES).map((gameType) => (
                    <button
                      key={gameType.id}
                      onClick={() => {
                        setSelectedGameType(gameType.id);
                        setSelectedBoardSize(gameType.boardSizes[0]);
                      }}
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
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-lg">🎮</span>
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">놀이바둑</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(PLAY_GAME_TYPES).map((gameType) => (
                    <button
                      key={gameType.id}
                      onClick={() => {
                        setSelectedGameType(gameType.id);
                        setSelectedBoardSize(gameType.boardSizes[0]);
                      }}
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
            </div>
          </div>

          {/* 보드 크기 선택 */}
          {selectedGame && (
            <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-lg">📐</span>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                  보드 크기
                </label>
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

          {/* AI 난이도 */}
          <div className="rounded-xl border-2 border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg">🎯</span>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                AI 난이도 (1-10단계)
              </label>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={aiLevel}
              onChange={(e) => setAiLevel(parseInt(e.target.value))}
              className="w-full accent-green-600"
            />
            <div className="mt-3 text-center">
              <span className="rounded-full bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-2 text-lg font-bold text-white shadow-md">
                {aiLevel}단계
              </span>
            </div>
          </div>

          {/* 시작 버튼 */}
          <button
            onClick={handleStartGame}
            disabled={loading || !selectedGameType}
            className="baduk-button-success w-full px-6 py-4 text-lg font-bold shadow-lg transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                <span>게임 생성 중...</span>
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span className="text-2xl">🚀</span>
                <span>게임 시작</span>
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

