import fs from 'fs';
import path from 'path';

// 금지 단어 목록 파일 경로
const BANNED_WORDS_FILE = path.join(process.cwd(), 'data', 'banned-words.txt');

// 한글 1-6글자 검증 정규식
const NICKNAME_REGEX = /^[가-힣]{1,6}$/;

// 금지 단어 목록을 메모리에 캐시
let bannedWordsCache: string[] | null = null;

/**
 * 금지 단어 목록을 로드합니다.
 */
function loadBannedWords(): string[] {
  if (bannedWordsCache !== null) {
    return bannedWordsCache;
  }

  try {
    const filePath = BANNED_WORDS_FILE;
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      bannedWordsCache = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#')); // 빈 줄과 주석 제거
    } else {
      bannedWordsCache = [];
    }
  } catch (error) {
    console.error('Failed to load banned words:', error);
    bannedWordsCache = [];
  }

  return bannedWordsCache;
}

/**
 * 닉네임 형식 검증 (한글 1-6글자)
 */
export function validateNicknameFormat(nickname: string): {
  valid: boolean;
  error?: string;
} {
  if (!nickname || nickname.trim().length === 0) {
    return { valid: false, error: '닉네임을 입력해주세요.' };
  }

  if (!NICKNAME_REGEX.test(nickname)) {
    return {
      valid: false,
      error: '닉네임은 한글 1-6글자만 사용할 수 있습니다.',
    };
  }

  return { valid: true };
}

/**
 * 금지 단어 검사
 */
export function checkBannedWords(nickname: string): {
  valid: boolean;
  error?: string;
} {
  const bannedWords = loadBannedWords();
  const lowerNickname = nickname.toLowerCase();

  for (const bannedWord of bannedWords) {
    if (lowerNickname.includes(bannedWord.toLowerCase())) {
      return {
        valid: false,
        error: '사용할 수 없는 단어가 포함되어 있습니다.',
      };
    }
  }

  return { valid: true };
}

/**
 * 닉네임 전체 검증 (형식 + 금지 단어)
 */
export function validateNickname(nickname: string): {
  valid: boolean;
  error?: string;
} {
  // 형식 검증
  const formatCheck = validateNicknameFormat(nickname);
  if (!formatCheck.valid) {
    return formatCheck;
  }

  // 금지 단어 검사
  const bannedCheck = checkBannedWords(nickname);
  if (!bannedCheck.valid) {
    return bannedCheck;
  }

  return { valid: true };
}

