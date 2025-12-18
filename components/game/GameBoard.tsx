'use client';

import { useState } from 'react';

interface GameBoardProps {
  boardState: any;
  boardSize: number;
  currentPlayer: 1 | 2;
  onMakeMove: (x: number, y: number) => void;
  isMyTurn: boolean;
}

export default function GameBoard({
  boardState,
  boardSize,
  currentPlayer,
  onMakeMove,
  isMyTurn,
}: GameBoardProps) {
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number } | null>(null);

  const board = boardState?.board || [];
  const cellSize = Math.min(400 / boardSize, 30); // 최대 400px, 셀당 최대 30px

  const handleCellClick = (x: number, y: number) => {
    if (!isMyTurn) return;
    if (board[x]?.[y] !== null && board[x]?.[y] !== undefined) return; // 이미 돌이 있음
    onMakeMove(x, y);
  };

  const getStoneColor = (stone: string | null): string => {
    if (stone === 'black') return 'bg-black';
    if (stone === 'white') return 'bg-white';
    return '';
  };

  const isLastMove = (x: number, y: number): boolean => {
    if (!boardState?.lastMove) return false;
    return boardState.lastMove.x === x && boardState.lastMove.y === y;
  };

  return (
    <div
      className="relative inline-block"
      style={{
        width: `${cellSize * boardSize}px`,
        height: `${cellSize * boardSize}px`,
      }}
    >
      {/* 바둑판 배경 - 나무 질감 */}
      <div
        className="absolute inset-0 rounded-lg shadow-2xl"
        style={{
          background: `
            radial-gradient(circle at 20% 30%, rgba(220, 179, 92, 0.8) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(201, 160, 74, 0.8) 0%, transparent 50%),
            linear-gradient(135deg, #dcb35c 0%, #c9a04a 50%, #b8953f 100%)
          `,
          boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.1), 0 10px 40px rgba(0, 0, 0, 0.3)',
        }}
      />

      {/* 격자선 - 더 선명하고 세련된 스타일 */}
      <svg
        className="absolute inset-0"
        style={{ width: '100%', height: '100%' }}
      >
        {Array.from({ length: boardSize }).map((_, i) => (
          <g key={i}>
            {/* 가로선 */}
            <line
              x1={cellSize * 0.5}
              y1={cellSize * (i + 0.5)}
              x2={cellSize * (boardSize - 0.5)}
              y2={cellSize * (i + 0.5)}
              stroke="#6b5a3c"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            {/* 세로선 */}
            <line
              x1={cellSize * (i + 0.5)}
              y1={cellSize * 0.5}
              x2={cellSize * (i + 0.5)}
              y2={cellSize * (boardSize - 0.5)}
              stroke="#6b5a3c"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </g>
        ))}
        
        {/* 별(星) 표시 - 19x19 보드의 경우 */}
        {boardSize === 19 && [3, 9, 15].map((starX) =>
          [3, 9, 15].map((starY) => (
            <circle
              key={`star-${starX}-${starY}`}
              cx={cellSize * (starX + 0.5)}
              cy={cellSize * (starY + 0.5)}
              r={cellSize * 0.08}
              fill="#6b5a3c"
            />
          ))
        )}
        
        {/* 13x13 보드의 경우 */}
        {boardSize === 13 && [3, 6, 9].map((starX) =>
          [3, 6, 9].map((starY) => (
            <circle
              key={`star-${starX}-${starY}`}
              cx={cellSize * (starX + 0.5)}
              cy={cellSize * (starY + 0.5)}
              r={cellSize * 0.08}
              fill="#6b5a3c"
            />
          ))
        )}
        
        {/* 9x9 보드의 경우 */}
        {boardSize === 9 && [2, 4, 6].map((starX) =>
          [2, 4, 6].map((starY) => (
            <circle
              key={`star-${starX}-${starY}`}
              cx={cellSize * (starX + 0.5)}
              cy={cellSize * (starY + 0.5)}
              r={cellSize * 0.08}
              fill="#6b5a3c"
            />
          ))
        )}
      </svg>

      {/* 돌들 */}
      {Array.from({ length: boardSize }).map((_, x) =>
        Array.from({ length: boardSize }).map((_, y) => {
          const stone = board[x]?.[y];
          const isEmpty = stone === null || stone === undefined;
          const isHovered = hoveredCell?.x === x && hoveredCell?.y === y;
          const isLast = isLastMove(x, y);

          return (
            <div
              key={`${x}-${y}`}
              className="absolute cursor-pointer transition-all"
              style={{
                left: `${cellSize * (y + 0.5) - cellSize * 0.4}px`,
                top: `${cellSize * (x + 0.5) - cellSize * 0.4}px`,
                width: `${cellSize * 0.8}px`,
                height: `${cellSize * 0.8}px`,
              }}
              onMouseEnter={() => {
                if (isEmpty && isMyTurn) {
                  setHoveredCell({ x, y });
                }
              }}
              onMouseLeave={() => setHoveredCell(null)}
              onClick={() => handleCellClick(x, y)}
            >
              {/* 돌 - 더 현실적인 디자인 */}
              {stone && (
                <div
                  className={`absolute inset-0 rounded-full shadow-xl ${
                    getStoneColor(stone)
                  } ${isLast ? 'ring-4 ring-blue-400 ring-opacity-60 z-10' : ''}`}
                  style={{
                    border: stone === 'black' 
                      ? '2px solid rgba(0, 0, 0, 0.3)' 
                      : '2px solid rgba(0, 0, 0, 0.1)',
                    background: stone === 'black'
                      ? 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.15) 0%, rgba(0, 0, 0, 0.9) 70%, #000000 100%)'
                      : 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.95) 0%, rgba(240, 240, 240, 0.9) 70%, #e8e8e8 100%)',
                    boxShadow: stone === 'black'
                      ? 'inset 0 2px 4px rgba(255, 255, 255, 0.2), 0 4px 8px rgba(0, 0, 0, 0.4)'
                      : 'inset 0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.3)',
                  }}
                />
              )}

              {/* 호버 표시 (빈 칸일 때) - 더 부드러운 효과 */}
              {isEmpty && isHovered && isMyTurn && (
                <div
                  className="absolute inset-0 rounded-full opacity-60 animate-pulse"
                  style={{
                    background: currentPlayer === 1
                      ? 'radial-gradient(circle, rgba(0, 0, 0, 0.4) 0%, transparent 70%)'
                      : 'radial-gradient(circle, rgba(255, 255, 255, 0.6) 0%, transparent 70%)',
                    border: currentPlayer === 1
                      ? '2px dashed rgba(0, 0, 0, 0.5)'
                      : '2px dashed rgba(0, 0, 0, 0.3)',
                  }}
                />
              )}
            </div>
          );
        })
      )}

      {/* 정보 표시 */}
      <div className="absolute -bottom-8 left-0 right-0 flex justify-between text-xs text-gray-600 dark:text-gray-400">
        <div>
          따낸 돌: 흑 {boardState?.capturedBlack || 0} / 백 {boardState?.capturedWhite || 0}
        </div>
        <div>
          수순: {boardState?.moveHistory?.length || 0}수
        </div>
      </div>
    </div>
  );
}

