const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const ticketService = require('../services/ticketService');

// 이용권 개수 조회
router.get('/tickets', requireAuth, async (req, res) => {
    try {
        const tickets = await ticketService.getTickets(req.session.userId);
        res.json({ success: true, tickets });
    } catch (error) {
        console.error('Get tickets error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 이용권 소모
router.post('/consume', requireAuth, async (req, res) => {
    try {
        const { ticketType } = req.body; // 'strategy' 또는 'casual'
        
        if (!ticketType || !['strategy', 'casual'].includes(ticketType)) {
            return res.status(400).json({ success: false, error: 'Invalid ticket type' });
        }

        const success = await ticketService.consumeTicket(req.session.userId, ticketType);
        
        if (!success) {
            return res.status(400).json({ success: false, error: 'Not enough tickets' });
        }

        const tickets = await ticketService.getTickets(req.session.userId);
        res.json({ success: true, tickets });
    } catch (error) {
        console.error('Consume ticket error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 다음 회복까지 남은 시간 조회
router.get('/recovery-time', requireAuth, async (req, res) => {
    try {
        const { ticketType } = req.query; // 'strategy' 또는 'casual'
        const type = ticketType || 'strategy';
        const timeRemaining = await ticketService.getTimeUntilNextRecovery(req.session.userId, type);
        res.json({ success: true, timeRemaining });
    } catch (error) {
        console.error('Get recovery time error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

