'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getGameType } from '@/lib/game/types';

interface OngoingGame {
  id: string;
  gameType: string | null;
  boardSize: number | null;
  player1: { id: string; username: string; nickname: string | null };
  player2: { id: string; username: string; nickname: string | null } | null;
  status: string;
  startedAt: string | null;
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
      // ongoing-pvp API 사용 (AI 대결 제외, 유저간 대결만)
      const response = await fetch('/api/game/ongoing-pvp', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        let games = data.games || [];
        
        // 모드 필터링 (클라이언트 측)
        if (selectedMode) {
          games = games.filter((game: any) => {
            if (selectedMode === 'STRATEGY') {
              return game.gameType && ['CLASSIC', 'CAPTURE', 'SPEED', 'BASE', 'HIDDEN', 'MISSILE', 'MIXED'].includes(game.gameType);
            } else if (selectedMode === 'PLAY') {
              return game.gameType && ['OMOK', 'TTAMOK', 'DICE', 'THIEF_COP', 'ALKKAGI', 'CURLING'].includes(game.gameType);
            }
            return true;
          });
        }
        
        setGames(games);
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
                        {game.player1.nickname || game.player1.username}
                      </span>
                      <span className="text-gray-500">⚫ vs ⚪</span>
                      <span className="font-medium">
                        {game.player2?.nickname || game.player2?.username}
                      </span>
                      {game.gameType && (
                        <span className="rounded-full bg-gradient-to-r from-blue-500 to-purple-600 px-2 py-1 text-xs font-bold text-white">
                          {getGameType(game.gameType)?.name || game.gameType}
                        </span>
                      )}
                      {game.boardSize && (
                        <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                          {game.boardSize}×{game.boardSize}
                        </span>
                      )}
                    </div>
                  </div>
                  <Link
                    href={`/spectator/${game.id}`}
                    className="baduk-button-primary rounded-full px-6 py-2 font-medium"
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

