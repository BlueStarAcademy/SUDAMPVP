import { BoardState, createEmptyBoard, makeMove, passMove, Move } from './board';
import { prisma } from '@/lib/prisma';
import { GameMode, GameStatus, GameResult } from '@prisma/client';

export interface GameState {
  id: string;
  mode: GameMode;
  season: number;
  player1Id: string;
  player2Id: string | null;
  aiType: string | null;
  aiLevel: number | null; // GnuGo 난이도 (1-10)
  status: GameStatus;
  boardState: BoardState;
  timeLimit: number; // seconds
  player1Time: number; // seconds remaining
  player2Time: number | null;
  currentPlayer: 1 | 2;
  winnerId: string | null;
  result: GameResult | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export class GameManager {
  private games: Map<string, GameState> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  async createGame(
    player1Id: string,
    mode: GameMode,
    season: number,
    timeLimit: number,
    player2Id?: string,
    aiType?: string,
    aiLevel?: number
  ): Promise<GameState> {
    const game = await prisma.game.create({
      data: {
        mode,
        season,
        player1Id,
        player2Id: player2Id || null,
        aiType: aiType || null,
        aiLevel: aiLevel || null,
        status: 'WAITING',
        moves: [],
        boardState: createEmptyBoard(),
        timeLimit,
        player1Time: timeLimit,
        player2Time: player2Id || aiType ? timeLimit : null,
        currentPlayer: 1,
      },
    });

    const gameState: GameState = {
      id: game.id,
      mode: game.mode as GameMode,
      season: game.season,
      player1Id: game.player1Id,
      player2Id: game.player2Id || null,
      aiType: game.aiType || null,
      aiLevel: (game as any).aiLevel || null,
      status: game.status as GameStatus,
      boardState: createEmptyBoard(),
      timeLimit: game.timeLimit,
      player1Time: game.player1Time,
      player2Time: game.player2Time || null,
      currentPlayer: game.currentPlayer as 1 | 2,
      winnerId: game.winnerId || null,
      result: game.result as GameResult | null,
      createdAt: game.createdAt,
      startedAt: game.startedAt || null,
      finishedAt: game.finishedAt || null,
    };

    this.games.set(game.id, gameState);
    return gameState;
  }

  async startGame(gameId: string): Promise<GameState | null> {
    const game = this.games.get(gameId);
    if (!game) return null;

    if (game.status !== 'WAITING') {
      return game;
    }

    game.status = 'IN_PROGRESS';
    game.startedAt = new Date();

    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: game.startedAt,
      },
    });

    // Start timer
    this.startTimer(gameId);

    return game;
  }

  async makeMove(
    gameId: string,
    player: 1 | 2,
    x: number,
    y: number
  ): Promise<{ success: boolean; error?: string; game?: GameState }> {
    const game = this.games.get(gameId);
    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    if (game.status !== 'IN_PROGRESS') {
      return { success: false, error: 'Game is not in progress' };
    }

    if (game.currentPlayer !== player) {
      return { success: false, error: 'Not your turn' };
    }

    // Note: Player validation should be done at the API/Socket level
    // by checking the authenticated user ID against player1Id/player2Id

    const result = makeMove(game.boardState, player, x, y);
    if (!result.success) {
      return result;
    }

    // Switch player
    game.currentPlayer = player === 1 ? 2 : 1;

    // Update timer
    if (player === 1) {
      // Timer update would be handled by the timer system
    } else if (game.player2Time !== null) {
      // Timer update would be handled by the timer system
    }

    // Save move to database
    await prisma.game.update({
      where: { id: gameId },
      data: {
        moves: game.boardState.moveHistory,
        boardState: game.boardState,
        currentPlayer: game.currentPlayer,
      },
    });

    return { success: true, game };
  }

  async passMove(gameId: string, player: 1 | 2): Promise<{ success: boolean; game?: GameState }> {
    const game = this.games.get(gameId);
    if (!game) {
      return { success: false };
    }

    if (game.currentPlayer !== player) {
      return { success: false };
    }

    passMove(game.boardState, player);
    game.currentPlayer = player === 1 ? 2 : 1;

    await prisma.game.update({
      where: { id: gameId },
      data: {
        moves: game.boardState.moveHistory,
        currentPlayer: game.currentPlayer,
      },
    });

    return { success: true, game };
  }

  private startTimer(gameId: string): void {
    const game = this.games.get(gameId);
    if (!game) return;

    const timer = setInterval(() => {
      const currentGame = this.games.get(gameId);
      if (!currentGame || currentGame.status !== 'IN_PROGRESS') {
        this.stopTimer(gameId);
        return;
      }

      if (currentGame.currentPlayer === 1) {
        currentGame.player1Time--;
        if (currentGame.player1Time <= 0) {
          this.endGame(gameId, 'TIMEOUT', currentGame.player2Id || null);
        }
      } else if (currentGame.player2Time !== null) {
        currentGame.player2Time--;
        if (currentGame.player2Time <= 0) {
          this.endGame(gameId, 'TIMEOUT', currentGame.player1Id);
        }
      }

      // Update database periodically
      prisma.game.update({
        where: { id: gameId },
        data: {
          player1Time: currentGame.player1Time,
          player2Time: currentGame.player2Time,
        },
      }).catch(console.error);
    }, 1000);

    this.timers.set(gameId, timer);
  }

  private stopTimer(gameId: string): void {
    const timer = this.timers.get(gameId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(gameId);
    }
  }

  async endGame(
    gameId: string,
    result: GameResult,
    winnerId: string | null
  ): Promise<GameState | null> {
    const game = this.games.get(gameId);
    if (!game) return null;

    this.stopTimer(gameId);

    game.status = 'FINISHED';
    game.finishedAt = new Date();
    game.result = result;
    game.winnerId = winnerId;

    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: 'FINISHED',
        finishedAt: game.finishedAt,
        result,
        winnerId,
      },
    });

    // Update ratings if both players are human
    if (game.player2Id && !game.aiType) {
      const { updateRatingsAfterGame } = await import('@/lib/rating/ratingManager');
      await updateRatingsAfterGame(gameId, result).catch(console.error);
    }

    // Update AI progress if playing against AI
    if (game.aiType === 'gnugo' && game.aiLevel) {
      const { updateAIProgress } = await import('@/lib/ai/progress');
      const won = winnerId === game.player1Id;
      await updateAIProgress(game.player1Id, won, game.aiLevel).catch(console.error);
    }

    return game;
  }

  getGame(gameId: string): GameState | null {
    return this.games.get(gameId) || null;
  }

  async loadGame(gameId: string): Promise<GameState | null> {
    const dbGame = await prisma.game.findUnique({
      where: { id: gameId },
    });

    if (!dbGame) return null;

    const gameState: GameState = {
      id: dbGame.id,
      mode: dbGame.mode as GameMode,
      season: dbGame.season,
      player1Id: dbGame.player1Id,
      player2Id: dbGame.player2Id || null,
      aiType: dbGame.aiType || null,
      aiLevel: (dbGame as any).aiLevel || null,
      status: dbGame.status as GameStatus,
      boardState: (dbGame.boardState as any) || createEmptyBoard(),
      timeLimit: dbGame.timeLimit,
      player1Time: dbGame.player1Time,
      player2Time: dbGame.player2Time || null,
      currentPlayer: dbGame.currentPlayer as 1 | 2,
      winnerId: dbGame.winnerId || null,
      result: dbGame.result as GameResult | null,
      createdAt: dbGame.createdAt,
      startedAt: dbGame.startedAt || null,
      finishedAt: dbGame.finishedAt || null,
    };

    this.games.set(gameId, gameState);

    if (gameState.status === 'IN_PROGRESS') {
      this.startTimer(gameId);
    }

    return gameState;
  }
}

// Singleton instance
export const gameManager = new GameManager();

