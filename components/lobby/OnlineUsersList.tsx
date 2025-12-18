'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useOnlineUsers, OnlineUser } from '@/lib/hooks/useOnlineUsers';
import { DEFAULT_AVATARS } from '@/lib/constants/avatars';
import GameRequestModal from './GameRequestModal';
import GameRequestBlockModal from './GameRequestBlockModal';
import AIGameSetupModal from './AIGameSetupModal';

interface OnlineUsersListProps {
  mode: 'STRATEGY' | 'PLAY';
}

interface OnlineUserWithRating extends OnlineUser {
  rating?: number;
}

export default function OnlineUsersList({ mode }: OnlineUsersListProps) {
  const { users, loading } = useOnlineUsers();
  const [filteredUsers, setFilteredUsers] = useState<OnlineUser[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [currentUser, setCurrentUser] = useState<OnlineUser | null>(null);
  const [selectedUser, setSelectedUser] = useState<OnlineUser | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [blockedGameTypes, setBlockedGameTypes] = useState<string[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ avatarId: string | null; nickname: string | null } | null>(null);
  const [currentUserRating, setCurrentUserRating] = useState<number | null>(null);
  const [userRatings, setUserRatings] = useState<Map<string, number>>(new Map());

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

        // 프로필 정보 가져오기 (아바타, 닉네임, 레이팅)
        const profileResponse = await fetch('/api/auth/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          setCurrentUserProfile({
            avatarId: profileData.user?.avatarId || null,
            nickname: profileData.user?.nickname || null,
          });
          // 현재 모드의 레이팅 가져오기
          const rating = profileData.ratings?.find((r: any) => r.mode === mode);
          setCurrentUserRating(rating?.rating || 1500);
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

    // 다른 유저들의 레이팅 가져오기
    const fetchUserRatings = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        // 온라인 유저 목록을 다시 가져와서 레이팅 정보 포함
        const response = await fetch(`/api/users/online?mode=${mode}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (response.ok) {
          const data = await response.json();
          const ratingsMap = new Map<string, number>();
          data.users.forEach((user: any) => {
            if (user.id !== currentUser?.id) {
              ratingsMap.set(user.id, user.rating || 1500);
            }
          });
          setUserRatings(ratingsMap);
        }
      } catch (error) {
        console.error('Failed to fetch user ratings:', error);
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

    // 유저 목록이 변경되면 레이팅도 다시 가져오기
    if (users.length > 0 && currentUser) {
      fetchUserRatings();
    }
  }, [users, statusFilter, currentUser, mode]);

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
      <div className="p-3 h-full flex flex-col text-on-panel">
        <h2 className="text-xl font-semibold mb-2 border-b border-color pb-2 flex-shrink-0 flex justify-between items-center">
          <span className="flex items-center gap-2">
            유저 목록
            <span className="text-sm text-secondary font-normal">({filteredUsers.length}명 접속 중)</span>
          </span>
        </h2>

        {/* AI봇 대결 */}
        {mode === 'STRATEGY' && (
          <div className="flex-shrink-0 mb-2">
            <div className="bg-panel rounded-lg shadow-lg p-3 flex items-center justify-between flex-shrink-0 text-on-panel">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-purple-600 text-white border-2 border-purple-400">
                  <span className="text-base">🤖</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-purple-300">AI와 대결하기</h3>
                  <p className="text-xs text-tertiary">AI와 즉시 대국을 시작합니다.</p>
                </div>
              </div>
              <button
                onClick={() => setShowAIModal(true)}
                className="rounded-lg bg-gradient-to-r from-purple-500 to-purple-600 px-4 py-2 text-xs font-bold text-white shadow-md transition-all hover:from-purple-600 hover:to-purple-700 hover:shadow-lg"
              >
                설정 및 시작
              </button>
            </div>
          </div>
        )}

        {currentUser && currentUserProfile && (
          <div className="flex-shrink-0 mb-2">
            <div className={`flex items-center justify-between p-1.5 rounded-lg bg-blue-900/40 border border-blue-700`}>
              <div 
                className="flex items-center gap-2 lg:gap-3 overflow-hidden"
              >
                <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full overflow-hidden border-2 border-color">
                  {(() => {
                    const avatar = currentUserProfile.avatarId
                      ? DEFAULT_AVATARS.find((a) => a.id === currentUserProfile.avatarId) || DEFAULT_AVATARS[0]
                      : DEFAULT_AVATARS[0];
                    return avatar.imagePath ? (
                      <Image
                        src={avatar.imagePath}
                        alt={currentUserProfile.nickname || '아바타'}
                        fill
                        className="object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
                        <span className="text-sm">
                          {currentUserProfile.nickname?.[0] || currentUser.username[0]?.toUpperCase() || 'U'}
                        </span>
                      </div>
                    );
                  })()}
                </div>
                <div className="overflow-hidden">
                  <h3 className="font-bold text-sm lg:text-base truncate">{currentUserProfile.nickname || currentUser.username}</h3>
                  <span className="text-xs text-green-400">● 대기 중</span>
                </div>
              </div>
              <select
                value={currentUser.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={!['WAITING', 'RESTING'].includes(currentUser.status)}
                className="px-2 py-1 lg:px-3 lg:py-1.5 bg-secondary border border-color rounded-lg text-xs lg:text-sm transition-colors w-20 lg:w-24 text-center focus:ring-accent focus:border-accent disabled:opacity-50 text-on-panel"
              >
                <option value="WAITING">대기 중</option>
                <option value="RESTING">휴식 중</option>
                {!['WAITING', 'RESTING'].includes(currentUser.status) && (
                  <option value={currentUser.status} disabled>{statusLabels[currentUser.status] || currentUser.status}</option>
                )}
              </select>
            </div>
          </div>
        )}
        
        <ul className="space-y-2 overflow-y-auto pr-2 max-h-[calc(var(--vh,1vh)*25)] min-h-[96px] flex-1">
          {filteredUsers.length > 0 ? filteredUsers.map((user) => {
            const userRating = userRatings.get(user.id) || 1500;
            const statusInfo = {
              WAITING: { text: '대기 중', color: 'text-green-400' },
              PLAYING: { text: '대국 중', color: 'text-blue-400' },
              RESTING: { text: '휴식 중', color: 'text-gray-400' },
              SPECTATING: { text: '관전 중', color: 'text-purple-400' },
            }[user.status] || { text: user.status, color: 'text-gray-400' };
            
            const avatar = DEFAULT_AVATARS.find((a) => a.id === user.avatarId) || DEFAULT_AVATARS[0];
            
            return (
              <li key={user.id} className={`flex items-center justify-between p-1.5 rounded-lg bg-tertiary/50`}>
                <div 
                  className="flex items-center gap-2 lg:gap-3 overflow-hidden cursor-pointer"
                  onClick={() => handleRequestGame(user)}
                  title={`${user.nickname || user.username} 프로필 보기`}
                >
                  <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full overflow-hidden border-2 border-color">
                    {avatar.imagePath ? (
                      <Image
                        src={avatar.imagePath}
                        alt={user.nickname || user.username}
                        fill
                        className="object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500 text-white">
                        <span className="text-sm">{user.nickname?.[0] || user.username[0]?.toUpperCase() || 'U'}</span>
                      </div>
                    )}
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="font-bold text-sm lg:text-base truncate">{user.nickname || user.username}</h3>
                    <span className={`text-xs ${statusInfo.color}`}>● {statusInfo.text}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleRequestGame(user)}
                    className="rounded-lg bg-accent hover:bg-accent-hover px-3 py-1.5 text-xs font-bold text-white transition-colors"
                  >
                    대국 신청
                  </button>
                </div>
              </li>
            );
          }) : (
            <p className="text-center text-tertiary pt-8">다른 플레이어가 없습니다.</p>
          )}
        </ul>
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

      {/* AI봇 대결 모달 */}
      {mode === 'STRATEGY' && (
        <AIGameSetupModal
          isOpen={showAIModal}
          onClose={() => setShowAIModal(false)}
        />
      )}
    </>
  );
}

