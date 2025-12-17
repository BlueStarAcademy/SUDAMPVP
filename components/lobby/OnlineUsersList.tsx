'use client';

import { useEffect, useState } from 'react';
import { useOnlineUsers, OnlineUser } from '@/lib/hooks/useOnlineUsers';
import { getSocketInstance } from '@/lib/socket/client';
import GameRequestModal from './GameRequestModal';
import GameRequestBlockModal from './GameRequestBlockModal';

interface OnlineUsersListProps {
  mode: 'STRATEGY' | 'PLAY';
}

export default function OnlineUsersList({ mode }: OnlineUsersListProps) {
  const { users, loading } = useOnlineUsers();
  const [filteredUsers, setFilteredUsers] = useState<OnlineUser[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [currentUser, setCurrentUser] = useState<OnlineUser | null>(null);
  const [selectedUser, setSelectedUser] = useState<OnlineUser | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockedGameTypes, setBlockedGameTypes] = useState<string[]>([]);

  useEffect(() => {
    // 현재 사용자 정보 가져오기
    const fetchCurrentUser = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          const current = users.find((u) => u.id === data.user.id);
          if (current) {
            setCurrentUser(current);
          }
        }
      } catch (error) {
        console.error('Failed to fetch current user:', error);
      }
    };

    // 거부된 게임 타입 가져오기
    const fetchBlockedGameTypes = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await fetch('/api/auth/blocked-game-types', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setBlockedGameTypes(data.blockedGameTypes || []);
        }
      } catch (error) {
        console.error('Failed to fetch blocked game types:', error);
      }
    };

    fetchCurrentUser();
    fetchBlockedGameTypes();

    // 필터링된 유저 목록
    if (statusFilter === 'ALL') {
      setFilteredUsers(users.filter((u) => u.id !== currentUser?.id));
    } else {
      setFilteredUsers(
        users.filter((u) => u.id !== currentUser?.id && u.status === statusFilter)
      );
    }
  }, [users, statusFilter, currentUser]);

  const handleStatusChange = async (newStatus: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('/api/users/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok && currentUser) {
        setCurrentUser({ ...currentUser, status: newStatus as OnlineUser['status'] });
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleRequestGame = (user: OnlineUser) => {
    setSelectedUser(user);
    setShowRequestModal(true);
  };

  const handleSaveBlockedGameTypes = async (blockedTypes: string[]) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('/api/auth/blocked-game-types', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ blockedGameTypes: blockedTypes }),
      });

      if (response.ok) {
        const data = await response.json();
        setBlockedGameTypes(data.blockedGameTypes || []);
      } else {
        throw new Error('Failed to save blocked game types');
      }
    } catch (error) {
      console.error('Failed to save blocked game types:', error);
      throw error;
    }
  };

  const statusLabels: Record<string, string> = {
    ALL: '전체',
    WAITING: '대기중',
    PLAYING: '경기중',
    RESTING: '휴식중',
    SPECTATING: '관전중',
  };

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
        <p>로딩 중...</p>
      </div>
    );
  }

  const statusIcons: Record<string, string> = {
    WAITING: '⏳',
    PLAYING: '🎮',
    RESTING: '😴',
    SPECTATING: '👁️',
  };

  const statusColors: Record<string, string> = {
    WAITING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    PLAYING: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    RESTING: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    SPECTATING: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  };

  const modeLabel = mode === 'STRATEGY' ? '전략바둑' : '놀이바둑';
  const modeColor = mode === 'STRATEGY' 
    ? 'from-blue-500 to-indigo-600' 
    : 'from-purple-500 to-pink-600';

  return (
    <>
      <div className="baduk-card p-6 animate-fade-in border-2 border-gray-200 dark:border-gray-700">
        <div className="mb-4 flex items-center justify-between border-b-2 border-gray-200 pb-4 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${modeColor} shadow-lg`}>
              <span className="text-2xl">👥</span>
            </div>
            <div>
              <h2 className="text-xl font-bold">{modeLabel} 대기실</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">접속 유저 목록</p>
            </div>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border-2 border-gray-300 bg-white px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:border-gray-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          >
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* 내 닉네임 고정 표시 */}
        {currentUser && (
          <div className="mb-4 rounded-lg border-2 border-indigo-400 bg-gradient-to-r from-indigo-50 to-purple-50 p-3 dark:from-indigo-900/30 dark:to-purple-900/30 dark:border-indigo-500">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md">
                  <span className="text-lg">
                    {currentUser.nickname?.[0] || currentUser.username[0]?.toUpperCase() || 'U'}
                  </span>
                </div>
                <div>
                  <p className="font-bold text-gray-800 dark:text-gray-200">
                    {currentUser.nickname || currentUser.username}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        statusColors[currentUser.status] || 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {statusIcons[currentUser.status] || '•'}{' '}
                      {statusLabels[currentUser.status] || currentUser.status}
                    </span>
                  </div>
                </div>
              </div>
              {/* 상태 변경 및 대국 거부 설정 */}
              <div className="flex items-center gap-2">
                {/* 상태 변경 드롭다운 (대기중, 휴식중만) */}
                {(currentUser.status === 'WAITING' || currentUser.status === 'RESTING') && (
                  <select
                    value={currentUser.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className="rounded-lg border-2 border-gray-300 bg-white px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:border-gray-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  >
                    <option value="WAITING">대기중</option>
                    <option value="RESTING">휴식중</option>
                  </select>
                )}
                {/* 대국 거부 설정 버튼 */}
                <button
                  onClick={() => setShowBlockModal(true)}
                  className="rounded-lg border-2 border-gray-300 bg-white px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:border-indigo-400 hover:bg-indigo-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:border-indigo-500 dark:hover:bg-indigo-900/30"
                  title="대국 신청 거부 설정"
                >
                  {blockedGameTypes.length > 0 ? `🚫 거부 설정 (${blockedGameTypes.length})` : '⚙️ 거부 설정'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 다른 유저 목록 */}
        {filteredUsers.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">접속 중인 다른 유저가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="group flex items-center justify-between rounded-lg border-2 border-gray-200 bg-gradient-to-r from-white to-gray-50 p-3 transition-all hover:border-indigo-400 hover:shadow-md dark:border-gray-700 dark:from-gray-800 dark:to-gray-700 dark:hover:border-indigo-500"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-white shadow-md">
                    <span className="text-lg">
                      {user.nickname?.[0] || user.username[0]?.toUpperCase() || 'U'}
                    </span>
                  </div>
                  <div>
                    <p className="font-bold text-gray-800 dark:text-gray-200">
                      {user.nickname || user.username}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          statusColors[user.status] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {statusIcons[user.status] || '•'} {statusLabels[user.status] || user.status}
                      </span>
                    </div>
                  </div>
                </div>
                {/* 대국 신청 버튼 (대기중, 관전중일 때만 표시) */}
                {(user.status === 'WAITING' || user.status === 'SPECTATING') &&
                  (currentUser?.status === 'WAITING' || currentUser?.status === 'SPECTATING') && (
                    <button
                      onClick={() => handleRequestGame(user)}
                      className="rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-md transition-all hover:from-blue-600 hover:to-indigo-700 hover:shadow-lg"
                    >
                      대국신청
                    </button>
                  )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 대국 신청 모달 */}
      {selectedUser && (
        <GameRequestModal
          isOpen={showRequestModal}
          onClose={() => {
            setShowRequestModal(false);
            setSelectedUser(null);
          }}
          receiverId={selectedUser.id}
          receiverName={selectedUser.nickname || selectedUser.username}
        />
      )}

      {/* 대국 거부 설정 모달 */}
      <GameRequestBlockModal
        isOpen={showBlockModal}
        onClose={() => setShowBlockModal(false)}
        blockedGameTypes={blockedGameTypes}
        onSave={handleSaveBlockedGameTypes}
      />
    </>
  );
}

