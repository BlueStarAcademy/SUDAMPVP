// Baduk (Go) board logic

export const BOARD_SIZE = 19;

export type Stone = 'black' | 'white' | null;
export type Position = { x: number; y: number };

export interface BoardState {
  board: Stone[][];
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

export function createEmptyBoard(): BoardState {
  const board: Stone[][] = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    board[i] = new Array(BOARD_SIZE).fill(null);
  }

  return {
    board,
    capturedBlack: 0,
    capturedWhite: 0,
    lastMove: null,
    moveHistory: [],
  };
}

export function isValidPosition(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

export function getStoneAt(board: Stone[][], x: number, y: number): Stone {
  if (!isValidPosition(x, y)) return null;
  return board[x][y];
}

export function setStone(board: Stone[][], x: number, y: number, stone: Stone): void {
  if (!isValidPosition(x, y)) return;
  board[x][y] = stone;
}

export function getAdjacentPositions(x: number, y: number): Position[] {
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
    if (isValidPosition(newX, newY)) {
      positions.push({ x: newX, y: newY });
    }
  }

  return positions;
}

export function getGroup(board: Stone[][], x: number, y: number): Position[] {
  const stone = getStoneAt(board, x, y);
  if (!stone) return [];

  const group: Position[] = [];
  const visited = new Set<string>();
  const queue: Position[] = [{ x, y }];

  while (queue.length > 0) {
    const pos = queue.shift()!;
    const key = `${pos.x},${pos.y}`;

    if (visited.has(key)) continue;
    visited.add(key);

    if (getStoneAt(board, pos.x, pos.y) === stone) {
      group.push(pos);
      const adjacent = getAdjacentPositions(pos.x, pos.y);
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

export function hasLiberties(board: Stone[][], x: number, y: number): boolean {
  const group = getGroup(board, x, y);
  for (const pos of group) {
    const adjacent = getAdjacentPositions(pos.x, pos.y);
    for (const adj of adjacent) {
      if (getStoneAt(board, adj.x, adj.y) === null) {
        return true;
      }
    }
  }
  return false;
}

export function captureGroup(board: Stone[][], group: Position[]): number {
  let captured = 0;
  for (const pos of group) {
    if (getStoneAt(board, pos.x, pos.y) !== null) {
      setStone(board, pos.x, pos.y, null);
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
  const { board } = boardState;

  // Check if position is valid
  if (!isValidPosition(x, y)) {
    return { success: false, error: 'Invalid position' };
  }

  // Check if position is empty
  if (getStoneAt(board, x, y) !== null) {
    return { success: false, error: 'Position already occupied' };
  }

  // Place stone
  const stone: Stone = player === 1 ? 'black' : 'white';
  setStone(board, x, y, stone);

  // Check for captures
  let totalCaptured = 0;
  const adjacent = getAdjacentPositions(x, y);
  const opponentStone: Stone = player === 1 ? 'white' : 'black';

  for (const adj of adjacent) {
    const adjStone = getStoneAt(board, adj.x, adj.y);
    if (adjStone === opponentStone) {
      if (!hasLiberties(board, adj.x, adj.y)) {
        const group = getGroup(board, adj.x, adj.y);
        const captured = captureGroup(board, group);
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
  if (!hasLiberties(board, x, y)) {
    // Revert the move
    setStone(board, x, y, null);
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
  const result = makeMove(
    { ...boardState, board: boardState.board.map((row) => [...row]) },
    player,
    x,
    y
  );
  return result.success;
}

