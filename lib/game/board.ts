// Baduk (Go) board logic

export const DEFAULT_BOARD_SIZE = 19;
export const VALID_BOARD_SIZES = [9, 13, 19];

export type Stone = 'black' | 'white' | null;
export type Position = { x: number; y: number };

export interface BoardState {
  board: Stone[][];
  boardSize: number; // 보드 크기 (9, 13, 19)
  capturedBlack: number;
  capturedWhite: number;
  lastMove: Position | null;
  moveHistory: Move[];
}

export interface Move {
  player: 1 | 2; // 1 = black, 2 = white
  position: Position | null; // null = pass
  timestamp: number;
}

export function createEmptyBoard(boardSize: number = DEFAULT_BOARD_SIZE): BoardState {
  // 보드 크기 검증
  if (!VALID_BOARD_SIZES.includes(boardSize)) {
    boardSize = DEFAULT_BOARD_SIZE;
  }

  const board: Stone[][] = [];
  for (let i = 0; i < boardSize; i++) {
    board[i] = new Array(boardSize).fill(null);
  }

  return {
    board,
    boardSize,
    capturedBlack: 0,
    capturedWhite: 0,
    lastMove: null,
    moveHistory: [],
  };
}

export function isValidPosition(x: number, y: number, boardSize: number): boolean {
  return x >= 0 && x < boardSize && y >= 0 && y < boardSize;
}

export function getStoneAt(board: Stone[][], x: number, y: number, boardSize: number): Stone {
  if (!isValidPosition(x, y, boardSize)) return null;
  return board[x][y];
}

export function setStone(board: Stone[][], x: number, y: number, stone: Stone, boardSize: number): void {
  if (!isValidPosition(x, y, boardSize)) return;
  board[x][y] = stone;
}

export function getAdjacentPositions(x: number, y: number, boardSize: number): Position[] {
  const positions: Position[] = [];
  const directions = [
    { x: 0, y: -1 }, // up
    { x: 0, y: 1 },  // down
    { x: -1, y: 0 }, // left
    { x: 1, y: 0 },  // right
  ];

  for (const dir of directions) {
    const newX = x + dir.x;
    const newY = y + dir.y;
    if (isValidPosition(newX, newY, boardSize)) {
      positions.push({ x: newX, y: newY });
    }
  }

  return positions;
}

export function getGroup(board: Stone[][], x: number, y: number, boardSize: number): Position[] {
  const stone = getStoneAt(board, x, y, boardSize);
  if (!stone) return [];

  const group: Position[] = [];
  const visited = new Set<string>();
  const queue: Position[] = [{ x, y }];

  while (queue.length > 0) {
    const pos = queue.shift()!;
    const key = `${pos.x},${pos.y}`;

    if (visited.has(key)) continue;
    visited.add(key);

    if (getStoneAt(board, pos.x, pos.y, boardSize) === stone) {
      group.push(pos);
      const adjacent = getAdjacentPositions(pos.x, pos.y, boardSize);
      for (const adj of adjacent) {
        const adjKey = `${adj.x},${adj.y}`;
        if (!visited.has(adjKey)) {
          queue.push(adj);
        }
      }
    }
  }

  return group;
}

export function hasLiberties(board: Stone[][], x: number, y: number, boardSize: number): boolean {
  const group = getGroup(board, x, y, boardSize);
  for (const pos of group) {
    const adjacent = getAdjacentPositions(pos.x, pos.y, boardSize);
    for (const adj of adjacent) {
      if (getStoneAt(board, adj.x, adj.y, boardSize) === null) {
        return true;
      }
    }
  }
  return false;
}

export function captureGroup(board: Stone[][], group: Position[], boardSize: number): number {
  let captured = 0;
  for (const pos of group) {
    if (getStoneAt(board, pos.x, pos.y, boardSize) !== null) {
      setStone(board, pos.x, pos.y, null, boardSize);
      captured++;
    }
  }
  return captured;
}

export function makeMove(
  boardState: BoardState,
  player: 1 | 2,
  x: number,
  y: number
): { success: boolean; error?: string; captured?: number } {
  const { board, boardSize } = boardState;

  // Check if position is valid
  if (!isValidPosition(x, y, boardSize)) {
    return { success: false, error: 'Invalid position' };
  }

  // Check if position is empty
  if (getStoneAt(board, x, y, boardSize) !== null) {
    return { success: false, error: 'Position already occupied' };
  }

  // Place stone
  const stone: Stone = player === 1 ? 'black' : 'white';
  setStone(board, x, y, stone, boardSize);

  // Check for captures
  let totalCaptured = 0;
  const adjacent = getAdjacentPositions(x, y, boardSize);
  const opponentStone: Stone = player === 1 ? 'white' : 'black';

  for (const adj of adjacent) {
    const adjStone = getStoneAt(board, adj.x, adj.y, boardSize);
    if (adjStone === opponentStone) {
      if (!hasLiberties(board, adj.x, adj.y, boardSize)) {
        const group = getGroup(board, adj.x, adj.y, boardSize);
        const captured = captureGroup(board, group, boardSize);
        totalCaptured += captured;
        if (player === 1) {
          boardState.capturedBlack += captured;
        } else {
          boardState.capturedWhite += captured;
        }
      }
    }
  }

  // Check if own group has liberties (suicide rule)
  if (!hasLiberties(board, x, y, boardSize)) {
    // Revert the move
    setStone(board, x, y, null, boardSize);
    return { success: false, error: 'Invalid move: suicide' };
  }

  // Check for ko rule (simplified - would need move history for full ko detection)
  // For now, we'll allow it and handle ko in the game manager

  // Record move
  const move: Move = {
    player,
    position: { x, y },
    timestamp: Date.now(),
  };

  boardState.moveHistory.push(move);
  boardState.lastMove = { x, y };

  return { success: true, captured: totalCaptured };
}

export function passMove(boardState: BoardState, player: 1 | 2): void {
  const move: Move = {
    player,
    position: null,
    timestamp: Date.now(),
  };
  boardState.moveHistory.push(move);
}

export function isValidMove(
  boardState: BoardState,
  player: 1 | 2,
  x: number,
  y: number
): boolean {
  // Deep copy board state for testing
  const testState: BoardState = {
    ...boardState,
    board: boardState.board.map((row) => [...row]),
    moveHistory: [...boardState.moveHistory],
  };
  const result = makeMove(testState, player, x, y);
  return result.success;
}

