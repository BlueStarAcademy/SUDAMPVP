// 모달 z-index 관리 유틸리티
let currentZIndex = 9999; // 기본 z-index 시작값 (높은 값으로 설정)

export const getNextZIndex = (): number => {
  currentZIndex += 10;
  return currentZIndex;
};

export const resetZIndex = () => {
  currentZIndex = 9999;
};

