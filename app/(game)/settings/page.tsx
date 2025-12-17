'use client';

import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
        <h2 className="mb-4 text-2xl font-bold">설정</h2>
        <p className="mb-4 text-gray-600 dark:text-gray-400">
          설정 기능은 추후 구현 예정입니다.
        </p>
        <button
          onClick={() => router.push('/lobby')}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          대기실로 돌아가기
        </button>
      </div>
    </div>
  );
}

