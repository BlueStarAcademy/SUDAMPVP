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

interface OngoingGamesListProps {
  mode: 'STRATEGY' | 'PLAY';
}

export default function OngoingGamesList({ mode }: OngoingGamesListProps) {
  const router = useRouter();
  const [games, setGames] = useState<OngoingGame[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const response = await fetch('/api/game/ongoing-pvp');
        if (response.ok) {
          const data = await response.json();
          // 모드별로 필터링
          const filteredGames = (data.games || []).filter((game: OngoingGame) => {
            if (!game.gameType) return false;
            const isStrategy = ['CLASSIC', 'CAPTURE', 'SPEED', 'BASE', 'HIDDEN', 'MISSILE', 'MIXED'].includes(game.gameType);
            return mode === 'STRATEGY' ? isStrategy : !isStrategy;
          });
          setGames(filteredGames);
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
        // 모드별로 필터링
        const filteredGames = updatedGames.filter((game: OngoingGame) => {
          if (!game.gameType) return false;
          const isStrategy = ['CLASSIC', 'CAPTURE', 'SPEED', 'BASE', 'HIDDEN', 'MISSILE', 'MIXED'].includes(game.gameType);
          return mode === 'STRATEGY' ? isStrategy : !isStrategy;
        });
        setGames(filteredGames);
      });

      return () => {
        socket.off('game:ongoing-updated');
      };
    }
  }, [mode]);

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

  const modeLabel = mode === 'STRATEGY' ? '전략바둑' : '놀이바둑';
  const modeColor = mode === 'STRATEGY' 
    ? 'from-blue-500 to-indigo-600' 
    : 'from-purple-500 to-pink-600';

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="mb-3 flex items-center gap-2 border-b border-indigo-200 pb-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${modeColor} shadow-lg`}>
          <span className="text-base">🔥</span>
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-800">진행중인 대국</h2>
        </div>
      </div>
      {games.length === 0 ? (
        <div className="py-4 text-center flex-1 flex items-center justify-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">진행 중인 대국 없음</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1">
          {games.map((game) => (
            <div
              key={game.id}
              className="group flex items-center justify-between rounded border border-gray-200 bg-gradient-to-r from-white to-gray-50 p-2 transition-all hover:border-blue-400 dark:border-gray-700 dark:from-gray-800 dark:to-gray-700"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">
                    {game.player1.nickname || game.player1.username}
                  </span>
                  <span className="text-xs">⚫</span>
                  <span className="text-xs">⚪</span>
                  <span className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">
                    {game.player2?.nickname || game.player2?.username || '대기중'}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-gray-600 dark:text-gray-400">
                  <span className="rounded bg-blue-100 px-1 py-0.5 font-medium dark:bg-blue-900/30">
                    {game.gameType || '게임'}
                  </span>
                  <span>{game.boardSize}x{game.boardSize}</span>
                </div>
              </div>
              <button
                onClick={() => handleSpectate(game.id)}
                className="baduk-button-primary ml-2 px-2 py-1 text-xs font-medium shadow-sm transition-transform hover:scale-105 flex-shrink-0"
              >
                👁️
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

