'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getSocket, getSocketInstance } from '@/lib/socket/client';
import Link from 'next/link';
import { getGameType } from '@/lib/game/types';
import GameArena from '@/components/game/GameArena';
import PlayerPanel from '@/components/game/PlayerPanel';
import TurnDisplay from '@/components/game/TurnDisplay';
import GameControls from '@/components/game/GameControls';
import Sidebar from '@/components/game/Sidebar';
import { Player, Point } from '@/lib/game/boardTypes';

export default function GamePage() {
  const router = useRouter();
  const params = useParams();
  const gameId = params.gameId as string;
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth < 1024);
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-primary text-primary">
        <p>로딩 중...</p>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-primary text-primary">
        <div className="text-center">
          <p className="mb-4 text-red-600">{error || '게임을 찾을 수 없습니다.'}</p>
          <Link href="/lobby" className="text-blue-600 hover:underline">
            대기실로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  const isMyTurn =
    !!currentUserId &&
    ((game.currentPlayer === 1 && game.player1?.id === currentUserId) ||
      (game.currentPlayer === 2 && game.player2?.id === currentUserId));

  const isStrategic = game.mode === 'STRATEGY';
  const backgroundClass = isStrategic ? 'bg-strategic-background' : 'bg-playful-background';

  // 게임 데이터를 GoBoard 형식으로 변환
  const convertedBoardState = useMemo(() => {
    const board = game.boardState?.board || [];
    return board.map((row: any[]) => 
      row.map((cell: any) => {
        if (cell === 'black' || cell === 1) return Player.Black;
        if (cell === 'white' || cell === 2) return Player.White;
        return Player.None;
      })
    );
  }, [game.boardState]);

  const convertedCurrentPlayer = useMemo(() => {
    return game.currentPlayer === 1 ? Player.Black : Player.White;
  }, [game.currentPlayer]);

  const convertedLastMove = useMemo(() => {
    if (!game.lastMove || game.lastMove.x === undefined || game.lastMove.y === undefined) return null;
    return { x: game.lastMove.x, y: game.lastMove.y };
  }, [game.lastMove]);

  const myPlayerEnum = useMemo(() => {
    if (!currentUserId) return Player.None;
    if (game.player1?.id === currentUserId) {
      return game.currentPlayer === 1 ? Player.Black : Player.White;
    }
    if (game.player2?.id === currentUserId) {
      return game.currentPlayer === 2 ? Player.Black : Player.White;
    }
    return Player.None;
  }, [currentUserId, game.player1, game.player2, game.currentPlayer]);

  return (
    <div
      className={`w-full flex flex-col p-1 lg:p-2 relative max-w-full ${backgroundClass}`}
      style={{
        height: '100dvh',
        maxHeight: '100dvh',
        paddingBottom: typeof window !== 'undefined' && window.innerWidth < 768 ? 'env(safe-area-inset-bottom, 0px)' : '0px',
      }}
    >
      <div className="flex-1 flex flex-col lg:flex-row gap-2 min-h-0">
        <main className="flex-1 flex items-center justify-center min-w-0 min-h-0">
          <div className="w-full h-full max-h-full max-w-full lg:max-w-[calc(100vh-8rem)] flex flex-col items-center gap-1 lg:gap-2">
            {/* PlayerPanel 영역 */}
            <div className="flex-shrink-0 w-full flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <PlayerPanel game={game} currentUserId={currentUserId} isMobile={isMobile} />
              </div>
            </div>

            {/* GameArena 영역 */}
            <div className="flex-1 w-full relative">
              <div className="absolute inset-0">
                <GameArena
                  boardState={convertedBoardState}
                  boardSize={game.boardSize || 19}
                  onBoardClick={handleMakeMove}
                  lastMove={convertedLastMove}
                  isBoardDisabled={!isMyTurn}
                  stoneColor={myPlayerEnum}
                  currentPlayer={convertedCurrentPlayer}
                  isMyTurn={isMyTurn}
                  showLastMoveMarker={true}
                  mode={game.mode}
                  gameStatus={game.status}
                  isMobile={isMobile}
                />
              </div>
            </div>

            {/* TurnDisplay + GameControls 영역 */}
            <div className="flex-shrink-0 w-full flex flex-col gap-1">
              <TurnDisplay game={game} isMobile={isMobile} />
              <GameControls 
                game={game} 
                isMyTurn={isMyTurn} 
                onPass={handlePass}
                isMobile={isMobile}
              />
            </div>
          </div>
        </main>

        {/* Sidebar */}
        {!isMobile && (
          <div className="w-full lg:w-[320px] xl:w-[360px] flex-shrink-0">
            <Sidebar gameId={gameId} game={game} isMobile={isMobile} />
          </div>
        )}
      </div>
    </div>
  );
}
