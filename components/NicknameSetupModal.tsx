'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-auto min-w-[320px] max-w-md mx-4 bg-panel text-on-panel rounded-xl p-6 shadow-2xl animate-fade-in border border-color">
        <div className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-on-panel">닉네임 및 아바타 설정</h2>
            <button
              onClick={onComplete}
              className="rounded-md p-1.5 text-secondary transition-all hover:bg-tertiary hover:text-on-panel"
              aria-label="닫기"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-secondary">
            게임을 시작하기 전에 닉네임과 아바타를 설정해주세요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 닉네임 입력 */}
          <div>
            <label htmlFor="nickname" className="mb-2 block text-sm font-bold text-on-panel">
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
                className="flex-1 rounded-lg border-2 border-color bg-secondary px-4 py-3.5 font-medium text-on-panel transition-colors focus:border-accent focus:outline-none focus:ring-accent"
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
            <label className="mb-3 block text-sm font-bold text-on-panel">
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

  // Portal을 사용하여 document.body에 직접 렌더링
  if (typeof window !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  
  return null;
}

