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

        // Check if user is part of this game
        if (game.blackId !== req.session.userId && game.whiteId !== req.session.userId && game.whiteId !== 'ai') {
            return res.status(403).send('Access denied');
        }

        const userService = require('../services/userService');
        const user = await userService.getUserProfile(req.session.userId);
        
        // Get player information
        let blackPlayer = null;
        let whitePlayer = null;
        
        if (game.blackId !== 'ai') {
            blackPlayer = await userService.getUserProfile(game.blackId);
        } else {
            blackPlayer = { nickname: 'AI', rating: game.blackRating };
        }
        
        if (game.whiteId !== 'ai') {
            whitePlayer = await userService.getUserProfile(game.whiteId);
        } else {
            whitePlayer = { nickname: `AI (${game.aiLevel}단)`, rating: game.whiteRating };
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

