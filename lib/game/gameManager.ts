import { BoardState, createEmptyBoard, makeMove, passMove, Move, DEFAULT_BOARD_SIZE } from './board';
import { prisma } from '@/lib/prisma';
import { GameMode, GameStatus, GameResult } from '@prisma/client';
import {
  validateMoveWithRule,
  applyRuleAfterMove,
  checkGameEndWithRule,
  calculateScoreWithRule,
  getGameRule,
} from './rules';

export interface GameState {
  id: string;
  mode: GameMode;
  season: number;
  gameType: string | null;
  boardSize: number | null;
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
    aiLevel?: number,
    gameType?: string,
    boardSize?: number,
    gameRules?: any
  ): Promise<GameState> {
    const finalBoardSize = boardSize || DEFAULT_BOARD_SIZE;
    const initialBoardState = createEmptyBoard(finalBoardSize);

    // 게임 규칙 초기화
    const rule = getGameRule(gameType);
    if (rule?.initialize) {
      rule.initialize(initialBoardState, gameRules);
    }

    const game = await prisma.game.create({
      data: {
        mode,
        season,
        gameType: gameType || null,
        boardSize: finalBoardSize,
        gameRules: gameRules || null,
        player1Id,
        player2Id: player2Id || null,
        aiType: aiType || null,
        aiLevel: aiLevel || null,
        status: 'WAITING',
        moves: [],
        boardState: initialBoardState as any,
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
      gameType: game.gameType || null,
      boardSize: game.boardSize || DEFAULT_BOARD_SIZE,
      player1Id: game.player1Id,
      player2Id: game.player2Id || null,
      aiType: game.aiType || null,
      aiLevel: (game as any).aiLevel || null,
      status: game.status as GameStatus,
      boardState: initialBoardState,
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

  async startGame(gameId: string, onGameEnd?: (game: GameState) => void): Promise<GameState | null> {
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

    // Update user status to PLAYING
    await prisma.user.updateMany({
      where: {
        OR: [
          { id: game.player1Id },
          ...(game.player2Id ? [{ id: game.player2Id }] : []),
        ],
      },
      data: { status: 'PLAYING' },
    });

    // Start timer with callback
    this.startTimer(gameId, onGameEnd);

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

    // 게임 규칙에 따른 수 검증
    const ruleValidation = validateMoveWithRule(
      game.boardState,
      player,
      x,
      y,
      game.gameType
    );
    if (!ruleValidation.valid) {
      return { success: false, error: ruleValidation.error || 'Invalid move' };
    }

    const result = makeMove(game.boardState, player, x, y);
    if (!result.success) {
      return result;
    }

    // 게임 규칙에 따른 수 후 처리
    const ruleEffects = applyRuleAfterMove(
      game.boardState,
      player,
      x,
      y,
      result.captured || 0,
      game.gameType
    );

    // 규칙에 따른 승리 확인 (예: 오목 5개 연속)
    if (ruleEffects.effects?.win) {
      game.status = 'FINISHED';
      game.finishedAt = new Date();
      game.winnerId = ruleEffects.effects.winner === 1 ? game.player1Id : game.player2Id;
      game.result = ruleEffects.effects.winner === 1 ? 'PLAYER1_WIN' : 'PLAYER2_WIN';
      
      await prisma.game.update({
        where: { id: gameId },
        data: {
          status: 'FINISHED',
          finishedAt: game.finishedAt,
          winnerId: game.winnerId,
          result: game.result,
        },
      });

      // 사용자 상태 업데이트
      await prisma.user.updateMany({
        where: {
          OR: [
            { id: game.player1Id },
            ...(game.player2Id ? [{ id: game.player2Id }] : []),
          ],
        },
        data: { status: 'WAITING' },
      });

      // 레이팅 업데이트
      if (game.player2Id && !game.aiType) {
        const { updateRatingsAfterGame } = await import('@/lib/rating/ratingManager');
        await updateRatingsAfterGame(gameId, game.result).catch(console.error);
      }

      return { success: true, game };
    }

    // 게임 종료 조건 확인
    const gameEndCheck = checkGameEndWithRule(game.boardState, game.gameType);
    if (gameEndCheck.ended && gameEndCheck.winner) {
      game.status = 'FINISHED';
      game.finishedAt = new Date();
      game.winnerId = gameEndCheck.winner === 1 ? game.player1Id : game.player2Id;
      game.result = gameEndCheck.winner === 1 ? 'PLAYER1_WIN' : 'PLAYER2_WIN';

      await prisma.game.update({
        where: { id: gameId },
        data: {
          status: 'FINISHED',
          finishedAt: game.finishedAt,
          winnerId: game.winnerId,
          result: game.result,
        },
      });

      // 사용자 상태 업데이트
      await prisma.user.updateMany({
        where: {
          OR: [
            { id: game.player1Id },
            ...(game.player2Id ? [{ id: game.player2Id }] : []),
          ],
        },
        data: { status: 'WAITING' },
      });

      // 레이팅 업데이트
      if (game.player2Id && !game.aiType) {
        const { updateRatingsAfterGame } = await import('@/lib/rating/ratingManager');
        await updateRatingsAfterGame(gameId, game.result).catch(console.error);
      }

      return { success: true, game };
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
        moves: game.boardState.moveHistory as any,
        boardState: game.boardState as any,
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
        moves: game.boardState.moveHistory as any,
        currentPlayer: game.currentPlayer,
      },
    });

    return { success: true, game };
  }

  private startTimer(gameId: string, onGameEnd?: (game: GameState) => void): void {
    const game = this.games.get(gameId);
    if (!game) return;

    const timer = setInterval(async () => {
      const currentGame = this.games.get(gameId);
      if (!currentGame || currentGame.status !== 'IN_PROGRESS') {
        this.stopTimer(gameId);
        return;
      }

      if (currentGame.currentPlayer === 1) {
        currentGame.player1Time--;
        if (currentGame.player1Time <= 0) {
          const endedGame = await this.endGame(gameId, 'TIMEOUT', currentGame.player2Id || null);
          if (endedGame && onGameEnd) {
            onGameEnd(endedGame);
          }
        }
      } else if (currentGame.player2Time !== null) {
        currentGame.player2Time--;
        if (currentGame.player2Time <= 0) {
          const endedGame = await this.endGame(gameId, 'TIMEOUT', currentGame.player1Id);
          if (endedGame && onGameEnd) {
            onGameEnd(endedGame);
          }
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

    // Update user status to WAITING after game ends
    await prisma.user.updateMany({
      where: {
        OR: [
          { id: game.player1Id },
          ...(game.player2Id ? [{ id: game.player2Id }] : []),
        ],
      },
      data: { status: 'WAITING' },
    });

    // Update ratings if both players are human
    if (game.player2Id && !game.aiType) {
      const { updateRatingsAfterGame } = await import('@/lib/rating/ratingManager');
      await updateRatingsAfterGame(gameId, result).catch(console.error);

      // 골드 보상 지급
      const { awardGoldAfterGame } = await import('@/lib/gold/rewards');
      await awardGoldAfterGame(gameId, result, game.player1Id, game.player2Id).catch(
        console.error
      );
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

    const boardSize = dbGame.boardSize || DEFAULT_BOARD_SIZE;
    const boardState = (dbGame.boardState as any) || createEmptyBoard(boardSize);
    
    // boardState에 boardSize가 없으면 추가
    if (!boardState.boardSize) {
      boardState.boardSize = boardSize;
    }

    const gameState: GameState = {
      id: dbGame.id,
      mode: dbGame.mode as GameMode,
      season: dbGame.season,
      gameType: dbGame.gameType || null,
      boardSize: boardSize,
      player1Id: dbGame.player1Id,
      player2Id: dbGame.player2Id || null,
      aiType: dbGame.aiType || null,
      aiLevel: (dbGame as any).aiLevel || null,
      status: dbGame.status as GameStatus,
      boardState: boardState,
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
      // loadGame에서는 콜백 없이 타이머 시작 (Socket.io에서 별도 처리)
      this.startTimer(gameId);
    }

    return gameState;
  }
}

// Singleton instance
export const gameManager = new GameManager();

