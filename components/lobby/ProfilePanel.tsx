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
    <div className="baduk-card p-3 animate-fade-in h-full flex flex-col">
      <div className="mb-2 flex items-center gap-2 border-b border-gray-200 pb-2 dark:border-gray-700">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
          <span className="text-sm">👤</span>
        </div>
        <h2 className="text-sm font-bold">내 프로필</h2>
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

        {/* 전략바둑 통합 전적 */}
        <div className="space-y-1 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-100 p-2 dark:from-blue-900/20 dark:to-indigo-900/20">
          <h3 className="text-center text-xs font-semibold text-gray-700 dark:text-gray-300">
            전략바둑
          </h3>
          <div className="grid grid-cols-3 gap-1 text-center">
            <div className="rounded bg-green-50 p-1 dark:bg-green-900/20">
              <p className="text-lg font-bold text-green-600 dark:text-green-400">
                {profile.strategyStats.wins}
              </p>
              <p className="text-[10px] font-medium text-gray-600 dark:text-gray-400">승</p>
            </div>
            <div className="rounded bg-gray-100 p-1 dark:bg-gray-700">
              <p className="text-lg font-bold text-gray-700 dark:text-gray-300">
                {profile.strategyStats.draws}
              </p>
              <p className="text-[10px] font-medium text-gray-600 dark:text-gray-400">무</p>
            </div>
            <div className="rounded bg-red-50 p-1 dark:bg-red-900/20">
              <p className="text-lg font-bold text-red-600 dark:text-red-400">
                {profile.strategyStats.losses}
              </p>
              <p className="text-[10px] font-medium text-gray-600 dark:text-gray-400">패</p>
            </div>
          </div>
        </div>

        {/* 놀이바둑 통합 전적 */}
        <div className="space-y-1 rounded-lg bg-gradient-to-br from-purple-50 to-pink-100 p-2 dark:from-purple-900/20 dark:to-pink-900/20">
          <h3 className="text-center text-xs font-semibold text-gray-700 dark:text-gray-300">
            놀이바둑
          </h3>
          <div className="grid grid-cols-3 gap-1 text-center">
            <div className="rounded bg-green-50 p-1 dark:bg-green-900/20">
              <p className="text-lg font-bold text-green-600 dark:text-green-400">
                {profile.playStats.wins}
              </p>
              <p className="text-[10px] font-medium text-gray-600 dark:text-gray-400">승</p>
            </div>
            <div className="rounded bg-gray-100 p-1 dark:bg-gray-700">
              <p className="text-lg font-bold text-gray-700 dark:text-gray-300">
                {profile.playStats.draws}
              </p>
              <p className="text-[10px] font-medium text-gray-600 dark:text-gray-400">무</p>
            </div>
            <div className="rounded bg-red-50 p-1 dark:bg-red-900/20">
              <p className="text-lg font-bold text-red-600 dark:text-red-400">
                {profile.playStats.losses}
              </p>
              <p className="text-[10px] font-medium text-gray-600 dark:text-gray-400">패</p>
            </div>
          </div>
        </div>

        {/* 상세전적 버튼 */}
        <button
          onClick={() => setShowDetailedStats(true)}
          className="w-full rounded bg-gradient-to-r from-indigo-500 to-purple-600 px-2 py-1 text-xs font-bold text-white shadow-sm transition-all hover:from-indigo-600 hover:to-purple-700"
        >
          📊 상세전적
        </button>
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

