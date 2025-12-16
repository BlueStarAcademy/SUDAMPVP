'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOnlineUsers } from '@/lib/hooks/useOnlineUsers';
import { getSocket, getSocketInstance } from '@/lib/socket/client';

export default function LobbyPage() {
  const router = useRouter();
  const { users, loading } = useOnlineUsers();
  const [selectedMode, setSelectedMode] = useState<'STRATEGY' | 'PLAY' | null>(null);
  const [selectedOpponent, setSelectedOpponent] = useState<string | null>(null);
  const [aiType, setAiType] = useState<'gnugo' | 'katago' | null>(null);
  const [matching, setMatching] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    // Initialize socket connection
    const socket = getSocket(token);
    socket.emit('lobby:join');

    return () => {
      socket.emit('lobby:leave');
    };
  }, [router]);

  const handleStartGame = async (opponentId?: string, ai?: 'gnugo', aiLevel?: number) => {
    if (!selectedMode) {
      alert('게임 모드를 선택하세요');
      return;
    }

    setMatching(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/game/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode: selectedMode,
          opponentId: opponentId || null,
          aiType: ai || null,
          aiLevel: aiLevel || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || '게임 생성 실패');
        return;
      }

      router.push(`/game/${data.gameId}`);
    } catch (error) {
      console.error('Game creation error:', error);
      alert('게임 생성 중 오류가 발생했습니다');
    } finally {
      setMatching(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col p-8">
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="mb-8 text-4xl font-bold">대기실</h1>

        {/* Game Mode Selection */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          <h2 className="mb-4 text-2xl font-semibold">게임 모드 선택</h2>
          <div className="flex gap-4">
            <button
              onClick={() => setSelectedMode('STRATEGY')}
              className={`flex-1 rounded-lg px-6 py-4 text-lg font-medium transition-colors ${
                selectedMode === 'STRATEGY'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200'
              }`}
            >
              전략바둑
            </button>
            <button
              onClick={() => setSelectedMode('PLAY')}
              className={`flex-1 rounded-lg px-6 py-4 text-lg font-medium transition-colors ${
                selectedMode === 'PLAY'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200'
              }`}
            >
              놀이바둑
            </button>
          </div>
        </div>

        {/* Online Users */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          <h2 className="mb-4 text-2xl font-semibold">접속 중인 사용자</h2>
          {loading ? (
            <p>로딩 중...</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                >
                  <span className="font-medium">{user.username}</span>
                  {selectedMode && (
                    <button
                      onClick={() => {
                        setSelectedOpponent(user.id);
                        handleStartGame(user.id);
                      }}
                      disabled={matching}
                      className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      대전
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Bot Options - GnuGo 단계별 */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          <h2 className="mb-4 text-2xl font-semibold">GnuGo와 대결 (단계별)</h2>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            현재 레벨에서 승리하면 다음 단계로 진행할 수 있습니다.
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
              <button
                key={level}
                onClick={() => handleStartGame(undefined, 'gnugo', level)}
                disabled={!selectedMode || matching}
                className="rounded-lg bg-green-600 px-4 py-3 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {level}단계
              </button>
            ))}
          </div>
        </div>

        {/* Quick Match */}
        <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          <h2 className="mb-4 text-2xl font-semibold">빠른 매칭</h2>
          <button
            onClick={() => handleStartGame()}
            disabled={!selectedMode || matching}
            className="w-full rounded-lg bg-orange-600 px-6 py-4 text-lg font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {matching ? '매칭 중...' : '빠른 매칭 시작'}
          </button>
        </div>

        {/* View Ongoing Games */}
        <div className="mt-8">
          <a
            href="/spectator"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            진행 중인 게임 관전하기 →
          </a>
        </div>
      </div>
    </div>
  );
}

