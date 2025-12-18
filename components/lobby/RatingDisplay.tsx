'use client';

import { useEffect, useState } from 'react';
import { getGradeFromRating } from '@/lib/rating/grade';
import RankingMatchButton from './RankingMatchButton';
import SeasonInfoModal from './SeasonInfoModal';

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
  const [showSeasonModal, setShowSeasonModal] = useState(false);

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
    <>
      <div className="p-4 h-full flex flex-col text-on-panel">
        <div className="mb-3 flex items-center justify-between border-b border-color pb-2">
          <div>
            <h2 className="text-lg font-semibold text-on-panel">{modeLabel} 레이팅</h2>
          </div>
          <button
            onClick={() => setShowSeasonModal(true)}
            className="rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-md transition-all hover:from-green-600 hover:to-emerald-700 hover:shadow-lg hover:scale-105 flex items-center gap-1"
          >
            <span>📅</span>
            <span>시즌</span>
          </button>
        </div>
        
        <div className="flex-1 flex flex-col space-y-3 pr-1">
          {/* 레이팅 카드 */}
          <div className="relative overflow-hidden rounded-lg bg-tertiary/30 p-3 border border-color">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-secondary mb-1">현재 레이팅</p>
                <p className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  {currentRating?.rating || rating}
                </p>
              </div>
              <div className="text-right">
                <span
                  className={`inline-block rounded-full bg-gradient-to-r ${gradeColors[gradeInfo.grade] || 'from-gray-400 to-gray-500'} px-3 py-1 text-xs font-bold text-white shadow-md`}
                >
                  {gradeInfo.name}
                </span>
              </div>
            </div>
          </div>

          {/* 전적 표 - 무승부 제거, 여백 추가 */}
          {currentRating && (
            <div className="rounded-lg border border-color bg-tertiary/30 overflow-hidden">
              <div className="bg-tertiary/50 px-4 py-2.5 border-b border-color">
                <h3 className="text-xs font-semibold text-on-panel">전적 정보</h3>
              </div>
              <div className="overflow-x-auto p-2">
                <table className="w-full text-xs">
                  <thead className="bg-tertiary/30">
                    <tr>
                      <th className="px-4 py-2.5 text-center font-semibold text-on-panel">승</th>
                      <th className="px-4 py-2.5 text-center font-semibold text-on-panel">패</th>
                      <th className="px-4 py-2.5 text-center font-semibold text-on-panel">합계</th>
                      <th className="px-4 py-2.5 text-center font-semibold text-on-panel">승률</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="hover:bg-tertiary/40 transition-colors">
                      <td className="px-4 py-2.5 text-center font-semibold text-green-400">{currentRating.wins}</td>
                      <td className="px-4 py-2.5 text-center font-semibold text-red-400">{currentRating.losses}</td>
                      <td className="px-4 py-2.5 text-center font-semibold text-on-panel">{currentRating.wins + currentRating.losses}</td>
                      <td className="px-4 py-2.5 text-center font-semibold text-highlight">
                        {(() => {
                          const total = currentRating.wins + currentRating.losses;
                          return total > 0 ? Math.round((currentRating.wins / total) * 100) : 0;
                        })()}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 랭킹전 매칭 버튼 */}
          <div className="mt-auto">
            <RankingMatchButton />
          </div>
        </div>
      </div>
      <SeasonInfoModal
        isOpen={showSeasonModal}
        onClose={() => setShowSeasonModal(false)}
      />
    </>
  );
}

