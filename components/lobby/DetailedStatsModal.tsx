'use client';

import { useState, useEffect } from 'react';
import { getGameType, ALL_GAME_TYPES } from '@/lib/game/types';
import DraggableModal from '@/components/ui/DraggableModal';

interface GameStat {
  gameType: string;
  mode: string;
  wins: number;
  losses: number;
  draws: number;
  total: number;
}

interface DetailedStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameStats: GameStat[];
}

export default function DetailedStatsModal({
  isOpen,
  onClose,
  gameStats,
}: DetailedStatsModalProps) {
  const strategyStats = gameStats.filter((s) => s.mode === 'STRATEGY');
  const playStats = gameStats.filter((s) => s.mode === 'PLAY');

  // 모달이 열릴 때마다 위치 기억을 초기화하여 항상 중앙에 표시
  useEffect(() => {
    if (isOpen) {
      localStorage.removeItem('modal_detailed-stats_remember');
      localStorage.removeItem('modal_detailed-stats_position');
    }
  }, [isOpen]);

  return (
    <DraggableModal
      isOpen={isOpen}
      onClose={onClose}
      title="상세 전적"
      modalId="detailed-stats"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-6">
          {/* 전략바둑 */}
          {strategyStats.length > 0 && (
            <div>
              <h3 className="mb-3 text-lg font-semibold text-blue-600">
                전략바둑
              </h3>
              <div className="space-y-2">
                {strategyStats.map((stat) => {
                  const gameType = getGameType(stat.gameType);
                  return (
                    <div
                      key={stat.gameType}
                      className="flex items-center justify-between rounded-lg border border-indigo-200 bg-gradient-to-r from-indigo-50 to-blue-50 p-4 backdrop-blur-sm hover:border-indigo-300 hover:shadow-md transition-all"
                    >
                      <div className="flex-1">
                        <p className="font-bold text-gray-800">{gameType?.name || stat.gameType}</p>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-green-600 font-semibold">
                          승 {stat.wins}
                        </span>
                        <span className="text-gray-500">
                          무 {stat.draws}
                        </span>
                        <span className="text-red-600 font-semibold">패 {stat.losses}</span>
                        <span className="text-blue-600 font-bold">
                          승률 {stat.total > 0 ? Math.round((stat.wins / stat.total) * 100) : 0}%
                        </span>
                        <span className="text-gray-600">총 {stat.total}경기</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 놀이바둑 */}
          {playStats.length > 0 && (
            <div>
              <h3 className="mb-3 text-lg font-semibold text-purple-600">
                놀이바둑
              </h3>
              <div className="space-y-2">
                {playStats.map((stat) => {
                  const gameType = getGameType(stat.gameType);
                  return (
                    <div
                      key={stat.gameType}
                      className="flex items-center justify-between rounded-lg border border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50 p-4 backdrop-blur-sm hover:border-purple-300 hover:shadow-md transition-all"
                    >
                      <div className="flex-1">
                        <p className="font-bold text-gray-800">{gameType?.name || stat.gameType}</p>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-green-600 font-semibold">
                          승 {stat.wins}
                        </span>
                        <span className="text-gray-500">
                          무 {stat.draws}
                        </span>
                        <span className="text-red-600 font-semibold">패 {stat.losses}</span>
                        <span className="text-purple-600 font-bold">
                          승률 {stat.total > 0 ? Math.round((stat.wins / stat.total) * 100) : 0}%
                        </span>
                        <span className="text-gray-600">총 {stat.total}경기</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        {gameStats.length === 0 && (
          <div className="py-8 text-center text-gray-500">
            전적이 없습니다.
          </div>
        )}
      </div>
    </DraggableModal>
  );
}

