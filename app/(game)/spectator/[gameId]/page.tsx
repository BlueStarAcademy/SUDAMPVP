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
          {/* 플레이어 정보 헤더 */}
          <div className="mb-6 flex flex-col gap-4 border-b border-gray-200 pb-4 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                {/* 플레이어 1 */}
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-gray-800 to-gray-900 text-white shadow-lg">
                    <span className="text-xl">⚫</span>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">흑</div>
                    <div className="font-bold text-lg text-gray-900 dark:text-gray-100">
                      {game.player1?.nickname || game.player1?.username}
                    </div>
                  </div>
                </div>
                
                <div className="text-2xl font-bold text-gray-400">VS</div>
                
                {/* 플레이어 2 */}
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-gray-100 to-gray-200 text-gray-800 shadow-lg">
                    <span className="text-xl">⚪</span>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">백</div>
                    <div className="font-bold text-lg text-gray-900 dark:text-gray-100">
                      {game.player2?.nickname || game.player2?.username || `AI (${game.aiType})`}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {game.gameType && (
                  <span className="rounded-full bg-gradient-to-r from-blue-500 to-purple-600 px-3 py-1 text-xs font-bold text-white shadow-md">
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
          </div>

          {/* Game board (읽기 전용) - 프리미엄 스타일 */}
          <div className="mb-6 flex justify-center">
            <div 
              className="rounded-xl p-6 shadow-2xl"
              style={{
                background: 'linear-gradient(135deg, #f5e6d3 0%, #e8d5b7 50%, #d4c4a8 100%)',
                border: '3px solid #8b7355',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3), inset 0 2px 10px rgba(255, 255, 255, 0.3)',
              }}
            >
              <GameBoard
                boardState={game.boardState}
                boardSize={game.boardSize || 19}
                currentPlayer={game.currentPlayer}
                onMakeMove={() => {}} // 관전 모드에서는 수를 둘 수 없음
                isMyTurn={false} // 항상 false
              />
            </div>
          </div>

          {/* 게임 정보 패널 */}
          <div className="grid grid-cols-3 gap-4 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 p-4 dark:from-gray-800/50 dark:to-gray-900/50">
            <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-gray-800/50">
              <div className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">현재 차례</div>
              <div className="flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${game.currentPlayer === 1 ? 'bg-black' : 'bg-white border-2 border-gray-300'}`}></span>
                <div className="font-bold text-gray-900 dark:text-gray-100">
                  {game.currentPlayer === 1 
                    ? (game.player1?.nickname || game.player1?.username) 
                    : (game.player2?.nickname || game.player2?.username || 'AI')}
                </div>
              </div>
            </div>
            <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-gray-800/50">
              <div className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">남은 시간</div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-black"></span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {Math.floor((game.player1Time || 0) / 60)}:{(game.player1Time || 0) % 60).toString().padStart(2, '0')}
                  </span>
                </div>
                {game.player2Time !== null && (
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-white border border-gray-300"></span>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {Math.floor((game.player2Time || 0) / 60)}:{((game.player2Time || 0) % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-lg bg-white p-3 shadow-sm dark:bg-gray-800/50">
              <div className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">따낸 돌</div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-black"></span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    흑: {game.boardState?.capturedBlack || 0}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-white border border-gray-300"></span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    백: {game.boardState?.capturedWhite || 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

