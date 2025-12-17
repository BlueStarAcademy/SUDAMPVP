'use client';

import { useState } from 'react';
import AIGameSetupModal from './AIGameSetupModal';

export default function AIBattleButton() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="baduk-card p-3 animate-fade-in h-full flex flex-col">
        <div className="mb-2 flex items-center gap-2 border-b border-gray-200 pb-2 dark:border-gray-700">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600">
            <span className="text-sm">🤖</span>
          </div>
          <h2 className="text-sm font-bold">AI봇 대결</h2>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="baduk-button-success w-full px-3 py-3 text-sm font-bold shadow-md transition-transform hover:scale-105 flex-1 flex items-center justify-center"
        >
          <span className="flex items-center justify-center gap-2">
            <span className="text-lg">⚔️</span>
            <span>도전하기</span>
          </span>
        </button>
      </div>
      <AIGameSetupModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}

