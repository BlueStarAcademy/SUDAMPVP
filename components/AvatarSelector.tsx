'use client';

import { DEFAULT_AVATARS } from '@/lib/constants/avatars';
import Image from 'next/image';

interface AvatarSelectorProps {
  selectedAvatarId: string;
  onSelect: (avatarId: string) => void;
}

export default function AvatarSelector({ selectedAvatarId, onSelect }: AvatarSelectorProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {DEFAULT_AVATARS.map((avatar) => (
        <button
          key={avatar.id}
          type="button"
          onClick={() => onSelect(avatar.id)}
          className={`relative aspect-square rounded-lg border-2 transition-all ${
            selectedAvatarId === avatar.id
              ? 'border-blue-600 ring-2 ring-blue-300'
              : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
          }`}
        >
          <div className="relative h-full w-full">
            {/* 실제 이미지가 있으면 Image 컴포넌트 사용, 없으면 플레이스홀더 */}
            {avatar.imagePath ? (
              <Image
                src={avatar.imagePath}
                alt={avatar.name}
                fill
                className="rounded-lg object-cover"
                onError={(e) => {
                  // 이미지 로드 실패 시 플레이스홀더 표시
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-lg bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                {avatar.name}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

