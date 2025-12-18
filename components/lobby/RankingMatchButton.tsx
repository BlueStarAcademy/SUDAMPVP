'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSocketInstance } from '@/lib/socket/client';
import { STRATEGY_GAME_TYPES, PLAY_GAME_TYPES, ALL_GAME_TYPES } from '@/lib/game/types';
import { getGameType } from '@/lib/game/types';

interface RankingMatchButtonProps {
  selectedGameType?: string;
  selectedBoardSize?: number;
}

export default function RankingMatchButton({
  selectedGameType,
  selectedBoardSize,
}: RankingMatchButtonProps) {
  const router = useRouter();
  const [matching, setMatching] = useState(false);
  const [waitingTime, setWaitingTime] = useState(0);
  const [showGameTypeModal, setShowGameTypeModal] = useState(false);
  const [localGameType, setLocalGameType] = useState<string>(selectedGameType || '');
  const [localBoardSize, setLocalBoardSize] = useState<number>(selectedBoardSize || 19);

  useEffect(() => {
    // Socket.io로 매칭 성공 알림 받기
    const socket = getSocketInstance();
    if (socket) {
      socket.on('game:match-found', (data: { gameId: string }) => {
        setMatching(false);
        setWaitingTime(0);
        router.push(`/game/${data.gameId}`);
      });
    }

    return () => {
      if (socket) {
        socket.off('game:match-found');
      }
    };
  }, [router]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (matching) {
      // 1초부터 시작하여 계속 증가
      interval = setInterval(() => {
        setWaitingTime((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [matching]);

  const handleStartMatching = async () => {
    const gameType = localGameType || selectedGameType;
    if (!gameType) {
      setShowGameTypeModal(true);
      return;
    }

    setMatching(true);
    setWaitingTime(1); // 1초부터 시작

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        alert('로그인이 필요합니다.');
        setMatching(false);
        return;
      }

      const response = await fetch('/api/game/ranking-match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          gameType,
          boardSize: localBoardSize || selectedBoardSize || 19,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || '매칭 시작 실패');
        setMatching(false);
        return;
      }

      // 즉시 매칭 성공한 경우
      if (data.matched && data.gameId) {
        router.push(`/game/${data.gameId}`);
        return;
      }

      // 5초 대기 후 주기적으로 매칭 확인
      const checkMatch = async () => {
        try {
          const checkResponse = await fetch('/api/game/ranking-match/check', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const checkData = await checkResponse.json();
          
          if (checkData.matched && checkData.gameId) {
            setMatching(false);
            setWaitingTime(0);
            router.push(`/game/${checkData.gameId}`);
          }
        } catch (error) {
          console.error('Check matchmaking error:', error);
        }
      };

      // 5초 후부터 2초마다 확인
      setTimeout(() => {
        const matchInterval = setInterval(checkMatch, 2000);
        
        // 30초 후 타임아웃
        setTimeout(() => {
          clearInterval(matchInterval);
        }, 30000);
      }, 5000);
    } catch (error) {
      console.error('Ranking match error:', error);
      alert('매칭 중 오류가 발생했습니다');
      setMatching(false);
    }
  };

  const handleCancelMatching = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      await fetch('/api/game/ranking-match', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setMatching(false);
      setWaitingTime(0);
    } catch (error) {
      console.error('Cancel matchmaking error:', error);
    }
  };

  const gameType = localGameType || selectedGameType;
  const gameTypeData = gameType ? ALL_GAME_TYPES[gameType] : null;

  return (
    <>
      <div className="space-y-4">
        {matching ? (
          <div className="space-y-2">
            <div className="rounded bg-gradient-to-r from-orange-100 to-red-100 p-2 dark:from-orange-900/30 dark:to-red-900/30">
              <div className="mb-1 flex items-center justify-center gap-1">
                <span className="animate-spin text-sm">⏳</span>
                <span className="text-xs font-bold">매칭 대기 중...</span>
              </div>
              {waitingTime < 5 ? (
                <div className="text-center">
                  <p className="text-[10px] text-gray-600 dark:text-gray-400">
                    대기시간: {waitingTime}초
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-[10px] text-gray-600 dark:text-gray-400">
                    상대를 찾는 중... ({waitingTime}초)
                  </p>
                </div>
              )}
              {gameTypeData && gameType && (
                <div className="mt-1 text-center text-[10px] text-gray-500 dark:text-gray-400">
                  {getGameType(gameType)?.name || gameType} ({localBoardSize || selectedBoardSize}×{localBoardSize || selectedBoardSize})
                </div>
              )}
            </div>
            <button
              onClick={handleCancelMatching}
              className="w-full rounded bg-gray-500 px-2 py-1 text-xs font-bold text-white hover:bg-gray-600"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartMatching}
            className="baduk-button w-full bg-gradient-to-r from-orange-500 to-red-600 px-3 py-3 text-sm font-bold text-white shadow-md transition-all hover:scale-105 hover:from-orange-600 hover:to-red-700"
          >
            <span className="flex items-center justify-center gap-1">
              <span className="text-sm">⚡</span>
              <span>랭킹전 매칭</span>
            </span>
          </button>
        )}
      </div>

      {/* 게임 타입 선택 모달 */}
      {showGameTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
          <div className="baduk-card w-full max-w-lg p-6 animate-fade-in">
            <div className="mb-6 flex items-center justify-between border-b border-gray-200 pb-4 dark:border-gray-700">
              <h2 className="text-2xl font-bold">게임 타입 선택</h2>
              <button
                onClick={() => setShowGameTypeModal(false)}
                className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
              >
                닫기
              </button>
            </div>

            <div className="space-y-6">
              {/* 전략바둑 */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-lg">⚔️</span>
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                    전략바둑
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(STRATEGY_GAME_TYPES).map((gt) => (
                    <button
                      key={gt.id}
                      onClick={() => {
                        setLocalGameType(gt.id);
                        setLocalBoardSize(gt.boardSizes[0]);
                      }}
                      className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                        localGameType === gt.id
                          ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg scale-105'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {gt.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 놀이바둑 */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-lg">🎮</span>
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                    놀이바둑
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(PLAY_GAME_TYPES).map((gt) => (
                    <button
                      key={gt.id}
                      onClick={() => {
                        setLocalGameType(gt.id);
                        setLocalBoardSize(gt.boardSizes[0]);
                      }}
                      className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                        localGameType === gt.id
                          ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg scale-105'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {gt.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 보드 크기 선택 */}
              {localGameType && (
                <div>
                  <label className="mb-3 block text-sm font-bold text-gray-700 dark:text-gray-300">
                    보드 크기
                  </label>
                  <div className="flex gap-2">
                    {ALL_GAME_TYPES[localGameType]?.boardSizes.map((size) => (
                      <button
                        key={size}
                        onClick={() => setLocalBoardSize(size)}
                        className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                          localBoardSize === size
                            ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg scale-105'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {size}×{size}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 확인 버튼 */}
              <button
                onClick={() => {
                  if (localGameType) {
                    setShowGameTypeModal(false);
                    handleStartMatching();
                  } else {
                    alert('게임 타입을 선택해주세요.');
                  }
                }}
                disabled={!localGameType}
                className="w-full rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-3 text-lg font-bold text-white shadow-lg transition-all hover:from-green-600 hover:to-emerald-700 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                매칭 시작
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

