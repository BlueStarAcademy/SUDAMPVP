'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { DEFAULT_AVATARS } from '@/lib/constants/avatars';
import DetailedStatsModal from './DetailedStatsModal';

interface ProfileData {
  user: {
    id: string;
    nickname: string | null;
    avatarId: string | null;
    gold: number;
    gameTickets: number;
  };
  strategyStats: {
    wins: number;
    losses: number;
    draws: number;
    total: number;
  };
  playStats: {
    wins: number;
    losses: number;
    draws: number;
    total: number;
  };
  gameStats: Array<{
    gameType: string;
    mode: string;
    wins: number;
    losses: number;
    draws: number;
    total: number;
  }>;
}

export default function ProfilePanel() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetailedStats, setShowDetailedStats] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
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
          setProfile(data);
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
        <p>로딩 중...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
        <p>프로필을 불러올 수 없습니다.</p>
      </div>
    );
  }

  const avatar = profile.user.avatarId
    ? DEFAULT_AVATARS.find((a) => a.id === profile.user.avatarId) || DEFAULT_AVATARS[0]
    : DEFAULT_AVATARS[0];

  const totalWins = profile.strategyStats.wins + profile.playStats.wins;
  const totalLosses = profile.strategyStats.losses + profile.playStats.losses;
  const totalDraws = profile.strategyStats.draws + profile.playStats.draws;
  const totalGames = profile.strategyStats.total + profile.playStats.total;
  const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

  return (
    <div className="p-4 h-full flex flex-col text-on-panel">
      <div className="mb-3 flex items-center justify-between border-b border-color pb-2">
        <div>
          <h2 className="text-lg font-semibold text-on-panel">내 프로필</h2>
        </div>
        <button
          onClick={() => setShowDetailedStats(true)}
          className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-3 py-1.5 text-xs font-bold text-white shadow-md transition-all hover:from-indigo-600 hover:to-purple-700 hover:shadow-lg hover:scale-105"
        >
          상세보기
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {/* 프로필 헤더 */}
        <div className="rounded-lg bg-tertiary/30 p-3 border border-color">
          <div className="flex items-center gap-3">
            {/* 아바타 슬롯 */}
            <div className="relative h-16 w-16 rounded-lg overflow-hidden border-2 border-color bg-tertiary/50 flex-shrink-0">
              {avatar.imagePath ? (
                <Image
                  src={avatar.imagePath}
                  alt={profile.user.nickname || '아바타'}
                  fill
                  className="object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-400 to-purple-500 text-white">
                  <span className="text-2xl">👤</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-on-panel truncate mb-1">
                {profile.user.nickname || '닉네임 없음'}
              </h3>
            </div>
          </div>
        </div>

        {/* 전적 표 - 무승부 제거, 여백 추가 */}
        <div className="rounded-lg border border-color bg-tertiary/30 overflow-hidden">
          <div className="bg-tertiary/50 px-4 py-2.5 border-b border-color">
            <h3 className="text-xs font-semibold text-on-panel">통합 전적</h3>
          </div>
          <div className="overflow-x-auto p-2">
            <table className="w-full text-xs">
              <thead className="bg-tertiary/30">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold text-on-panel">구분</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-on-panel">전략바둑</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-on-panel">놀이바둑</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-on-panel">합계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-color/50">
                <tr className="hover:bg-tertiary/40 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-on-panel">승</td>
                  <td className="px-4 py-2.5 text-center font-semibold text-green-400">{profile.strategyStats.wins}</td>
                  <td className="px-4 py-2.5 text-center font-semibold text-green-400">{profile.playStats.wins}</td>
                  <td className="px-4 py-2.5 text-center font-semibold text-green-400">{totalWins}</td>
                </tr>
                <tr className="hover:bg-tertiary/40 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-on-panel">패</td>
                  <td className="px-4 py-2.5 text-center font-semibold text-red-400">{profile.strategyStats.losses}</td>
                  <td className="px-4 py-2.5 text-center font-semibold text-red-400">{profile.playStats.losses}</td>
                  <td className="px-4 py-2.5 text-center font-semibold text-red-400">{totalLosses}</td>
                </tr>
                <tr className="bg-tertiary/50 font-semibold">
                  <td className="px-4 py-2.5 font-semibold text-on-panel">합계</td>
                  <td className="px-4 py-2.5 text-center font-semibold text-on-panel">{profile.strategyStats.total}</td>
                  <td className="px-4 py-2.5 text-center font-semibold text-on-panel">{profile.playStats.total}</td>
                  <td className="px-4 py-2.5 text-center font-semibold text-on-panel">{totalGames}</td>
                </tr>
                <tr className="bg-highlight/20">
                  <td className="px-4 py-2.5 font-semibold text-on-panel">승률</td>
                  <td className="px-4 py-2.5 text-center font-semibold text-highlight" colSpan={3}>
                    {winRate}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 상세전적 모달 */}
      <DetailedStatsModal
        isOpen={showDetailedStats}
        onClose={() => setShowDetailedStats(false)}
        gameStats={profile.gameStats}
      />
    </div>
  );
}


