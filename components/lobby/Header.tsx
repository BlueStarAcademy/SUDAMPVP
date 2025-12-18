'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket/client';
import Button from '@/components/ui/Button';

interface UserInfo {
  gold: number;
  gameTickets: number;
  nickname?: string;
  strategyLevel?: number;
  playfulLevel?: number;
  avatarId?: number;
  borderId?: number;
  mbti?: string;
}

interface HeaderProps {
  mode: 'STRATEGY' | 'PLAY';
  onModeChange: (mode: 'STRATEGY' | 'PLAY') => void;
}

const ResourceDisplay = ({ icon, value, className }: { icon: string; value: number; className?: string }) => {
  const formattedValue = useMemo(() => value.toLocaleString(), [value]);
  return (
    <div className={`flex items-center gap-1 sm:gap-2 bg-tertiary/50 rounded-full py-1 pl-1 pr-2 sm:pr-3 shadow-inner flex-shrink-0 ${className ?? ''}`}>
      <div className="bg-primary w-7 h-7 flex items-center justify-center rounded-full text-lg flex-shrink-0">
        <span className="text-lg">{icon}</span>
      </div>
      <span className="font-bold text-[9px] sm:text-sm text-primary whitespace-nowrap">{formattedValue}</span>
    </div>
  );
};

export default function Header({ mode, onModeChange }: HeaderProps) {
  const router = useRouter();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isMobileMenuOpen && !target.closest('.mobile-menu-container')) {
        setIsMobileMenuOpen(false);
      }
    };
    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

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
            nickname: data.user.nickname,
            strategyLevel: data.user.strategyLevel || 1,
            playfulLevel: data.user.playfulLevel || 1,
            avatarId: data.user.avatarId,
            borderId: data.user.borderId,
            mbti: data.user.mbti,
          });
        }
      } catch (error) {
        console.error('Failed to fetch user info:', error);
      }
    };

    fetchUserInfo();
    const interval = setInterval(fetchUserInfo, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  const openShop = () => {
    alert('상점 기능은 준비 중입니다.');
  };

  const openSettingsModal = () => {
    router.push('/settings');
  };

  if (!userInfo) return null;

  return (
    <header className="flex-shrink-0 bg-primary/80 backdrop-blur-sm shadow-lg relative z-50">
      <div className="p-2.5 sm:p-3 flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-2 sm:gap-3 min-h-[70px] sm:min-h-[75px]">
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 min-w-0 cursor-pointer relative">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-secondary border-2 border-color flex items-center justify-center">
            <span className="text-xl">👤</span>
          </div>
          <div className="hidden sm:block min-w-0">
            <h1 className="font-bold text-primary truncate whitespace-nowrap">{userInfo.nickname || '사용자'}</h1>
            <p className="text-xs text-tertiary truncate whitespace-nowrap">전략 Lv.{userInfo.strategyLevel} / 놀이 Lv.{userInfo.playfulLevel}</p>
          </div>
          {!userInfo.mbti && (
            <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
          )}
        </div>

        <div className="flex-1 w-full sm:w-auto flex flex-wrap sm:flex-nowrap items-center justify-end gap-1 sm:gap-2">
          <ResourceDisplay icon="💰" value={userInfo.gold} className="flex-shrink-0" />
          <ResourceDisplay icon="🎫" value={userInfo.gameTickets} className="flex-shrink-0" />
          
          <div className="h-9 w-px bg-border-color mx-1 sm:mx-2 flex-shrink-0"></div>
          
          {/* 데스크톱 버튼들 */}
          <div className="hidden sm:flex items-center gap-1 sm:gap-2">
            <button
              onClick={openShop}
              className="p-2 rounded-lg text-xl hover:bg-secondary transition-colors"
              title="상점"
            >
              🛒
            </button>
            <button
              onClick={openSettingsModal}
              className="p-2 rounded-lg text-xl hover:bg-secondary transition-colors"
              title="설정"
            >
              ⚙️
            </button>
            <Button
              onClick={handleLogout}
              colorScheme="none"
              className="whitespace-nowrap !px-3 !py-1.5 text-[9px] sm:text-xs rounded-lg border border-rose-300/55 bg-gradient-to-r from-rose-500/85 via-red-500/80 to-orange-400/80 text-white shadow-[0_10px_22px_-18px_rgba(248,113,113,0.55)] hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-16px_rgba(248,113,113,0.6)]"
              style={{ letterSpacing: '0.08em' }}
            >
              로그아웃
            </Button>
          </div>

          {/* 모바일 메뉴 버튼 */}
          <div className="sm:hidden relative mobile-menu-container">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-lg text-xl hover:bg-secondary transition-colors flex items-center"
              title="메뉴"
            >
              <span className={`transition-transform duration-200 ${isMobileMenuOpen ? 'rotate-180' : ''}`}>
                ▼
              </span>
            </button>
            {isMobileMenuOpen && (
              <div className="fixed right-2 top-[70px] bg-primary border border-color rounded-lg shadow-2xl z-[9999999] min-w-[60px] py-2" style={{ zIndex: 9999999 }}>
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    openShop();
                  }}
                  className="w-full px-3 py-3 hover:bg-secondary transition-colors flex items-center justify-center"
                  title="상점"
                >
                  <span className="text-2xl">🛒</span>
                </button>
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    openSettingsModal();
                  }}
                  className="w-full px-3 py-3 hover:bg-secondary transition-colors flex items-center justify-center"
                  title="설정"
                >
                  <span className="text-2xl">⚙️</span>
                </button>
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full px-3 py-3 bg-red-500/90 hover:bg-red-600 transition-colors flex items-center justify-center rounded"
                  title="로그아웃"
                >
                  <span className="text-2xl">⏻</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

