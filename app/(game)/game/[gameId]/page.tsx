'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getSocket, getSocketInstance } from '@/lib/socket/client';
import Link from 'next/link';

export default function GamePage() {
  const router = useRouter();
  const params = useParams();
  const gameId = params.gameId as string;
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    const socket = getSocket(token);
    socket.emit('game:join', gameId);

    socket.on('game:update', (gameData: any) => {
      setGame(gameData);
      setLoading(false);
    });

    socket.on('game:error', (errorData: any) => {
      setError(errorData.message);
    });

    // Fetch initial game state
    fetchGame();

    return () => {
      socket.emit('game:leave', gameId);
      socket.off('game:update');
      socket.off('game:error');
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
      } else {
        setError('게임을 불러올 수 없습니다');
      }
    } catch (err) {
      setError('게임을 불러오는 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleMakeMove = async (x: number, y: number) => {
    try {
      const token = localStorage.getItem('token');
      const socket = getSocketInstance();
      
      socket?.emit('game:move', {
        gameId,
        x,
        y,
      });
    } catch (err) {
      console.error('Move error:', err);
    }
  };

  const handlePass = async () => {
    try {
      const socket = getSocketInstance();
      socket?.emit('game:pass', { gameId });
    } catch (err) {
      console.error('Pass error:', err);
    }
  };

  const handleHint = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/ai/hint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ gameId }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.hint?.suggestedMove) {
          alert(`힌트: (${data.hint.suggestedMove.x}, ${data.hint.suggestedMove.y}) 위치를 추천합니다.`);
        } else {
          alert('힌트를 가져올 수 없습니다.');
        }
      }
    } catch (err) {
      console.error('Hint error:', err);
    }
  };

  const handleScoring = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/ai/score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ gameId }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.scoring) {
          alert(`계가 결과: ${data.scoring.winner === 1 ? game.player1?.username : game.player2?.username || 'AI'} 승리 (${data.scoring.score > 0 ? '+' : ''}${data.scoring.score}점)`);
        }
      }
    } catch (err) {
      console.error('Scoring error:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>로딩 중...</p>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-red-600">{error || '게임을 찾을 수 없습니다.'}</p>
          <Link href="/lobby" className="text-blue-600 hover:underline">
            대기실로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col p-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-4xl font-bold">게임 진행</h1>
          <Link
            href="/lobby"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            ← 대기실로
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
              게임 보드 렌더링 (19x19 바둑판)
            </p>
            {/* TODO: Implement interactive board visualization */}
          </div>

          <div className="flex justify-between text-sm text-gray-500">
            <div>
              현재 차례: {game.currentPlayer === 1 ? game.player1?.username : game.player2?.username || 'AI'}
            </div>
            <div>
              남은 시간: Player1 {game.player1Time}s / Player2 {game.player2Time || 0}s
            </div>
          </div>

          <div className="mt-4 flex gap-4">
            <button
              onClick={handlePass}
              className="rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
            >
              패스
            </button>
            <button
              onClick={handleHint}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              힌트 (KataGo)
            </button>
            <button
              onClick={handleScoring}
              className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
            >
              계가 (KataGo)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

