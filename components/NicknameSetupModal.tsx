'use client';

import { useState, useEffect } from 'react';
import { DEFAULT_AVATARS, DEFAULT_AVATAR_ID } from '@/lib/constants/avatars';
import AvatarSelector from './AvatarSelector';

interface NicknameSetupModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

export default function NicknameSetupModal({ isOpen, onComplete }: NicknameSetupModalProps) {
  const [nickname, setNickname] = useState('');
  const [selectedAvatarId, setSelectedAvatarId] = useState(DEFAULT_AVATAR_ID);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNickname('');
      setSelectedAvatarId(DEFAULT_AVATAR_ID);
      setError('');
    }
  }, [isOpen]);

  const handleCheckNickname = async () => {
    if (!nickname.trim()) {
      setError('닉네임을 입력해주세요.');
      return;
    }

    // 간단한 클라이언트 사이드 형식 검증 (한글 1-6글자)
    const koreanRegex = /^[가-힣]{1,6}$/;
    if (!koreanRegex.test(nickname)) {
      setError('닉네임은 한글 1-6글자만 사용할 수 있습니다.');
      return;
    }

    setChecking(true);
    setError('');

    try {
      const response = await fetch(`/api/auth/check-nickname?nickname=${encodeURIComponent(nickname)}`);
      const data = await response.json();

      if (!data.available) {
        setError(data.error || '이미 사용 중인 닉네임입니다.');
      } else {
        setError('');
      }
    } catch (err) {
      setError('닉네임 확인 중 오류가 발생했습니다.');
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('로그인이 필요합니다.');
        return;
      }

      const response = await fetch('/api/auth/setup-nickname', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nickname,
          avatarId: selectedAvatarId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || '설정 저장 중 오류가 발생했습니다.');
        return;
      }

      // 완료
      onComplete();
    } catch (err) {
      setError('설정 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl dark:bg-gray-800 animate-fade-in">
        <div className="mb-6 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
              <span className="text-3xl">👤</span>
            </div>
          </div>
          <h2 className="mb-2 text-3xl font-bold">닉네임 및 아바타 설정</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            게임을 시작하기 전에 닉네임과 아바타를 설정해주세요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 닉네임 입력 */}
          <div>
            <label htmlFor="nickname" className="mb-2 block text-sm font-bold text-gray-700 dark:text-gray-300">
              닉네임 (한글 1-6글자)
            </label>
            <div className="flex gap-2">
              <input
                id="nickname"
                type="text"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  setError('');
                }}
                onBlur={handleCheckNickname}
                maxLength={6}
                className="flex-1 rounded-lg border-2 border-gray-300 px-4 py-3 font-medium transition-colors focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                placeholder="닉네임을 입력하세요"
                disabled={loading}
              />
              <button
                type="button"
                onClick={handleCheckNickname}
                disabled={checking || loading}
                className="baduk-button-secondary px-5 py-3 font-medium disabled:opacity-50"
              >
                {checking ? '확인 중...' : '중복 확인'}
              </button>
            </div>
            {error && (
              <p className="mt-2 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>

          {/* 아바타 선택 */}
          <div>
            <label className="mb-3 block text-sm font-bold text-gray-700 dark:text-gray-300">
              아바타 선택
            </label>
            <AvatarSelector
              selectedAvatarId={selectedAvatarId}
              onSelect={setSelectedAvatarId}
            />
          </div>

          {/* 제출 버튼 */}
          <button
            type="submit"
            disabled={loading || !nickname.trim() || !!error}
            className="baduk-button-primary w-full px-6 py-4 text-lg font-bold shadow-lg transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                <span>저장 중...</span>
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span>✅</span>
                <span>설정 완료</span>
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

