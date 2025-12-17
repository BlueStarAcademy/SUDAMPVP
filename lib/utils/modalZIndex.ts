// 모달 z-index 관리 유틸리티
let currentZIndex = 1000; // 기본 z-index 시작값

export const getNextZIndex = (): number => {
  currentZIndex += 10;
  return currentZIndex;
};

export const resetZIndex = () => {
  currentZIndex = 1000;
};

