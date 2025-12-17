'use client';

import { useState } from 'react';
import AIGameSetupModal from './AIGameSetupModal';

export default function AIBattleButton() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="baduk-card p-6 animate-fade-in">
        <div className="mb-6 flex items-center gap-3 border-b border-gray-200 pb-4 dark:border-gray-700">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600">
            <span className="text-xl">🤖</span>
          </div>
          <h2 className="text-xl font-bold">AI봇 대결</h2>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="baduk-button-success w-full px-6 py-5 text-lg font-bold shadow-lg transition-transform hover:scale-105"
        >
          <span className="flex items-center justify-center gap-2">
            <span className="text-2xl">⚔️</span>
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

