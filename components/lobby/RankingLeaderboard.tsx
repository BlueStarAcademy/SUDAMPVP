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
    <div className="p-4 h-full flex flex-col text-on-panel">
      <div className="mb-3 flex items-center justify-between border-b border-color pb-2">
        <h2 className="text-lg font-semibold text-on-panel">{modeLabel} 랭킹</h2>
      </div>
      
      {rankings.length === 0 ? (
        <div className="py-8 text-center flex-1 flex items-center justify-center">
          <p className="text-tertiary">랭킹 데이터가 없습니다</p>
        </div>
      ) : (
        <ul className="space-y-2 overflow-y-auto pr-2 flex-1">
          {rankings.map((entry, index) => {
            const grade = getGradeFromRating(entry.rating);
            const rank = index + 1;
            const winRate = (entry.wins + entry.losses) > 0 ? Math.round((entry.wins / (entry.wins + entry.losses)) * 100) : 0;
            const isCurrentUser = false; // TODO: 현재 유저 확인
            
            return (
              <li 
                key={entry.id} 
                className={`flex items-center gap-2 rounded-lg p-1.5 ${
                  isCurrentUser 
                    ? 'bg-yellow-900/40 border border-yellow-700' 
                    : 'bg-tertiary/50'
                }`}
              >
                <span className="w-8 text-center font-mono text-sm">{rank}</span>
                <div className="w-8 h-8 flex-shrink-0 bg-tertiary rounded-full flex items-center justify-center">
                  <span className="text-xs">🏆</span>
                </div>
                <div className="flex-grow overflow-hidden">
                  <p className="font-semibold text-sm truncate">{entry.user.nickname || entry.user.username}</p>
                  <p className="text-xs text-highlight font-mono">{Math.round(entry.rating)}점</p>
                </div>
                <div className="text-right text-[10px] lg:text-xs flex-shrink-0 w-20 text-tertiary">
                  <p>{entry.wins}승 {entry.losses}패</p>
                  <p className="font-semibold">{winRate}%</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

