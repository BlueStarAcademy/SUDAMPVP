'use client';

import OnlineUsersList from './OnlineUsersList';
import RankingMatchButton from './RankingMatchButton';

interface GameMatchPanelProps {
  mode: 'STRATEGY' | 'PLAY';
}

export default function GameMatchPanel({ mode }: GameMatchPanelProps) {
  return (
    <div className="space-y-4">
      {/* 접속 유저 목록 (대국신청 포함) */}
      <OnlineUsersList mode={mode} />

      {/* 랭킹전 매칭 버튼 */}
      <div className="baduk-card p-6 animate-fade-in border-2 border-gray-200 dark:border-gray-700">
        <div className="mb-4 flex items-center gap-3 border-b-2 border-gray-200 pb-4 dark:border-gray-700">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-red-600 shadow-lg">
            <span className="text-2xl">🏆</span>
          </div>
          <h2 className="text-xl font-bold">랭킹전 매칭</h2>
        </div>
        <RankingMatchButton />
      </div>
    </div>
  );
}

