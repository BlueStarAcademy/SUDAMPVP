/**
 * 비속어 필터링 유틸리티
 */

// 비속어 목록 (한국어)
const PROFANITY_WORDS = [
  '시발', '씨발', '좆', '개새끼', '병신', '미친', '미친놈', '미친년',
  '지랄', '좆같', '좆만', '좆도', '좆나', '좆밥', '좆물', '좆집',
  '개같', '개만', '개도', '개나', '개밥', '개물', '개집',
  '새끼', '새퀴', '새키', '새기',
  '병신', '병딱', '병탱', '병맛',
  '미친', '미쳤', '미쳤네', '미쳤냐',
  '지랄', '지랄하', '지랄이', '지랄맞',
  '닥쳐', '닥치', '닥쳐라',
  '엿먹', '엿먹어', '엿먹어라',
  '죽어', '죽어라', '죽어버려',
  '꺼져', '꺼져라', '꺼지',
  '바보', '멍청이', '등신',
  '호로', '호구', '호로새끼',
  '씹', '씹새끼', '씹년', '씹놈',
  '젖', '젖같', '젖만',
  '똥', '똥개', '똥밥',
  '개소리', '개수작', '개지랄',
  '좆소리', '좆수작', '좆지랄',
  '병신소리', '병신수작', '병신지랄',
  '미친소리', '미친수작', '미친지랄',
];

/**
 * 비속어를 필터링하여 *로 대체
 */
export function filterProfanity(text: string): string {
  let filtered = text;
  
  PROFANITY_WORDS.forEach((word) => {
    const regex = new RegExp(word, 'gi');
    filtered = filtered.replace(regex, '*'.repeat(word.length));
  });
  
  return filtered;
}

/**
 * 비속어가 포함되어 있는지 확인
 */
export function containsProfanity(text: string): boolean {
  const filtered = filterProfanity(text);
  return filtered !== text;
}

