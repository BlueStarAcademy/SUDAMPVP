'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSocketInstance } from '@/lib/socket/client';
import { getGameType } from '@/lib/game/types';

interface GameRequest {
  id: string;
  sender: {
    id: string;
    username: string;
    nickname: string | null;
    avatarId: string | null;
  };
  gameType: string;
  boardSize: number;
  timeLimit: number;
  createdAt: string;
}

export default function GameRequestNotification() {
  const router = useRouter();
  const [requests, setRequests] = useState<GameRequest[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchRequests();

    // Socket.io로 실시간 업데이트
    const socket = getSocketInstance();
    if (socket) {
      socket.on('game:request-received', (request: GameRequest) => {
        setRequests((prev) => [request, ...prev]);
      });

      socket.on('game:request-updated', () => {
        fetchRequests();
      });

      return () => {
        socket.off('game:request-received');
        socket.off('game:request-updated');
      };
    }
  }, []);

  const fetchRequests = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('/api/game/request/received', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    }
  };

  const handleAccept = async (requestId: string) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`/api/game/request/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'accept' }),
      });

      const data = await response.json();

      if (response.ok && data.gameId) {
        router.push(`/game/${data.gameId}`);
      } else {
        alert(data.error || '대국 수락 실패');
      }
    } catch (error) {
      console.error('Accept request error:', error);
      alert('대국 수락 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      await fetch(`/api/game/request/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'reject' }),
      });

      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (error) {
      console.error('Reject request error:', error);
    }
  };

  if (requests.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {requests.map((request) => {
        const gameType = getGameType(request.gameType);
        return (
          <div
            key={request.id}
            className="baduk-card w-80 p-4 animate-fade-in shadow-xl"
          >
            <div className="mb-3 flex items-center gap-2 border-b border-gray-200 pb-2 dark:border-gray-700">
              <span className="text-lg">📨</span>
              <p className="font-bold">대국 신청</p>
            </div>
            <div className="mb-3 space-y-1 text-sm">
              <p>
                <span className="font-bold">{request.sender.nickname || request.sender.username}</span>
                님의 대국 신청
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                {gameType?.name || request.gameType} ({request.boardSize}×{request.boardSize})
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                시간 제한: {Math.floor(request.timeLimit / 60)}분
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleAccept(request.id)}
                disabled={loading}
                className="flex-1 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 px-3 py-2 text-sm font-bold text-white shadow-md transition-all hover:from-green-600 hover:to-emerald-700 disabled:opacity-50"
              >
                수락
              </button>
              <button
                onClick={() => handleReject(request.id)}
                disabled={loading}
                className="flex-1 rounded-lg bg-gradient-to-r from-red-500 to-red-600 px-3 py-2 text-sm font-bold text-white shadow-md transition-all hover:from-red-600 hover:to-red-700 disabled:opacity-50"
              >
                거절
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

