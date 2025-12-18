'use client';

import { createPortal } from 'react-dom';

interface SeasonInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SeasonInfoModal({ isOpen, onClose }: SeasonInfoModalProps) {
  if (!isOpen) return null;

  // 현재 시즌 계산 (분기별: 1월/4월/7월/10월)
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // 1-12
  const currentSeason = Math.floor((currentMonth + 2) / 3); // 1-4
  const currentYear = currentDate.getFullYear();
  const seasonNumber = (currentYear - 2024) * 4 + currentSeason;

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-auto min-w-[320px] max-w-md mx-4 bg-panel text-on-panel rounded-xl p-6 shadow-2xl animate-fade-in border border-color">
        <div className="mb-6 flex items-center justify-between border-b border-color pb-4">
          <h2 className="text-xl font-semibold text-on-panel">시즌 안내</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-secondary transition-all hover:bg-tertiary hover:text-on-panel"
            aria-label="닫기"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl bg-tertiary/30 border border-color p-5">
            <h3 className="mb-2 font-bold text-on-panel">현재 시즌</h3>
            <p className="text-3xl font-bold text-highlight">시즌 {seasonNumber}</p>
            <p className="mt-1 text-sm font-medium text-secondary">
              {currentYear}년 {currentSeason}분기
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="font-bold text-on-panel">시즌 시스템</h3>
            <ul className="space-y-2 text-sm text-secondary">
              <li className="flex items-start gap-2">
                <span className="mt-1">•</span>
                <span>시즌은 분기별로 운영됩니다 (1월, 4월, 7월, 10월)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1">•</span>
                <span>각 시즌마다 등급이 초기화됩니다</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1">•</span>
                <span>시즌별로 별도의 레이팅과 전적이 관리됩니다</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="font-bold text-on-panel">등급 시스템</h3>
            <div className="space-y-2">
              {[
                { name: '초급', range: '0-999', color: 'from-gray-400 to-gray-500' },
                { name: '중급', range: '1000-1499', color: 'from-green-400 to-green-500' },
                { name: '고급', range: '1500-1999', color: 'from-blue-400 to-blue-500' },
                { name: '전문', range: '2000-2499', color: 'from-purple-400 to-purple-500' },
                { name: '마스터', range: '2500+', color: 'from-yellow-400 to-orange-500' },
              ].map((grade) => (
                <div
                  key={grade.name}
                  className="flex items-center justify-between rounded-lg bg-tertiary/30 border border-color p-3"
                >
                  <span className="font-medium text-on-panel">{grade.name}</span>
                  <span className={`rounded-full bg-gradient-to-r ${grade.color} px-3 py-1 text-xs font-bold text-white`}>
                    {grade.range}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="bg-accent hover:bg-accent-hover mt-8 w-full px-6 py-3 text-lg font-bold text-white rounded-lg transition-colors"
        >
          확인
        </button>
      </div>
    </div>
  );

  // Portal을 사용하여 document.body에 직접 렌더링
  if (typeof window !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  
  return null;
}

