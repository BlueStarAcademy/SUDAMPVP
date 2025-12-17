'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { DEFAULT_AVATARS } from '@/lib/constants/avatars';

interface ProfileData {
  user: {
    id: string;
    nickname: string | null;
    avatarId: string | null;
  };
  stats: {
    wins: number;
    losses: number;
    draws: number;
    total: number;
  };
}

export default function ProfilePanel() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

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

        {/* 전적 */}
        <div className="space-y-3 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 p-4 dark:from-gray-700 dark:to-gray-800">
          <h3 className="text-center text-sm font-semibold text-gray-700 dark:text-gray-300">
            전적
          </h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                {profile.stats.wins}
              </p>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">승</p>
            </div>
            <div className="rounded-lg bg-gray-100 p-3 dark:bg-gray-700">
              <p className="text-3xl font-bold text-gray-700 dark:text-gray-300">
                {profile.stats.draws}
              </p>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">무</p>
            </div>
            <div className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
              <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                {profile.stats.losses}
              </p>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">패</p>
            </div>
          </div>
          <p className="text-center text-sm font-medium text-gray-600 dark:text-gray-400">
            총 {profile.stats.total}경기
          </p>
        </div>
      </div>
    </div>
  );
}

