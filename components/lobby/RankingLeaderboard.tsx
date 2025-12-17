'use client';

import { useEffect, useState } from 'react';
import { getGradeFromRating } from '@/lib/rating/grade';

interface RankingEntry {
  id: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  user: {
    id: string;
    username: string;
    nickname: string | null;
  };
}

interface RankingLeaderboardProps {
  mode: 'STRATEGY' | 'PLAY';
}

export default function RankingLeaderboard({ mode }: RankingLeaderboardProps) {
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRankings = async () => {
      try {
        const response = await fetch(`/api/rating/leaderboard?mode=${mode}&limit=10`);
        if (response.ok) {
          const data = await response.json();
          setRankings(data.rankings || []);
        }
      } catch (error) {
        console.error('Failed to fetch rankings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRankings();
    // 30초마다 업데이트
    const interval = setInterval(fetchRankings, 30000);
    return () => clearInterval(interval);
  }, [mode]);

  const modeLabel = mode === 'STRATEGY' ? '전략바둑' : '놀이바둑';
  const modeColor = mode === 'STRATEGY' 
    ? 'from-blue-500 to-indigo-600' 
    : 'from-purple-500 to-pink-600';

  if (loading) {
    return (
      <div className="baduk-card p-6 animate-fade-in border-2 border-gray-200 dark:border-gray-700">
        <p>로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="mb-3 flex items-center gap-2 border-b border-indigo-200 pb-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${modeColor} shadow-lg`}>
          <span className="text-base">🏅</span>
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-800">{modeLabel} 랭킹</h2>
        </div>
      </div>
      {rankings.length === 0 ? (
        <div className="py-4 text-center flex-1 flex items-center justify-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">랭킹 데이터 없음</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1">
          {rankings.map((entry, index) => {
            const grade = getGradeFromRating(entry.rating);
            const medalEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;
            
            return (
              <div
                key={entry.id}
                className={`flex items-center justify-between rounded border p-1.5 transition-all ${
                  index < 3
                    ? 'border-yellow-300 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 dark:border-yellow-600'
                    : 'border-gray-200 bg-gradient-to-r from-white to-gray-50 dark:border-gray-700 dark:from-gray-800 dark:to-gray-700'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    index === 0 ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white' :
                    index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-white' :
                    index === 2 ? 'bg-gradient-to-br from-orange-300 to-orange-400 text-white' :
                    'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    {medalEmoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">
                      {entry.user.nickname || entry.user.username}
                    </p>
                    <p className="text-[10px] text-gray-600 dark:text-gray-400">
                      {grade.name} · {entry.wins}승 {entry.losses}패
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                    {entry.rating}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

