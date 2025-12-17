'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { STRATEGY_GAME_TYPES, PLAY_GAME_TYPES, ALL_GAME_TYPES } from '@/lib/game/types';
import DraggableModal from '@/components/ui/DraggableModal';

interface GameRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiverId: string;
  receiverName: string;
}

export default function GameRequestModal({
  isOpen,
  onClose,
  receiverId,
  receiverName,
}: GameRequestModalProps) {
  const router = useRouter();
  const [selectedGameType, setSelectedGameType] = useState<string>('');
  const [selectedBoardSize, setSelectedBoardSize] = useState<number>(19);
  const [timeLimit, setTimeLimit] = useState<number>(1800); // 30분
  const [loading, setLoading] = useState(false);

  const handleGameTypeSelect = (gameTypeId: string) => {
    setSelectedGameType(gameTypeId);
    const gameType = ALL_GAME_TYPES[gameTypeId];
    if (gameType) {
      setSelectedBoardSize(gameType.boardSizes[0]);
    }
  };

  const handleSendRequest = async () => {
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

      const response = await fetch('/api/game/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiverId,
          gameType: selectedGameType,
          boardSize: selectedBoardSize,
          timeLimit,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || '대국 신청 실패');
        return;
      }

      alert('대국 신청이 전송되었습니다.');
      onClose();
    } catch (error) {
      console.error('Game request error:', error);
      alert('대국 신청 중 오류가 발생했습니다');
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
      title="대국 신청"
      modalId="game-request"
      maxWidth="max-w-lg"
    >
      <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 p-3">
        <p className="text-sm font-medium text-gray-800">
          상대방: <span className="font-bold text-blue-600">{receiverName}</span>
        </p>
      </div>

      <div className="space-y-6">
          {/* 게임 타입 선택 */}
          <div>
            <label className="mb-3 block text-sm font-bold text-gray-800">
              게임 타입
            </label>
            <div className="space-y-3">
              {/* 전략바둑 */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-lg">⚔️</span>
                  <p className="text-xs font-semibold text-gray-600">
                    전략바둑
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(STRATEGY_GAME_TYPES).map((gameType) => (
                    <button
                      key={gameType.id}
                      onClick={() => handleGameTypeSelect(gameType.id)}
                      className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                        selectedGameType === gameType.id
                          ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg scale-105'
                          : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      {gameType.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 놀이바둑 */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-lg">🎮</span>
                  <p className="text-xs font-semibold text-gray-600">
                    놀이바둑
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(PLAY_GAME_TYPES).map((gameType) => (
                    <button
                      key={gameType.id}
                      onClick={() => handleGameTypeSelect(gameType.id)}
                      className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                        selectedGameType === gameType.id
                          ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg scale-105'
                          : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
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
          <div>
            <label className="mb-3 block text-sm font-bold text-gray-800">
              보드 크기
            </label>
            <div className="flex gap-2">
                {availableBoardSizes.map((size) => (
                  <button
                    key={size}
                    onClick={() => setSelectedBoardSize(size)}
                    className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                      selectedBoardSize === size
                        ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg scale-105'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    {size}×{size}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* 시간 제한 */}
        <div>
            <label className="mb-3 block text-sm font-bold text-gray-800">
              시간 제한
            </label>
            <select
              value={timeLimit}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-50 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value={600}>10분</option>
              <option value={900}>15분</option>
              <option value={1800}>30분</option>
              <option value={3600}>60분</option>
            </select>
        </div>

        {/* 신청 버튼 */}
        <button
            onClick={handleSendRequest}
            disabled={!selectedGameType || loading}
            className="w-full rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-3 text-lg font-bold text-white shadow-lg transition-all hover:from-green-600 hover:to-emerald-700 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
          {loading ? '신청 중...' : '대국 신청하기'}
        </button>
      </div>
    </DraggableModal>
  );
}

