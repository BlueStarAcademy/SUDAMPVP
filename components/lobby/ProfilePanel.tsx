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

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="mb-3 flex items-center gap-2 border-b border-indigo-200 pb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
          <span className="text-base">👤</span>
        </div>
        <h2 className="text-base font-bold text-gray-800">내 프로필</h2>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {/* 아바타 */}
        <div className="flex justify-center">
          <div className="relative h-16 w-16 rounded-full overflow-hidden border-2 border-gradient-to-br from-blue-400 to-purple-500 shadow-md">
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
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500 text-white">
                <span className="text-2xl">👤</span>
              </div>
            )}
          </div>
        </div>

        {/* 닉네임 */}
        <div className="text-center">
          <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
            {profile.user.nickname || '닉네임 없음'}
          </p>
        </div>

        {/* 통합 전적 */}
        <div className="space-y-2 rounded-lg bg-gradient-to-br from-indigo-50 to-purple-100 p-3 dark:from-indigo-900/20 dark:to-purple-900/20">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">전적</h3>
            <button
              onClick={() => setShowDetailedStats(true)}
              className="rounded bg-gradient-to-r from-indigo-500 to-purple-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm transition-all hover:from-indigo-600 hover:to-purple-700"
            >
              상세보기
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded bg-green-50 p-2 dark:bg-green-900/20">
              <p className="text-xl font-bold text-green-600 dark:text-green-400">
                {profile.strategyStats.wins + profile.playStats.wins}
              </p>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">승</p>
            </div>
            <div className="rounded bg-red-50 p-2 dark:bg-red-900/20">
              <p className="text-xl font-bold text-red-600 dark:text-red-400">
                {profile.strategyStats.losses + profile.playStats.losses}
              </p>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">패</p>
            </div>
            <div className="rounded bg-blue-50 p-2 dark:bg-blue-900/20">
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {(() => {
                  const total = profile.strategyStats.total + profile.playStats.total;
                  const wins = profile.strategyStats.wins + profile.playStats.wins;
                  return total > 0 ? Math.round((wins / total) * 100) : 0;
                })()}%
              </p>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">승률</p>
            </div>
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


