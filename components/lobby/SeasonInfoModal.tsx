'use client';

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl dark:bg-gray-800 animate-fade-in">
        <div className="mb-6 flex items-center justify-between border-b border-gray-200 pb-4 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600">
              <span className="text-2xl">📅</span>
            </div>
            <h2 className="text-2xl font-bold">시즌 안내</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <span className="text-2xl">✕</span>
          </button>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 p-5 dark:from-green-900/20 dark:to-emerald-900/20">
            <h3 className="mb-2 font-bold text-gray-800 dark:text-gray-200">현재 시즌</h3>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">시즌 {seasonNumber}</p>
            <p className="mt-1 text-sm font-medium text-gray-600 dark:text-gray-400">
              {currentYear}년 {currentSeason}분기
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="font-bold text-gray-800 dark:text-gray-200">시즌 시스템</h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
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
            <h3 className="font-bold text-gray-800 dark:text-gray-200">등급 시스템</h3>
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
                  className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700"
                >
                  <span className="font-medium text-gray-700 dark:text-gray-300">{grade.name}</span>
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
          className="baduk-button-primary mt-8 w-full px-6 py-3 text-lg font-bold"
        >
          확인
        </button>
      </div>
    </div>
  );
}

