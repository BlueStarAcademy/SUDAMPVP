'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getSocketInstance } from '@/lib/socket/client';
import Link from 'next/link';
import { getGameType } from '@/lib/game/types';
import GameBoard from '@/components/game/GameBoard';

export default function SpectateGamePage() {
  const router = useRouter();
  const params = useParams();
  const gameId = params.gameId as string;
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    const socket = getSocketInstance();
    if (socket) {
      socket.emit('game:join', gameId);

      socket.on('game:update', (gameData: any) => {
        setGame(gameData);
        setLoading(false);
      });

      // Fetch initial game state
      fetchGame();
    }

    return () => {
      if (socket) {
        socket.emit('game:leave', gameId);
        socket.off('game:update');
      }
    };
  }, [gameId, router]);

  const fetchGame = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/game/${gameId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setGame(data.game);
      }
    } catch (error) {
      console.error('Failed to fetch game:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>로딩 중...</p>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4">게임을 찾을 수 없습니다.</p>
          <Link href="/spectator" className="text-blue-600 hover:underline">
            관전 목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col p-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-4xl font-bold">게임 관전</h1>
          <Link
            href="/spectator"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            ← 관전 목록으로
          </Link>
        </div>

        <div className="baduk-card p-6 animate-fade-in">
          <div className="mb-6 flex items-center justify-between border-b border-gray-200 pb-4 dark:border-gray-700">
            <div className="flex items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">{game.player1?.nickname || game.player1?.username}</span>
                  <span className="text-2xl">⚫</span>
                  <span className="text-2xl text-gray-300">⚪</span>
                  <span className="font-bold text-lg">
                    {game.player2?.nickname || game.player2?.username || `AI (${game.aiType})`}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {game.gameType && (
                <span className="rounded-full bg-gradient-to-r from-blue-500 to-purple-600 px-3 py-1 text-xs font-bold text-white">
                  {getGameType(game.gameType)?.name || game.gameType}
                </span>
              )}
              <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-medium dark:bg-gray-700">
                {game.mode === 'STRATEGY' ? '전략바둑' : '놀이바둑'}
              </span>
              {game.boardSize && (
                <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                  {game.boardSize}×{game.boardSize}
                </span>
              )}
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
                관전 모드
              </span>
            </div>
          </div>

          {/* Game board (읽기 전용) */}
          <div className="mb-6 flex justify-center">
            <div className="rounded-lg border-4 border-amber-800 bg-amber-100 p-4 dark:border-amber-900 dark:bg-amber-900/30">
              <GameBoard
                boardState={game.boardState}
                boardSize={game.boardSize || 19}
                currentPlayer={game.currentPlayer}
                onMakeMove={() => {}} // 관전 모드에서는 수를 둘 수 없음
                isMyTurn={false} // 항상 false
              />
            </div>
          </div>

          <div className="flex justify-between text-sm text-gray-500">
            <div>
              현재 차례: {game.currentPlayer === 1 ? (game.player1?.nickname || game.player1?.username) : (game.player2?.nickname || game.player2?.username || 'AI')}
            </div>
            <div>
              남은 시간: {game.player1?.nickname || game.player1?.username} {game.player1Time}s / {game.player2?.nickname || game.player2?.username || 'AI'} {game.player2Time || 0}s
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

