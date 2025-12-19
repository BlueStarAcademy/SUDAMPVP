const express = require('express');
const router = express.Router();
const userService = require('../services/userService');

// Get top rankings
router.get('/top', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const rankings = await userService.getTopRankings(limit);
        res.json({ rankings });
    } catch (error) {
        console.error('Get rankings error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;

