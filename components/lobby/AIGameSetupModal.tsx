'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { STRATEGY_GAME_TYPES, PLAY_GAME_TYPES, ALL_GAME_TYPES } from '@/lib/game/types';
import DraggableModal from '@/components/ui/DraggableModal';

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

  const selectedGame = selectedGameType ? ALL_GAME_TYPES[selectedGameType] : null;
  const availableBoardSizes = selectedGame ? selectedGame.boardSizes : [19];

  return (
    <DraggableModal
      isOpen={isOpen}
      onClose={onClose}
      title="AI 대결 대국 설정"
      modalId="ai-game-setup"
      maxWidth="max-w-lg"
    >
      <div className="space-y-6 max-h-[70vh] overflow-y-auto">
          {/* 게임 타입 선택 */}
          <div>
            <label className="mb-3 block text-sm font-bold text-on-panel">
              게임 타입
            </label>
            <div className="space-y-3">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-lg">⚔️</span>
                  <p className="text-xs font-semibold text-secondary">전략바둑</p>
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
                          ? 'bg-accent text-white shadow-lg scale-105'
                          : 'bg-tertiary/30 text-on-panel hover:bg-tertiary/50 border border-color'
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
                  <p className="text-xs font-semibold text-secondary">놀이바둑</p>
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
                          ? 'bg-accent text-white shadow-lg scale-105'
                          : 'bg-tertiary/30 text-on-panel hover:bg-tertiary/50 border border-color'
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
            <div className="rounded-xl border border-color bg-tertiary/30 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-lg">📐</span>
                <label className="block text-sm font-bold text-on-panel">
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
                        ? 'bg-highlight text-white shadow-lg scale-105'
                        : 'bg-tertiary/30 text-on-panel hover:bg-tertiary/50 border border-color'
                    }`}
                  >
                    {size}×{size}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* AI 난이도 */}
          <div className="rounded-xl border border-color bg-tertiary/30 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg">🎯</span>
              <label className="block text-sm font-bold text-on-panel">
                AI 난이도 (1-10단계)
              </label>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={aiLevel}
              onChange={(e) => setAiLevel(parseInt(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="mt-3 text-center">
              <span className="rounded-full bg-accent px-4 py-2 text-lg font-bold text-white shadow-md">
                {aiLevel}단계
              </span>
            </div>
          </div>

          {/* 시작 버튼 */}
          <button
            onClick={handleStartGame}
            disabled={loading || !selectedGameType}
            className="bg-accent hover:bg-accent-hover w-full px-6 py-4 text-lg font-bold text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
    </DraggableModal>
  );
}

