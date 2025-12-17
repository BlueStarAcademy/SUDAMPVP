/**
 * 등급 계산 로직 (ELO 기반)
 */

export type Grade = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT' | 'MASTER';

export interface GradeInfo {
  grade: Grade;
  name: string;
  minRating: number;
  maxRating: number;
}

export const GRADE_RANGES: GradeInfo[] = [
  { grade: 'BEGINNER', name: '초급', minRating: 0, maxRating: 999 },
  { grade: 'INTERMEDIATE', name: '중급', minRating: 1000, maxRating: 1499 },
  { grade: 'ADVANCED', name: '고급', minRating: 1500, maxRating: 1999 },
  { grade: 'EXPERT', name: '전문', minRating: 2000, maxRating: 2499 },
  { grade: 'MASTER', name: '마스터', minRating: 2500, maxRating: Infinity },
];

/**
 * 레이팅으로 등급 계산
 */
export function getGradeFromRating(rating: number): GradeInfo {
  for (const gradeInfo of GRADE_RANGES) {
    if (rating >= gradeInfo.minRating && rating <= gradeInfo.maxRating) {
      return gradeInfo;
    }
  }
  // 기본값: 초급
  return GRADE_RANGES[0];
}

/**
 * 등급 ID로 등급 정보 가져오기
 */
export function getGradeInfo(grade: Grade): GradeInfo {
  return GRADE_RANGES.find((g) => g.grade === grade) || GRADE_RANGES[0];
}

