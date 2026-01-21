const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const gameService = require('../services/gameService');

// Create and start AI game (deprecated - use socket event instead)
router.get('/ai', requireAuth, async (req, res) => {
    try {
        const { level, color, boardSize, mode, timeLimit, timeIncrement, byoyomiSeconds, byoyomiPeriods } = req.query;
        const userId = req.session.userId;

        if (!userId) {
            return res.status(401).redirect('/login');
        }

        const gameOptions = {
            mode: mode || 'CLASSIC',
            boardSize: parseInt(boardSize) || 19,
            komi: 6.5,
            timeLimit: timeLimit ? parseInt(timeLimit) : undefined,
            timeIncrement: timeIncrement ? parseInt(timeIncrement) : undefined,
            byoyomiSeconds: byoyomiSeconds ? parseInt(byoyomiSeconds) : undefined,
            byoyomiPeriods: byoyomiPeriods ? parseInt(byoyomiPeriods) : undefined
        };

        // 베이스바둑은 덤 0.5집 고정
        if (mode === 'BASE') {
            gameOptions.komi = 0.5;
        }

        const aiLevel = parseInt(level) || 3;
        const userColor = color || 'black';

        const game = await gameService.createAiGame(userId, aiLevel, userColor, gameOptions);

        // Update user status via waitingRoomSocket
        if (global.waitingRoomSocket) {
            await global.waitingRoomSocket.setUserInGame(userId);
        }

        // Redirect to game page
        res.redirect(`/api/game/${game.id}`);
    } catch (error) {
        console.error('Create AI game error:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            query: req.query,
            userId: req.session?.userId
        });
        res.status(500).send('AI 게임 생성 중 오류가 발생했습니다.');
    }
});

// Get game page
router.get('/:gameId', requireAuth, async (req, res) => {
    try {
        const { gameId } = req.params;
        
        if (!gameId) {
            console.error('[Routes] gameId is missing from params:', req.params);
            return res.status(400).send('Game ID is required');
        }
        
        const game = await gameService.getGame(gameId);

        if (!game) {
            return res.status(404).send('Game not found');
        }

        // Handle both Prisma object and JSON object from cache
        const gameBlackId = game.blackId || game.blackPlayer?.id || null;
        const gameWhiteId = game.whiteId || game.whitePlayer?.id || null;
        
        // Check if user is part of this game (player) or can spectate
        const isPlayer = gameBlackId === req.session.userId || gameWhiteId === req.session.userId;
        const isAiGame = game.isAiGame || gameWhiteId === null || gameBlackId === null;
        const aiLevel = game.aiLevel || null;
        
        // AI 게임은 플레이어만 접근 가능 (관전 불가)
        if (isAiGame && !isPlayer) {
            return res.status(403).send('AI 게임은 관전할 수 없습니다.');
        }
        
        // Allow access if player, or if game allows spectators (non-AI games)
        if (!isPlayer && !isAiGame) {
            // For now, allow spectating - you can restrict this later
            // return res.status(403).send('Access denied');
        }

        // Update user status via waitingRoomSocket
        if (global.waitingRoomSocket) {
            if (isPlayer) {
                // Player - set to in-game
                await global.waitingRoomSocket.setUserInGame(req.session.userId);
            } else {
                // Spectator - set to spectating
                await global.waitingRoomSocket.setUserSpectating(req.session.userId);
            }
        }

        const userService = require('../services/userService');
        const user = await userService.getUserProfile(req.session.userId);
        
        if (!user) {
            console.error('User profile not found for userId:', req.session.userId);
            return res.status(404).send('User not found');
        }
        
        // Get player information
        let blackPlayer = null;
        let whitePlayer = null;
        
        // Use the already extracted IDs
        const blackId = gameBlackId;
        const whiteId = gameWhiteId;
        
        if (blackId !== null) {
            try {
                const blackProfile = await userService.getUserProfile(blackId);
                if (blackProfile) {
                    blackPlayer = {
                        ...blackProfile,
                        avatar: blackProfile.avatar || 1
                    };
                } else {
                    blackPlayer = { 
                        id: blackId,
                        nickname: 'Unknown', 
                        rating: game.blackRating || 1500,
                        mannerScore: 1500,
                        avatar: 1
                    };
                }
            } catch (error) {
                console.error('Error getting black player profile:', error);
                blackPlayer = { 
                    id: blackId,
                    nickname: 'Unknown', 
                    rating: game.blackRating || 1500,
                    mannerScore: 1500,
                    avatar: 1
                };
            }
        } else {
            blackPlayer = { 
                id: null,
                nickname: `AI (${aiLevel || 1}단계)`, 
                rating: game.blackRating || 1500,
                mannerScore: 1500,
                avatar: 1
            };
        }
        
        if (whiteId !== null) {
            try {
                const whiteProfile = await userService.getUserProfile(whiteId);
                if (whiteProfile) {
                    whitePlayer = {
                        ...whiteProfile,
                        avatar: whiteProfile.avatar || 1
                    };
                } else {
                    whitePlayer = { 
                        id: whiteId,
                        nickname: 'Unknown', 
                        rating: game.whiteRating || 1500,
                        mannerScore: 1500,
                        avatar: 1
                    };
                }
            } catch (error) {
                console.error('Error getting white player profile:', error);
                whitePlayer = { 
                    id: whiteId,
                    nickname: 'Unknown', 
                    rating: game.whiteRating || 1500,
                    mannerScore: 1500,
                    avatar: 1
                };
            }
        } else {
            whitePlayer = { 
                id: null,
                nickname: `AI (${aiLevel || 1}단계)`, 
                rating: game.whiteRating || 1500,
                mannerScore: 1500,
                avatar: 1
            };
        }

        // Get initial game state to pass boardSize to template
        let initialBoardSize = 19;
        try {
            const gameState = await gameService.getGameState(gameId);
            if (gameState && gameState.boardSize) {
                initialBoardSize = parseInt(gameState.boardSize);
            } else {
                // Fallback to memory cache
                const memorySettings = gameService.gameSettingsCache?.get(gameId);
                if (memorySettings && memorySettings.boardSize) {
                    initialBoardSize = parseInt(memorySettings.boardSize);
                }
            }
        } catch (error) {
            console.error('Error getting initial game state for boardSize:', error);
        }

        res.render('gameRoom', {
            gameId,
            user,
            game,
            blackPlayer,
            whitePlayer,
            initialBoardSize, // Pass boardSize to template
        });
    } catch (error) {
        console.error('Get game error:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            gameId: req.params.gameId,
            userId: req.session?.userId
        });
        res.status(500).send('Internal server error');
    }
});

module.exports = router;

