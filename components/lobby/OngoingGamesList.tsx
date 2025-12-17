'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket/client';

interface OngoingGame {
  id: string;
  gameType: string | null;
  boardSize: number | null;
  player1: {
    id: string;
    nickname: string | null;
    username: string;
  };
  player2: {
    id: string;
    nickname: string | null;
    username: string;
  } | null;
  status: string;
  startedAt: string | null;
}

export default function OngoingGamesList() {
  const router = useRouter();
  const [games, setGames] = useState<OngoingGame[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const response = await fetch('/api/game/ongoing-pvp');
        if (response.ok) {
          const data = await response.json();
          setGames(data.games || []);
        }
      } catch (error) {
        console.error('Failed to fetch ongoing games:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGames();

    // Socket.io로 실시간 업데이트
    const token = localStorage.getItem('token');
    if (token) {
      const socket = getSocket(token);
      socket.on('game:ongoing-updated', (updatedGames: OngoingGame[]) => {
        setGames(updatedGames);
      });

      return () => {
        socket.off('game:ongoing-updated');
      };
    }
  }, []);

  const handleSpectate = (gameId: string) => {
    router.push(`/game/${gameId}?spectate=true`);
  };

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
        <h2 className="mb-4 text-xl font-semibold">경기중인 대국실</h2>
        <p>로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="baduk-card p-6 animate-fade-in">
      <div className="mb-4 flex items-center gap-3 border-b border-gray-200 pb-4 dark:border-gray-700">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-red-600">
          <span className="text-xl">🔥</span>
        </div>
        <h2 className="text-xl font-bold">경기중인 대국실</h2>
      </div>
      {games.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">현재 진행 중인 대국이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {games.map((game) => (
            <div
              key={game.id}
              className="group flex items-center justify-between rounded-lg border-2 border-gray-200 bg-gradient-to-r from-white to-gray-50 p-4 transition-all hover:border-blue-400 hover:shadow-md dark:border-gray-700 dark:from-gray-800 dark:to-gray-700 dark:hover:border-blue-500"
            >
              <div className="flex-1">
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-bold text-gray-800 dark:text-gray-200">
                    {game.player1.nickname || game.player1.username}
                  </span>
                  <span className="text-lg font-bold text-gray-400">⚫</span>
                  <span className="text-lg font-bold text-gray-300">⚪</span>
                  <span className="font-bold text-gray-800 dark:text-gray-200">
                    {game.player2?.nickname || game.player2?.username || '대기중'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <span className="rounded-full bg-blue-100 px-2 py-1 font-medium dark:bg-blue-900/30">
                    {game.gameType || '게임'}
                  </span>
                  <span>{game.boardSize}x{game.boardSize}</span>
                  <span>·</span>
                  <span>
                    {game.startedAt
                      ? new Date(game.startedAt).toLocaleTimeString()
                      : '대기중'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleSpectate(game.id)}
                className="baduk-button-primary ml-4 px-4 py-2 text-sm font-medium shadow-md transition-transform hover:scale-105"
              >
                👁️ 관전
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

