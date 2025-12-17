'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket/client';

interface UserInfo {
  gold: number;
  gameTickets: number;
}

interface HeaderProps {
  mode: 'STRATEGY' | 'PLAY';
  onModeChange: (mode: 'STRATEGY' | 'PLAY') => void;
}

export default function Header({ mode, onModeChange }: HeaderProps) {
  const router = useRouter();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  const handleModeSwitch = () => {
    const newMode = mode === 'STRATEGY' ? 'PLAY' : 'STRATEGY';
    const token = localStorage.getItem('token');
    if (token) {
      const socket = getSocket(token);
      socket.emit('lobby:leave', { mode });
      socket.emit('lobby:join', { mode: newMode });
    }
    onModeChange(newMode);
  };

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        // 이용권 회복 처리
        await fetch('/api/tickets/recover', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(console.error);

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
      <header className="baduk-header mb-2 flex items-center justify-between p-3 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white bg-opacity-20">
            <span className="text-lg">{mode === 'STRATEGY' ? '⚫' : '🎮'}</span>
          </div>
          <h1 className="text-lg font-bold">
            {mode === 'STRATEGY' ? '전략바둑 대기실' : '놀이바둑 대기실'}
          </h1>
          <button
            onClick={handleModeSwitch}
            className={`rounded-lg border-2 px-3 py-1.5 text-xs font-bold shadow-md transition-all ${
              mode === 'STRATEGY'
                ? 'border-purple-600 bg-gradient-to-r from-purple-500 to-pink-600 text-white hover:from-purple-600 hover:to-pink-700'
                : 'border-blue-600 bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700'
            }`}
          >
            {mode === 'STRATEGY' ? '→ 놀이바둑 대기실' : '→ 전략바둑 대기실'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* 골드 표시 */}
          {userInfo && (
            <div className="flex items-center gap-1 rounded bg-yellow-100 px-2 py-1 dark:bg-yellow-900/30">
              <span className="text-sm">💰</span>
              <span className="text-xs font-bold text-yellow-700 dark:text-yellow-300">
                {userInfo.gold.toLocaleString()}
              </span>
            </div>
          )}

          {/* 대국 이용권 표시 */}
          {userInfo && (
            <div className="flex items-center gap-1 rounded bg-blue-100 px-2 py-1 dark:bg-blue-900/30">
              <span className="text-sm">🎫</span>
              <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                {userInfo.gameTickets}/10
              </span>
              {userInfo.gameTickets < 10 && (
                <button
                  onClick={() => {
                    // TODO: 이용권 구매 모달
                    alert('이용권 구매 기능은 준비 중입니다.');
                  }}
                  className="ml-1 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-blue-700"
                >
                  +
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => {
              // TODO: 상점 모달 구현
              alert('상점 기능은 준비 중입니다.');
            }}
            className="baduk-button-primary flex items-center gap-1 px-2 py-1 text-xs"
          >
            <span>🛒</span>
            <span>상점</span>
          </button>
          <button
            onClick={() => router.push('/settings')}
            className="baduk-button-secondary flex items-center gap-1 px-2 py-1 text-xs"
          >
            <span>⚙️</span>
            <span>설정</span>
          </button>
          <button
            onClick={handleLogout}
            className="baduk-button-danger flex items-center gap-1 px-2 py-1 text-xs"
          >
            <span>🚪</span>
            <span>로그아웃</span>
          </button>
        </div>
      </header>
    </>
  );
}

