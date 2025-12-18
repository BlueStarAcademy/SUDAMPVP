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
    <div className="p-4 h-full flex flex-col text-on-panel">
      <div className="mb-3 flex items-center justify-between border-b border-color pb-2">
        <h2 className="text-lg font-semibold text-on-panel">진행중인 대국</h2>
      </div>
      
      {games.length === 0 ? (
        <div className="py-8 text-center flex-1 flex items-center justify-center">
          <p className="text-tertiary">진행 중인 대국이 없습니다</p>
        </div>
      ) : (
        <ul className="space-y-3 overflow-y-auto pr-2 flex-1">
          {games.map((game, index) => (
            <li key={game.id} className="relative">
              <div className="flex items-center justify-between p-2.5 bg-tertiary/50 rounded-lg">
                <div className="flex items-center gap-3 flex-1 overflow-hidden">
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-secondary rounded-full font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className="text-center truncate">
                      <div className="w-9 h-9 rounded-full bg-tertiary border-2 border-color mx-auto mb-1 flex items-center justify-center">
                        <span className="text-xs">👤</span>
                      </div>
                      <span className="text-xs font-semibold block truncate">{game.player1.nickname || game.player1.username}</span>
                    </div>
                    <span className="text-tertiary font-bold">vs</span>
                    <div className="text-center truncate">
                      <div className="w-9 h-9 rounded-full bg-tertiary border-2 border-color mx-auto mb-1 flex items-center justify-center">
                        <span className="text-xs">👤</span>
                      </div>
                      <span className="text-xs font-semibold block truncate">{game.player2?.nickname || game.player2?.username || '대기중'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {game.gameType && (
                    <div className="text-sm text-highlight truncate max-w-xs hidden md:block" title={game.gameType}>
                      {game.gameType}
                    </div>
                  )}
                  <button 
                    onClick={() => handleSpectate(game.id)} 
                    className="ml-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg text-sm transition-colors shrink-0"
                  >
                    관전하기
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

