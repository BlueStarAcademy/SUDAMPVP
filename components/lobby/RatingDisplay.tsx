'use client';

import { useEffect, useState } from 'react';
import { getGradeFromRating } from '@/lib/rating/grade';

interface RatingData {
  mode: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}

interface RatingDisplayProps {
  mode: 'STRATEGY' | 'PLAY';
}

export default function RatingDisplay({ mode }: RatingDisplayProps) {
  const [ratings, setRatings] = useState<RatingData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRatings = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await fetch('/api/auth/profile', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          // 모드별로 필터링
          const filteredRatings = (data.ratings || []).filter(
            (rating: RatingData) => rating.mode === mode
          );
          setRatings(filteredRatings);
        }
      } catch (error) {
        console.error('Failed to fetch ratings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRatings();
  }, [mode]);

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
        <p>로딩 중...</p>
      </div>
    );
  }

  // 해당 모드의 레이팅 가져오기
  const currentRating = ratings.find((r) => r.mode === mode);
  const rating = currentRating?.rating || 1500;
  const gradeInfo = getGradeFromRating(rating);
  const modeLabel = mode === 'STRATEGY' ? '전략바둑' : '놀이바둑';
  const modeColor = mode === 'STRATEGY' 
    ? 'from-blue-500 to-indigo-600' 
    : 'from-purple-500 to-pink-600';
  
  const gradeColors: Record<string, string> = {
    BEGINNER: 'from-gray-400 to-gray-500',
    INTERMEDIATE: 'from-green-400 to-green-500',
    ADVANCED: 'from-blue-400 to-blue-500',
    EXPERT: 'from-purple-400 to-purple-500',
    MASTER: 'from-yellow-400 to-orange-500',
  };

  return (
    <div className="baduk-card p-6 animate-fade-in border-2 border-gray-200 dark:border-gray-700">
      <div className="mb-6 flex items-center gap-3 border-b-2 border-gray-200 pb-4 dark:border-gray-700">
        <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${modeColor} shadow-lg`}>
          <span className="text-2xl">⭐</span>
        </div>
        <div>
          <h2 className="text-xl font-bold">{modeLabel} 레이팅</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">등급 및 전적</p>
        </div>
      </div>
      <div className="space-y-4">
        {currentRating ? (
          <div className="rounded-lg border-2 border-gray-200 bg-gradient-to-br from-white to-gray-50 p-4 dark:border-gray-700 dark:from-gray-800 dark:to-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-800 dark:text-gray-200">{modeLabel}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`rounded-full bg-gradient-to-r ${gradeColors[gradeInfo.grade] || 'from-gray-400 to-gray-500'} px-3 py-1 text-xs font-bold text-white shadow-md`}
                  >
                    {gradeInfo.name}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-gray-800 dark:text-gray-200">
                  {currentRating.rating}
                </p>
                <p className="mt-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                  {currentRating.wins}승 {currentRating.losses}패 {currentRating.draws}무
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center dark:border-gray-700 dark:bg-gray-800">
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
              아직 게임 기록이 없습니다.
            </p>
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                기본 등급
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-800 dark:text-gray-200">
                {rating}
              </p>
              <span className="mt-2 inline-block rounded-full bg-gradient-to-r from-gray-400 to-gray-500 px-3 py-1 text-xs font-bold text-white">
                {gradeInfo.name}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

