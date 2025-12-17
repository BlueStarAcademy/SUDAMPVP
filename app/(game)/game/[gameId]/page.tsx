'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getSocket, getSocketInstance } from '@/lib/socket/client';
import Link from 'next/link';
import { getGameType, ALL_GAME_TYPES } from '@/lib/game/types';
import GameBoard from '@/components/game/GameBoard';

export default function GamePage() {
  const router = useRouter();
  const params = useParams();
  const gameId = params.gameId as string;
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    // 현재 사용자 ID 가져오기
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setCurrentUserId(data.user.id);
        }
      })
      .catch(console.error);

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
            </div>
          </div>

          {/* Game board */}
          <div className="mb-6 flex justify-center">
            <div className="rounded-lg border-4 border-amber-800 bg-amber-100 p-4 dark:border-amber-900 dark:bg-amber-900/30">
              <GameBoard
                boardState={game.boardState}
                boardSize={game.boardSize || 19}
                currentPlayer={game.currentPlayer}
                onMakeMove={handleMakeMove}
                isMyTurn={
                  currentUserId &&
                  ((game.currentPlayer === 1 && game.player1?.id === currentUserId) ||
                    (game.currentPlayer === 2 && game.player2?.id === currentUserId))
                }
              />
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">현재 차례</div>
              <div className="font-bold">
                {game.currentPlayer === 1 
                  ? (game.player1?.nickname || game.player1?.username) 
                  : (game.player2?.nickname || game.player2?.username || 'AI')}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">남은 시간</div>
              <div className="font-bold">
                {game.player1?.nickname || game.player1?.username}: {Math.floor(game.player1Time / 60)}:{(game.player1Time % 60).toString().padStart(2, '0')}
              </div>
              {game.player2Time !== null && (
                <div className="font-bold">
                  {game.player2?.nickname || game.player2?.username || 'AI'}: {Math.floor((game.player2Time || 0) / 60)}:{((game.player2Time || 0) % 60).toString().padStart(2, '0')}
                </div>
              )}
            </div>
          </div>

          {/* 게임 종료 상태 표시 */}
          {game.status === 'FINISHED' && (
            <div className="mb-4 rounded-lg bg-gradient-to-r from-yellow-400 to-orange-500 p-4 text-center text-white">
              <div className="text-2xl font-bold">
                {game.winnerId === game.player1?.id
                  ? `🎉 ${game.player1?.nickname || game.player1?.username} 승리!`
                  : game.winnerId === game.player2?.id
                  ? `🎉 ${game.player2?.nickname || game.player2?.username} 승리!`
                  : '무승부'}
              </div>
              {game.result && (
                <div className="mt-2 text-sm opacity-90">
                  {game.result === 'PLAYER1_WIN' && '흑 승리'}
                  {game.result === 'PLAYER2_WIN' && '백 승리'}
                  {game.result === 'DRAW' && '무승부'}
                  {game.result === 'TIMEOUT' && '시간 초과'}
                </div>
              )}
            </div>
          )}

          {/* 게임 액션 버튼 */}
          {game.status === 'IN_PROGRESS' && (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={handlePass}
                disabled={!currentUserId || (game.currentPlayer === 1 && game.player1?.id !== currentUserId) || (game.currentPlayer === 2 && game.player2?.id !== currentUserId)}
                className="baduk-button-secondary rounded-full px-6 py-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                패스
              </button>
              <button
                onClick={handleHint}
                className="baduk-button-primary rounded-full px-6 py-2 font-medium"
              >
                💡 힌트 (KataGo)
              </button>
              <button
                onClick={handleScoring}
                className="baduk-button-success rounded-full px-6 py-2 font-medium"
              >
                📊 계가 (KataGo)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

