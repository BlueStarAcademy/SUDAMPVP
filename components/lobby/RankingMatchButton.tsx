'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface RankingMatchButtonProps {
  selectedGameType?: string;
  selectedBoardSize?: number;
}

export default function RankingMatchButton({
  selectedGameType,
  selectedBoardSize,
}: RankingMatchButtonProps) {
  const router = useRouter();
  const [matching, setMatching] = useState(false);

  const handleRankingMatch = async () => {
    if (!selectedGameType) {
      alert('게임 타입을 먼저 선택해주세요.');
      return;
    }

    setMatching(true);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        alert('로그인이 필요합니다.');
        return;
      }

      // 랭킹전 매칭 (빠른 매칭)
      const mode = selectedGameType.includes('CLASSIC') ||
        selectedGameType.includes('CAPTURE') ||
        selectedGameType.includes('SPEED') ||
        selectedGameType.includes('BASE') ||
        selectedGameType.includes('HIDDEN') ||
        selectedGameType.includes('MISSILE') ||
        selectedGameType.includes('MIXED')
        ? 'STRATEGY'
        : 'PLAY';

      const response = await fetch('/api/game/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode,
          gameType: selectedGameType,
          boardSize: selectedBoardSize || 19,
          // opponentId 없으면 자동 매칭
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || '매칭 실패');
        return;
      }

      router.push(`/game/${data.gameId}`);
    } catch (error) {
      console.error('Ranking match error:', error);
      alert('매칭 중 오류가 발생했습니다');
    } finally {
      setMatching(false);
    }
  };

  return (
    <button
      onClick={handleRankingMatch}
      disabled={matching || !selectedGameType}
      className="baduk-button w-full bg-gradient-to-r from-orange-500 to-red-600 px-6 py-5 text-lg font-bold text-white shadow-lg transition-all hover:scale-105 hover:from-orange-600 hover:to-red-700 disabled:opacity-50 disabled:hover:scale-100"
    >
      <span className="flex items-center justify-center gap-2">
        {matching ? (
          <>
            <span className="animate-spin">⏳</span>
            <span>매칭 중...</span>
          </>
        ) : (
          <>
            <span className="text-2xl">⚡</span>
            <span>랭킹전 매칭</span>
          </>
        )}
      </span>
    </button>
  );
}

