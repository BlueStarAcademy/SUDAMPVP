'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import SeasonInfoModal from './SeasonInfoModal';

interface UserInfo {
  gold: number;
  gameTickets: number;
}

export default function Header() {
  const router = useRouter();
  const [showSeasonModal, setShowSeasonModal] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await fetch('/api/auth/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setUserInfo({
            gold: data.user.gold || 0,
            gameTickets: data.user.gameTickets || 10,
          });
        }
      } catch (error) {
        console.error('Failed to fetch user info:', error);
      }
    };

    fetchUserInfo();
    // 주기적으로 업데이트 (골드, 이용권)
    const interval = setInterval(fetchUserInfo, 30000); // 30초마다
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  return (
    <>
      <header className="baduk-header mb-6 flex items-center justify-between p-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white bg-opacity-20">
            <span className="text-2xl">⚫</span>
          </div>
          <h1 className="text-3xl font-bold">대기실</h1>
        </div>
        <div className="flex items-center gap-4">
          {/* 골드 표시 */}
          {userInfo && (
            <div className="flex items-center gap-2 rounded-lg bg-yellow-100 px-4 py-2 dark:bg-yellow-900/30">
              <span className="text-xl">💰</span>
              <span className="font-bold text-yellow-700 dark:text-yellow-300">
                {userInfo.gold.toLocaleString()}
              </span>
            </div>
          )}

          {/* 대국 이용권 표시 */}
          {userInfo && (
            <div className="flex items-center gap-2 rounded-lg bg-blue-100 px-4 py-2 dark:bg-blue-900/30">
              <span className="text-xl">🎫</span>
              <span className="font-bold text-blue-700 dark:text-blue-300">
                {userInfo.gameTickets}/10
              </span>
              {userInfo.gameTickets < 10 && (
                <button
                  onClick={() => {
                    // TODO: 이용권 구매 모달
                    alert('이용권 구매 기능은 준비 중입니다.');
                  }}
                  className="ml-2 rounded-full bg-blue-600 px-2 py-1 text-xs font-bold text-white hover:bg-blue-700"
                >
                  +
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => setShowSeasonModal(true)}
            className="baduk-button-success flex items-center gap-2 px-5 py-2.5"
          >
            <span>📅</span>
            <span>시즌 안내</span>
          </button>
          <button
            onClick={() => router.push('/settings')}
            className="baduk-button-secondary flex items-center gap-2 px-5 py-2.5"
          >
            <span>⚙️</span>
            <span>설정</span>
          </button>
          <button
            onClick={handleLogout}
            className="baduk-button-danger flex items-center gap-2 px-5 py-2.5"
          >
            <span>🚪</span>
            <span>로그아웃</span>
          </button>
        </div>
      </header>
      <SeasonInfoModal
        isOpen={showSeasonModal}
        onClose={() => setShowSeasonModal(false)}
      />
    </>
  );
}

