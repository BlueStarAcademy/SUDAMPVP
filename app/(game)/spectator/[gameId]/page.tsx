'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getSocketInstance } from '@/lib/socket/client';
import Link from 'next/link';

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

        <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <span className="font-medium">{game.player1?.username}</span>
              <span className="mx-2 text-gray-500">vs</span>
              <span className="font-medium">
                {game.player2?.username || `AI (${game.aiType})`}
              </span>
            </div>
            <span className="rounded bg-gray-200 px-2 py-1 text-xs dark:bg-gray-700">
              {game.mode === 'STRATEGY' ? '전략바둑' : '놀이바둑'}
            </span>
          </div>

          {/* Game board would be rendered here */}
          <div className="mb-4 rounded-lg border border-gray-300 bg-gray-100 p-4 dark:border-gray-700 dark:bg-gray-900">
            <p className="text-center text-gray-500">
              게임 보드 렌더링 (읽기 전용)
            </p>
            {/* TODO: Implement board visualization */}
          </div>

          <div className="flex justify-between text-sm text-gray-500">
            <div>
              현재 차례: {game.currentPlayer === 1 ? game.player1?.username : game.player2?.username || 'AI'}
            </div>
            <div>
              남은 시간: Player1 {game.player1Time}s / Player2 {game.player2Time || 0}s
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

