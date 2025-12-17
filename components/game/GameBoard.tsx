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
      {/* 바둑판 배경 */}
      <div
        className="absolute inset-0 rounded-lg"
        style={{
          background: 'linear-gradient(to bottom, #dcb35c 0%, #c9a04a 100%)',
        }}
      />

      {/* 격자선 */}
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
              stroke="#8b6914"
              strokeWidth="1"
            />
            {/* 세로선 */}
            <line
              x1={cellSize * (i + 0.5)}
              y1={cellSize * 0.5}
              x2={cellSize * (i + 0.5)}
              y2={cellSize * (boardSize - 0.5)}
              stroke="#8b6914"
              strokeWidth="1"
            />
          </g>
        ))}
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
              {/* 돌 */}
              {stone && (
                <div
                  className={`absolute inset-0 rounded-full border-2 shadow-lg ${
                    getStoneColor(stone)
                  } ${isLast ? 'ring-4 ring-blue-400' : ''}`}
                />
              )}

              {/* 호버 표시 (빈 칸일 때) */}
              {isEmpty && isHovered && isMyTurn && (
                <div
                  className={`absolute inset-0 rounded-full border-2 opacity-50 ${
                    currentPlayer === 1
                      ? 'border-black bg-black'
                      : 'border-white bg-white'
                  }`}
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

