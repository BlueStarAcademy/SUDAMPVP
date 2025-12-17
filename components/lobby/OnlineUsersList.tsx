'use client';

import { useEffect, useState } from 'react';
import { useOnlineUsers } from '@/lib/hooks/useOnlineUsers';

interface OnlineUser {
  id: string;
  username: string;
  nickname: string | null;
  status: string;
}

export default function OnlineUsersList() {
  const { users, loading } = useOnlineUsers();
  const [filteredUsers, setFilteredUsers] = useState<OnlineUser[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    if (statusFilter === 'ALL') {
      setFilteredUsers(users as OnlineUser[]);
    } else {
      setFilteredUsers(users.filter((u: any) => u.status === statusFilter) as OnlineUser[]);
    }
  }, [users, statusFilter]);

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

  return (
    <div className="baduk-card p-6 animate-fade-in">
      <div className="mb-4 flex items-center justify-between border-b border-gray-200 pb-4 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600">
            <span className="text-xl">👥</span>
          </div>
          <h2 className="text-xl font-bold">접속 유저 목록</h2>
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
      {filteredUsers.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">접속 중인 유저가 없습니다.</p>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

