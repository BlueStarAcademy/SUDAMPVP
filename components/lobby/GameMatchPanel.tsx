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
      <div className="baduk-card p-3 animate-fade-in border-2 border-gray-200 dark:border-gray-700 h-full flex flex-col">
        <div className="mb-2 flex items-center gap-2 border-b-2 border-gray-200 pb-2 dark:border-gray-700">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-red-600 shadow-md">
            <span className="text-sm">🏆</span>
          </div>
          <h2 className="text-sm font-bold">랭킹전 매칭</h2>
        </div>
        <div className="flex-1">
          <RankingMatchButton />
        </div>
      </div>
    </div>
  );
}

