'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket/client';
import Header from '@/components/lobby/Header';
import ProfilePanel from '@/components/lobby/ProfilePanel';
import RatingDisplay from '@/components/lobby/RatingDisplay';
import OngoingGamesList from '@/components/lobby/OngoingGamesList';
import OnlineUsersList from '@/components/lobby/OnlineUsersList';
import RankingLeaderboard from '@/components/lobby/RankingLeaderboard';
import ChatPanel from '@/components/chat/ChatPanel';
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
    <div className="h-screen overflow-hidden bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 p-2 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="mx-auto h-full w-full max-w-[1600px] flex flex-col">
        <div className="mb-2">
          <Header />
        </div>

        {/* 게임 모드 탭 */}
        <div className="mb-2 flex gap-2">
          <button
            onClick={() => {
              setSelectedMode('STRATEGY');
              const socket = getSocket(localStorage.getItem('token') || '');
              socket.emit('lobby:join', { mode: 'STRATEGY' });
            }}
            className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-bold shadow-md transition-all ${
              selectedMode === 'STRATEGY'
                ? 'border-blue-600 bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-blue-500/50'
                : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <span className="text-xl">⚫</span>
              <span>전략바둑</span>
            </div>
          </button>
          <button
            onClick={() => {
              setSelectedMode('PLAY');
              const socket = getSocket(localStorage.getItem('token') || '');
              socket.emit('lobby:join', { mode: 'PLAY' });
            }}
            className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-bold shadow-md transition-all ${
              selectedMode === 'PLAY'
                ? 'border-purple-600 bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-purple-500/50'
                : 'border-gray-300 bg-white text-gray-700 hover:border-purple-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <span className="text-xl">🎮</span>
              <span>놀이바둑</span>
            </div>
          </button>
        </div>

        <div className="flex-1 grid grid-cols-2 gap-3 overflow-hidden">
          {/* 좌측 레이아웃: 프로필, 레이팅+랭킹전 매칭, 진행중인 대국, 채팅 */}
          <div className="flex flex-col gap-3 overflow-hidden">
            {/* 프로필 패널 */}
            <div className="flex-shrink-0">
              <ProfilePanel />
            </div>
            
            {/* 레이팅 점수 + 랭킹전 매칭 버튼 (크게) */}
            <div className="flex-shrink-0">
              <RatingDisplay mode={selectedMode} />
            </div>
            
            {/* 진행중인 대국 패널 */}
            <div className="flex-1 min-h-0">
              <OngoingGamesList mode={selectedMode} />
            </div>
            
            {/* 채팅 패널 */}
            <div className="flex-1 min-h-0">
              <ChatPanel type="GLOBAL" />
            </div>
          </div>

          {/* 우측 레이아웃: 유저목록, 랭킹 (3:2 비율) */}
          <div className="flex flex-col gap-3 overflow-hidden">
            {/* 유저목록 패널 (높이 비율 3) */}
            <div className="flex-[3] min-h-0">
              <OnlineUsersList mode={selectedMode} />
            </div>
            
            {/* 랭킹 패널 (높이 비율 2) */}
            <div className="flex-[2] min-h-0">
              <RankingLeaderboard mode={selectedMode} />
            </div>
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
