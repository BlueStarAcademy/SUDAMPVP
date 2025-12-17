/**
 * 기본 아바타 목록 상수
 * 참고 저장소에서 가져온 아바타 이미지들을 관리합니다.
 */

export interface Avatar {
  id: string;
  name: string;
  imagePath: string;
}

// 기본 아바타 목록 (실제 이미지 파일이 추가되면 업데이트 필요)
export const DEFAULT_AVATARS: Avatar[] = [
  { id: 'avatar-1', name: '아바타 1', imagePath: '/avatars/avatar-1.png' },
  { id: 'avatar-2', name: '아바타 2', imagePath: '/avatars/avatar-2.png' },
  { id: 'avatar-3', name: '아바타 3', imagePath: '/avatars/avatar-3.png' },
  { id: 'avatar-4', name: '아바타 4', imagePath: '/avatars/avatar-4.png' },
  { id: 'avatar-5', name: '아바타 5', imagePath: '/avatars/avatar-5.png' },
  { id: 'avatar-6', name: '아바타 6', imagePath: '/avatars/avatar-6.png' },
  { id: 'avatar-7', name: '아바타 7', imagePath: '/avatars/avatar-7.png' },
  { id: 'avatar-8', name: '아바타 8', imagePath: '/avatars/avatar-8.png' },
];

/**
 * 아바타 ID로 아바타 정보 가져오기
 */
export function getAvatar(avatarId: string): Avatar | undefined {
  return DEFAULT_AVATARS.find((avatar) => avatar.id === avatarId);
}

/**
 * 기본 아바타 ID (첫 번째 아바타)
 */
export const DEFAULT_AVATAR_ID = DEFAULT_AVATARS[0]?.id || 'avatar-1';

