'use client';

import { useState, useEffect } from 'react';
import { ALL_GAME_TYPES, STRATEGY_GAME_TYPES, PLAY_GAME_TYPES } from '@/lib/game/types';

interface GameRequestBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockedGameTypes: string[];
  onSave: (blockedTypes: string[]) => Promise<void>;
}

export default function GameRequestBlockModal({
  isOpen,
  onClose,
  blockedGameTypes,
  onSave,
}: GameRequestBlockModalProps) {
  const [selectedTypes, setSelectedTypes] = useState<string[]>(blockedGameTypes);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedTypes(blockedGameTypes);
    }
  }, [isOpen, blockedGameTypes]);

  if (!isOpen) return null;

  const handleToggle = (gameType: string) => {
    setSelectedTypes((prev) =>
      prev.includes(gameType)
        ? prev.filter((t) => t !== gameType)
        : [...prev, gameType]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(selectedTypes);
      onClose();
    } catch (error) {
      console.error('Failed to save blocked game types:', error);
      alert('설정 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectAll = (category: 'STRATEGY' | 'PLAY') => {
    const types = category === 'STRATEGY' 
      ? Object.keys(STRATEGY_GAME_TYPES)
      : Object.keys(PLAY_GAME_TYPES);
    
    setSelectedTypes((prev) => {
      const allSelected = types.every((t) => prev.includes(t));
      if (allSelected) {
        return prev.filter((t) => !types.includes(t));
      } else {
        const newTypes = [...prev];
        types.forEach((t) => {
          if (!newTypes.includes(t)) {
            newTypes.push(t);
          }
        });
        return newTypes;
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="baduk-card w-full max-w-2xl animate-fade-in">
        <div className="mb-6 flex items-center justify-between border-b border-gray-200 pb-4 dark:border-gray-700">
          <h2 className="text-2xl font-bold">대국 신청 거부 설정</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="mb-6">
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            체크한 게임 타입의 대국 신청을 받지 않습니다.
          </p>

          {/* 전략바둑 */}
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">전략바둑</h3>
              <button
                onClick={() => handleSelectAll('STRATEGY')}
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                {Object.keys(STRATEGY_GAME_TYPES).every((t) =>
                  selectedTypes.includes(t)
                )
                  ? '전체 해제'
                  : '전체 선택'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {Object.entries(STRATEGY_GAME_TYPES).map(([id, gameType]) => (
                <label
                  key={id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-gray-200 p-3 transition-all hover:border-indigo-400 dark:border-gray-700 dark:hover:border-indigo-500"
                >
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(id)}
                    onChange={() => handleToggle(id)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium">{gameType.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 놀이바둑 */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">놀이바둑</h3>
              <button
                onClick={() => handleSelectAll('PLAY')}
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                {Object.keys(PLAY_GAME_TYPES).every((t) =>
                  selectedTypes.includes(t)
                )
                  ? '전체 해제'
                  : '전체 선택'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {Object.entries(PLAY_GAME_TYPES).map(([id, gameType]) => (
                <label
                  key={id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-gray-200 p-3 transition-all hover:border-indigo-400 dark:border-gray-700 dark:hover:border-indigo-500"
                >
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(id)}
                    onChange={() => handleToggle(id)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium">{gameType.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 font-medium text-white shadow-md transition-all hover:from-indigo-600 hover:to-purple-700 hover:shadow-lg disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

