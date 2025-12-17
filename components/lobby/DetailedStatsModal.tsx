'use client';

import { useState, useEffect } from 'react';
import { getGameType, ALL_GAME_TYPES } from '@/lib/game/types';

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
  if (!isOpen) return null;

  const strategyStats = gameStats.filter((s) => s.mode === 'STRATEGY');
  const playStats = gameStats.filter((s) => s.mode === 'PLAY');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
      <div className="baduk-card w-full max-w-2xl p-6 animate-fade-in">
        <div className="mb-6 flex items-center justify-between border-b border-gray-200 pb-4 dark:border-gray-700">
          <h2 className="text-2xl font-bold">상세 전적</h2>
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            닫기
          </button>
        </div>

        <div className="space-y-6 max-h-96 overflow-y-auto">
          {/* 전략바둑 */}
          {strategyStats.length > 0 && (
            <div>
              <h3 className="mb-3 text-lg font-semibold text-blue-600 dark:text-blue-400">
                전략바둑
              </h3>
              <div className="space-y-2">
                {strategyStats.map((stat) => {
                  const gameType = getGameType(stat.gameType);
                  return (
                    <div
                      key={stat.gameType}
                      className="flex items-center justify-between rounded-lg border-2 border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
                    >
                      <div className="flex-1">
                        <p className="font-bold">{gameType?.name || stat.gameType}</p>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-green-600 dark:text-green-400">
                          승 {stat.wins}
                        </span>
                        <span className="text-gray-600 dark:text-gray-400">
                          무 {stat.draws}
                        </span>
                        <span className="text-red-600 dark:text-red-400">패 {stat.losses}</span>
                        <span className="font-bold">총 {stat.total}경기</span>
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
              <h3 className="mb-3 text-lg font-semibold text-purple-600 dark:text-purple-400">
                놀이바둑
              </h3>
              <div className="space-y-2">
                {playStats.map((stat) => {
                  const gameType = getGameType(stat.gameType);
                  return (
                    <div
                      key={stat.gameType}
                      className="flex items-center justify-between rounded-lg border-2 border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
                    >
                      <div className="flex-1">
                        <p className="font-bold">{gameType?.name || stat.gameType}</p>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-green-600 dark:text-green-400">
                          승 {stat.wins}
                        </span>
                        <span className="text-gray-600 dark:text-gray-400">
                          무 {stat.draws}
                        </span>
                        <span className="text-red-600 dark:text-red-400">패 {stat.losses}</span>
                        <span className="font-bold">총 {stat.total}경기</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {gameStats.length === 0 && (
            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
              전적이 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

