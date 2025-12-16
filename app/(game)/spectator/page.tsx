'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface OngoingGame {
  id: string;
  mode: string;
  player1: { id: string; username: string };
  player2: { id: string; username: string } | null;
  aiType: string | null;
  createdAt: string;
  _count: { spectators: number };
}

export default function SpectatorPage() {
  const router = useRouter();
  const [games, setGames] = useState<OngoingGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMode, setSelectedMode] = useState<'STRATEGY' | 'PLAY' | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    fetchGames();
    const interval = setInterval(fetchGames, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [router, selectedMode]);

  const fetchGames = async () => {
    try {
      const token = localStorage.getItem('token');
      const url = selectedMode
        ? `/api/game/ongoing?mode=${selectedMode}`
        : '/api/game/ongoing';

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setGames(data.games);
      }
    } catch (error) {
      console.error('Failed to fetch games:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col p-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-4xl font-bold">관전</h1>
          <Link
            href="/lobby"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            ← 대기실로 돌아가기
          </Link>
        </div>

        {/* Mode Filter */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          <h2 className="mb-4 text-2xl font-semibold">모드 필터</h2>
          <div className="flex gap-4">
            <button
              onClick={() => setSelectedMode(null)}
              className={`rounded-lg px-6 py-2 font-medium transition-colors ${
                selectedMode === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200'
              }`}
            >
              전체
            </button>
            <button
              onClick={() => setSelectedMode('STRATEGY')}
              className={`rounded-lg px-6 py-2 font-medium transition-colors ${
                selectedMode === 'STRATEGY'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200'
              }`}
            >
              전략바둑
            </button>
            <button
              onClick={() => setSelectedMode('PLAY')}
              className={`rounded-lg px-6 py-2 font-medium transition-colors ${
                selectedMode === 'PLAY'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200'
              }`}
            >
              놀이바둑
            </button>
          </div>
        </div>

        {/* Games List */}
        <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          <h2 className="mb-4 text-2xl font-semibold">진행 중인 게임</h2>
          {loading ? (
            <p>로딩 중...</p>
          ) : games.length === 0 ? (
            <p className="text-gray-500">진행 중인 게임이 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {games.map((game) => (
                <div
                  key={game.id}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-4">
                      <span className="font-medium">
                        {game.player1.username}
                      </span>
                      <span className="text-gray-500">vs</span>
                      <span className="font-medium">
                        {game.player2?.username || `AI (${game.aiType})`}
                      </span>
                      <span className="rounded bg-gray-200 px-2 py-1 text-xs dark:bg-gray-700">
                        {game.mode === 'STRATEGY' ? '전략바둑' : '놀이바둑'}
                      </span>
                      <span className="text-sm text-gray-500">
                        관전자: {game._count.spectators}명
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/spectator/${game.id}`}
                    className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                  >
                    관전하기
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

