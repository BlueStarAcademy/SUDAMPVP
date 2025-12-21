const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const gameService = require('../services/gameService');

// Get game page
router.get('/:gameId', requireAuth, async (req, res) => {
    try {
        const { gameId } = req.params;
        const game = await gameService.getGame(gameId);

        if (!game) {
            return res.status(404).send('Game not found');
        }

        // Check if user is part of this game (player) or can spectate
        const isPlayer = game.blackId === req.session.userId || game.whiteId === req.session.userId;
        const isAiGame = game.isAiGame || game.whiteId === null || game.blackId === null;
        
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
        
        // Get player information
        let blackPlayer = null;
        let whitePlayer = null;
        
        if (game.blackId !== null) {
            blackPlayer = await userService.getUserProfile(game.blackId);
        } else {
            blackPlayer = { nickname: `AI (${game.aiLevel || 1}단)`, rating: game.blackRating };
        }
        
        if (game.whiteId !== null) {
            whitePlayer = await userService.getUserProfile(game.whiteId);
        } else {
            whitePlayer = { nickname: `AI (${game.aiLevel || 1}단)`, rating: game.whiteRating };
        }

        res.render('gameRoom', {
            gameId,
            user,
            game,
            blackPlayer,
            whitePlayer,
        });
    } catch (error) {
        console.error('Get game error:', error);
        res.status(500).send('Internal server error');
    }
});

module.exports = router;

