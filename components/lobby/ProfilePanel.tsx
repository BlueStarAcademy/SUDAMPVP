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
    <div className="baduk-card p-6 animate-fade-in">
      <div className="mb-6 flex items-center gap-3 border-b border-gray-200 pb-4 dark:border-gray-700">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
          <span className="text-xl">👤</span>
        </div>
        <h2 className="text-xl font-bold">내 프로필</h2>
      </div>
      <div className="space-y-6">
        {/* 아바타 */}
        <div className="flex justify-center">
          <div className="relative h-28 w-28 rounded-full overflow-hidden border-4 border-gradient-to-br from-blue-400 to-purple-500 shadow-lg ring-4 ring-blue-100 dark:ring-blue-900">
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
                <span className="text-4xl">👤</span>
              </div>
            )}
          </div>
        </div>

        {/* 닉네임 */}
        <div className="text-center">
          <p className="text-xl font-bold text-gray-800 dark:text-gray-100">
            {profile.user.nickname || '닉네임 없음'}
          </p>
        </div>

        {/* 전략바둑 통합 전적 */}
        <div className="space-y-3 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-100 p-4 dark:from-blue-900/20 dark:to-indigo-900/20">
          <h3 className="text-center text-sm font-semibold text-gray-700 dark:text-gray-300">
            전략바둑 통합전적
          </h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {profile.strategyStats.wins}
              </p>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">승</p>
            </div>
            <div className="rounded-lg bg-gray-100 p-3 dark:bg-gray-700">
              <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                {profile.strategyStats.draws}
              </p>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">무</p>
            </div>
            <div className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {profile.strategyStats.losses}
              </p>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">패</p>
            </div>
          </div>
          <p className="text-center text-xs font-medium text-gray-600 dark:text-gray-400">
            총 {profile.strategyStats.total}경기
          </p>
        </div>

        {/* 놀이바둑 통합 전적 */}
        <div className="space-y-3 rounded-lg bg-gradient-to-br from-purple-50 to-pink-100 p-4 dark:from-purple-900/20 dark:to-pink-900/20">
          <h3 className="text-center text-sm font-semibold text-gray-700 dark:text-gray-300">
            놀이바둑 통합전적
          </h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {profile.playStats.wins}
              </p>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">승</p>
            </div>
            <div className="rounded-lg bg-gray-100 p-3 dark:bg-gray-700">
              <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                {profile.playStats.draws}
              </p>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">무</p>
            </div>
            <div className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {profile.playStats.losses}
              </p>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">패</p>
            </div>
          </div>
          <p className="text-center text-xs font-medium text-gray-600 dark:text-gray-400">
            총 {profile.playStats.total}경기
          </p>
        </div>

        {/* 상세전적 버튼 */}
        <button
          onClick={() => setShowDetailedStats(true)}
          className="w-full rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-sm font-bold text-white shadow-md transition-all hover:from-indigo-600 hover:to-purple-700 hover:shadow-lg"
        >
          📊 상세전적 보기
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

