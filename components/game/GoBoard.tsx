'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Player, Point, BoardState, GameStatus, Move, AnimationData, RecommendedMove, AnalysisResult } from '@/lib/game/boardTypes';
import { WHITE_BASE_STONE_IMG, BLACK_BASE_STONE_IMG, WHITE_HIDDEN_STONE_IMG, BLACK_HIDDEN_STONE_IMG } from '@/lib/game/boardTypes';

// 간소화된 Stone 컴포넌트
const Stone: React.FC<{ 
  player: Player; 
  cx: number; 
  cy: number; 
  isLastMove?: boolean; 
  radius: number;
}> = ({ player, cx, cy, isLastMove, radius }) => {
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill={player === Player.Black ? "#111827" : "#f5f2e8"}
      />
      {player === Player.White && <circle cx={cx} cy={cy} r={radius} fill="url(#clam_grain)" />}
      <circle cx={cx} cy={cy} r={radius} fill={player === Player.Black ? 'url(#slate_highlight)' : 'url(#clamshell_highlight)'} />
      {isLastMove && (
        <circle
          cx={cx}
          cy={cy}
          r={radius * 0.25}
          fill="rgba(239, 68, 68, 0.9)"
          className="animate-pulse"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
};

interface GoBoardProps {
  boardState: BoardState;
  boardSize: number;
  onBoardClick: (x: number, y: number) => void;
  lastMove: Point | null;
  isBoardDisabled: boolean;
  stoneColor: Player;
  currentPlayer: Player;
  isMyTurn: boolean;
  showLastMoveMarker?: boolean;
  mode?: string;
  gameStatus?: string;
}

const GoBoard: React.FC<GoBoardProps> = (props) => {
  const { 
    boardState, 
    boardSize, 
    onBoardClick, 
    lastMove, 
    isBoardDisabled, 
    stoneColor,
    currentPlayer,
    isMyTurn,
    showLastMoveMarker = true,
  } = props;
  
  const [hoverPos, setHoverPos] = useState<Point | null>(null);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 1024 : false);
  const svgRef = useRef<SVGSVGElement>(null);
  const boardSizePx = 840;
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkIsMobile = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  const safeBoardSize = boardSize > 0 ? boardSize : 19;
  const cell_size = boardSizePx / safeBoardSize;
  const padding = cell_size / 2;
  const stone_radius = cell_size * 0.47;

  const starPoints = useMemo(() => {
    if (safeBoardSize === 19) return [{ x: 3, y: 3 }, { x: 9, y: 3 }, { x: 15, y: 3 }, { x: 3, y: 9 }, { x: 9, y: 9 }, { x: 15, y: 9 }, { x: 3, y: 15 }, { x: 9, y: 15 }, { x: 15, y: 15 }];
    if (safeBoardSize === 15) return [{ x: 3, y: 3 }, { x: 11, y: 3 }, { x: 7, y: 7 }, { x: 3, y: 11 }, { x: 11, y: 11 }];
    if (safeBoardSize === 13) return [{ x: 3, y: 3 }, { x: 9, y: 3 }, { x: 3, y: 9 }, { x: 9, y: 9 }, { x: 6, y: 6 }];
    if (safeBoardSize === 11) return [{ x: 2, y: 2 }, { x: 8, y: 2 }, { x: 5, y: 5 }, { x: 2, y: 8 }, { x: 8, y: 8 }];
    if (safeBoardSize === 9) return [{ x: 2, y: 2 }, { x: 6, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 6 }, { x: 6, y: 6 }];
    if (safeBoardSize === 7) return [{ x: 3, y: 3 }];
    return [];
  }, [safeBoardSize]);

  const toSvgCoords = (p: Point) => ({
    cx: padding + p.x * cell_size,
    cy: padding + p.y * cell_size,
  });

  const getBoardCoordinates = (e: React.MouseEvent<SVGSVGElement> | React.PointerEvent<SVGSVGElement>): Point | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    
    const ctm = svg.getScreenCTM();
    if (ctm) {
      const transformedPt = pt.matrixTransform(ctm.inverse());
      const x = Math.round((transformedPt.x - padding) / cell_size);
      const y = Math.round((transformedPt.y - padding) / cell_size);

      if (x >= 0 && x < safeBoardSize && y >= 0 && y < safeBoardSize) {
        return { x, y };
      }
    }
    return null;
  };

  const handleBoardPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const pos = getBoardCoordinates(e);
    setHoverPos(pos);
  };

  const handleBoardPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 2 || e.buttons === 2) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    const boardPos = getBoardCoordinates(e);
    if (!isBoardDisabled && boardPos && isMyTurn) {
      const stoneAtPos = boardState[boardPos.y]?.[boardPos.x];
      if (stoneAtPos === Player.None) {
        onBoardClick(boardPos.x, boardPos.y);
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  };

  const displayBoardState = useMemo(() => {
    if (!boardState || !Array.isArray(boardState) || boardState.length === 0) {
      return Array(safeBoardSize).fill(null).map(() => Array(safeBoardSize).fill(Player.None));
    }
    return boardState;
  }, [boardState, safeBoardSize]);

  const showHoverPreview = hoverPos && !isBoardDisabled && isMyTurn && displayBoardState[hoverPos.y]?.[hoverPos.x] === Player.None;

  return (
    <div 
      className="relative w-full h-full shadow-2xl rounded-lg overflow-hidden p-0 border-4 bg-transparent go-board-panel border-gray-800"
      style={{ 
        backgroundImage: 'none', 
        backgroundColor: 'transparent',
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${boardSizePx} ${boardSizePx}`}
        className="w-full h-full touch-none"
        onPointerMove={handleBoardPointerMove}
        onPointerUp={handleBoardPointerUp}
        onPointerLeave={() => { setHoverPos(null); }}
        onContextMenu={handleContextMenu}
      >
        <defs>
          <radialGradient id="slate_highlight" cx="35%" cy="35%" r="60%" fx="30%" fy="30%">
            <stop offset="0%" stopColor="#6b7280" stopOpacity="0.8"/>
            <stop offset="100%" stopColor="#111827" stopOpacity="0.2"/>
          </radialGradient>
          <radialGradient id="clamshell_highlight" cx="35%" cy="35%" r="60%" fx="30%" fy="30%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9"/>
            <stop offset="100%" stopColor="#e5e7eb" stopOpacity="0.1"/>
          </radialGradient>
          <filter id="clam_grain_filter">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch"/>
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.1 0" />
          </filter>
          <pattern id="clam_grain" patternUnits="userSpaceOnUse" width="100" height="100">
            <rect width="100" height="100" fill="#f5f2e8"/>
            <rect width="100" height="100" filter="url(#clam_grain_filter)"/>
          </pattern>
        </defs>
        <rect width={boardSizePx} height={boardSizePx} fill="#e0b484" />
        {Array.from({ length: safeBoardSize }).map((_, i) => (
          <g key={i}>
            <line x1={padding + i * cell_size} y1={padding} x2={padding + i * cell_size} y2={boardSizePx - padding} stroke="#54432a" strokeWidth="1.5" />
            <line x1={padding} y1={padding + i * cell_size} x2={boardSizePx - padding} y2={padding + i * cell_size} stroke="#54432a" strokeWidth="1.5" />
          </g>
        ))}
        {starPoints.map((p, i) => <circle key={i} {...toSvgCoords(p)} r={safeBoardSize > 9 ? 6 : 4} fill="#54432a" />)}
        
        {displayBoardState.map((row, y) => row.map((player, x) => {
          if (player === Player.None) return null;
          const { cx, cy } = toSvgCoords({ x, y });
          const isLast = showLastMoveMarker && lastMove && lastMove.x === x && lastMove.y === y;
          
          return <Stone key={`${x}-${y}`} player={player} cx={cx} cy={cy} isLastMove={isLast} radius={stone_radius} />;
        }))}

        {showHoverPreview && hoverPos && (
          <g opacity="0.5">
            <Stone player={stoneColor} cx={toSvgCoords(hoverPos).cx} cy={toSvgCoords(hoverPos).cy} radius={stone_radius} />
          </g>
        )}
      </svg>
    </div>
  );
};

export default GoBoard;

