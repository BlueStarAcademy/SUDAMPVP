'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket/client';
import Header from '@/components/lobby/Header';
import ProfilePanel from '@/components/lobby/ProfilePanel';
import RatingDisplay from '@/components/lobby/RatingDisplay';
import AIBattleButton from '@/components/lobby/AIBattleButton';
import OngoingGamesList from '@/components/lobby/OngoingGamesList';
import OnlineUsersList from '@/components/lobby/OnlineUsersList';
import RankingMatchButton from '@/components/lobby/RankingMatchButton';
import RankingLeaderboard from '@/components/lobby/RankingLeaderboard';
import NicknameSetupModal from '@/components/NicknameSetupModal';
import GameRequestNotification from '@/components/lobby/GameRequestNotification';

type GameMode = 'STRATEGY' | 'PLAY';

export default function LobbyPage() {
  const router = useRouter();
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [selectedMode, setSelectedMode] = useState<GameMode>('STRATEGY');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    // 닉네임 설정 완료 여부 확인
    const checkSetup = async () => {
      try {
        const response = await fetch('/api/auth/profile', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (!data.user.hasCompletedSetup) {
            setShowNicknameModal(true);
          }
        }
      } catch (error) {
        console.error('Failed to check setup:', error);
      } finally {
        setCheckingSetup(false);
      }
    };

    checkSetup();

    // Initialize socket connection
    const socket = getSocket(token);
    socket.emit('lobby:join', { mode: selectedMode });

    return () => {
      socket.emit('lobby:leave');
    };
  }, [router, selectedMode]);

  const handleNicknameComplete = () => {
    setShowNicknameModal(false);
    // 페이지 새로고침하여 프로필 업데이트
    window.location.reload();
  };

  if (checkingSetup) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 p-4 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="mx-auto w-full max-w-[1600px]">
        <Header />

        {/* 게임 모드 탭 */}
        <div className="mb-6 flex gap-4">
          <button
            onClick={() => {
              setSelectedMode('STRATEGY');
              const socket = getSocket(localStorage.getItem('token') || '');
              socket.emit('lobby:join', { mode: 'STRATEGY' });
            }}
            className={`flex-1 rounded-xl border-4 px-6 py-4 text-xl font-bold shadow-lg transition-all ${
              selectedMode === 'STRATEGY'
                ? 'border-blue-600 bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-blue-500/50 scale-105'
                : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            <div className="flex items-center justify-center gap-3">
              <span className="text-3xl">⚫</span>
              <span>전략바둑 대기실</span>
            </div>
          </button>
          <button
            onClick={() => {
              setSelectedMode('PLAY');
              const socket = getSocket(localStorage.getItem('token') || '');
              socket.emit('lobby:join', { mode: 'PLAY' });
            }}
            className={`flex-1 rounded-xl border-4 px-6 py-4 text-xl font-bold shadow-lg transition-all ${
              selectedMode === 'PLAY'
                ? 'border-purple-600 bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-purple-500/50 scale-105'
                : 'border-gray-300 bg-white text-gray-700 hover:border-purple-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            <div className="flex items-center justify-center gap-3">
              <span className="text-3xl">🎮</span>
              <span>놀이바둑 대기실</span>
            </div>
          </button>
        </div>

        <div className="space-y-4">
          {/* 첫 번째 줄: 프로필 패널, 레이팅 패널, AI봇 대결 패널 */}
          <div className={`grid grid-cols-1 gap-4 ${selectedMode === 'STRATEGY' ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            <ProfilePanel />
            <RatingDisplay mode={selectedMode} />
            {selectedMode === 'STRATEGY' && <AIBattleButton />}
          </div>

          {/* 두 번째 줄: 경기중인 대국실 목록 패널, 유저목록 패널 */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <OngoingGamesList mode={selectedMode} />
            <OnlineUsersList mode={selectedMode} />
          </div>

          {/* 세 번째 줄: 랭킹전 매칭 패널, 랭킹전 순위 패널 */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="baduk-card p-6 animate-fade-in border-2 border-gray-200 dark:border-gray-700">
              <div className="mb-4 flex items-center gap-3 border-b-2 border-gray-200 pb-4 dark:border-gray-700">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-red-600 shadow-lg">
                  <span className="text-2xl">🏆</span>
                </div>
                <h2 className="text-xl font-bold">랭킹전 매칭</h2>
              </div>
              <RankingMatchButton />
            </div>
            <RankingLeaderboard mode={selectedMode} />
          </div>
        </div>
      </div>

      {/* 닉네임 설정 모달 */}
      <NicknameSetupModal
        isOpen={showNicknameModal}
        onComplete={handleNicknameComplete}
      />

      {/* 대국 신청 알림 */}
      <GameRequestNotification />
    </div>
  );
}
