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
    <div className="h-screen overflow-hidden premium-lobby-bg p-3">
      <div className="mx-auto h-full w-full max-w-[1600px] flex flex-col">
        <div className="mb-2">
          <Header mode={selectedMode} onModeChange={setSelectedMode} />
        </div>

        <div className="flex-1 grid grid-cols-[3fr_1fr] gap-3 overflow-hidden">
          {/* 좌측 레이아웃: 프로필+레이팅, 진행중인 대국, 채팅 */}
          <div className="flex flex-col gap-3 overflow-hidden">
            {/* 프로필 패널 + 레이팅 패널 (가로로 나눔) */}
            <div className="grid grid-cols-2 gap-3 flex-shrink-0">
              <div className="min-w-0">
                <div className="premium-card h-full">
                  <ProfilePanel />
                </div>
              </div>
              <div className="min-w-0">
                <div className="premium-card h-full">
                  <RatingDisplay mode={selectedMode} />
                </div>
              </div>
            </div>
            
            {/* 진행중인 대국 패널 (높이 비율 2) */}
            <div className="flex-[2] min-h-0">
              <div className="premium-card h-full">
                <OngoingGamesList mode={selectedMode} />
              </div>
            </div>
            
            {/* 채팅 패널 (높이 비율 1) */}
            <div className="flex-[1] min-h-0">
              <div className="premium-card h-full">
                <ChatPanel type="GLOBAL" />
              </div>
            </div>
          </div>

          {/* 우측 레이아웃: 유저목록, 랭킹 (3:2 비율) */}
          <div className="flex flex-col gap-3 overflow-hidden">
            {/* 유저목록 패널 (높이 비율 3) */}
            <div className="flex-[3] min-h-0">
              <div className="premium-card h-full">
                <OnlineUsersList mode={selectedMode} />
              </div>
            </div>
            
            {/* 랭킹 패널 (높이 비율 2) */}
            <div className="flex-[2] min-h-0">
              <div className="premium-card h-full">
                <RankingLeaderboard mode={selectedMode} />
              </div>
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
