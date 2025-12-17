'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket/client';
import Header from '@/components/lobby/Header';
import ProfilePanel from '@/components/lobby/ProfilePanel';
import RatingDisplay from '@/components/lobby/RatingDisplay';
import AIBattleButton from '@/components/lobby/AIBattleButton';
import OngoingGamesList from '@/components/lobby/OngoingGamesList';
import GameMatchPanel from '@/components/lobby/GameMatchPanel';
import NicknameSetupModal from '@/components/NicknameSetupModal';
import GameRequestNotification from '@/components/lobby/GameRequestNotification';

export default function LobbyPage() {
  const router = useRouter();
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);

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
    socket.emit('lobby:join');

    return () => {
      socket.emit('lobby:leave');
    };
  }, [router]);

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 p-8 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="mx-auto w-full max-w-7xl">
        <Header />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* 왼쪽 열: 프로필 및 레이팅 */}
          <div className="space-y-6">
            <ProfilePanel />
            <RatingDisplay />
          </div>

          {/* 중앙 열: AI 대결 및 경기중인 대국실 */}
          <div className="space-y-6">
            <AIBattleButton />
            <OngoingGamesList />
          </div>

          {/* 오른쪽 열: 게임 타입 선택, 접속 유저 목록, 랭킹전 매칭 */}
          <div>
            <GameMatchPanel />
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
