'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import SeasonInfoModal from './SeasonInfoModal';

export default function Header() {
  const router = useRouter();
  const [showSeasonModal, setShowSeasonModal] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  return (
    <>
      <header className="baduk-header mb-6 flex items-center justify-between p-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white bg-opacity-20">
            <span className="text-2xl">⚫</span>
          </div>
          <h1 className="text-3xl font-bold">대기실</h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowSeasonModal(true)}
            className="baduk-button-success flex items-center gap-2 px-5 py-2.5"
          >
            <span>📅</span>
            <span>시즌 안내</span>
          </button>
          <button
            onClick={() => router.push('/settings')}
            className="baduk-button-secondary flex items-center gap-2 px-5 py-2.5"
          >
            <span>⚙️</span>
            <span>설정</span>
          </button>
          <button
            onClick={handleLogout}
            className="baduk-button-danger flex items-center gap-2 px-5 py-2.5"
          >
            <span>🚪</span>
            <span>로그아웃</span>
          </button>
        </div>
      </header>
      <SeasonInfoModal
        isOpen={showSeasonModal}
        onClose={() => setShowSeasonModal(false)}
      />
    </>
  );
}

