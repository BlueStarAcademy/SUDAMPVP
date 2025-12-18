'use client';

import { useState, useEffect } from 'react';
import { ALL_GAME_TYPES, STRATEGY_GAME_TYPES, PLAY_GAME_TYPES } from '@/lib/game/types';
import DraggableModal from '@/components/ui/DraggableModal';

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
    <DraggableModal
      isOpen={isOpen}
      onClose={onClose}
      title="대국 신청 거부 설정"
      modalId="game-request-block"
      maxWidth="max-w-2xl"
    >
      <div className="mb-6">
        <p className="mb-4 text-sm text-secondary">
          체크한 게임 타입의 대국 신청을 받지 않습니다.
        </p>

          {/* 전략바둑 */}
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-highlight">전략바둑</h3>
              <button
                onClick={() => handleSelectAll('STRATEGY')}
                className="text-sm text-accent hover:text-accent-hover font-medium"
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
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-color bg-tertiary/30 p-3 transition-all hover:bg-tertiary/50"
                >
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(id)}
                    onChange={() => handleToggle(id)}
                    className="h-4 w-4 rounded border-color bg-secondary text-accent focus:ring-accent"
                  />
                  <span className="text-sm font-medium text-on-panel">{gameType.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 놀이바둑 */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-highlight">놀이바둑</h3>
              <button
                onClick={() => handleSelectAll('PLAY')}
                className="text-sm text-accent hover:text-accent-hover font-medium"
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
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-color bg-tertiary/30 p-3 transition-all hover:bg-tertiary/50"
                >
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(id)}
                    onChange={() => handleToggle(id)}
                    className="h-4 w-4 rounded border-color bg-secondary text-accent focus:ring-accent"
                  />
                  <span className="text-sm font-medium text-on-panel">{gameType.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg bg-tertiary/30 hover:bg-tertiary/50 px-4 py-2 font-medium text-on-panel border border-color transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg bg-accent hover:bg-accent-hover px-4 py-2 font-medium text-white transition-colors disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
    </DraggableModal>
  );
}

