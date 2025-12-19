const { getRedisClient, getPubClient, getSubClient } = require('../config/redis');
const userService = require('../services/userService');

class WaitingRoomSocket {
    constructor(io) {
        this.io = io;
        this.onlineUsers = new Map(); // userId -> socketId
        this.setupRedisPubSub().catch(console.error);
    }

    async setupRedisPubSub() {
        const subClient = getSubClient();
        
        // Subscribe to user events
        await subClient.subscribe('user:joined');
        await subClient.subscribe('user:left');
        await subClient.subscribe('user:status_changed');
        
        // Handle messages
        subClient.on('message', (channel, message) => {
            const data = JSON.parse(message);
            
            if (channel === 'user:joined') {
                this.broadcastUserJoined(data);
            } else if (channel === 'user:left') {
                this.broadcastUserLeft(data);
            } else if (channel === 'user:status_changed') {
                this.broadcastUserStatusChanged(data);
            }
        });
    }

    handleConnection(socket, userId) {
        // Add user to online list
        this.onlineUsers.set(userId, socket.id);
        
        // Update user status in Redis
        this.updateUserStatus(userId, 'waiting');

        // Broadcast user joined
        this.publishUserJoined(userId);

        // Send current user list
        socket.on('get_user_list', async () => {
            const users = await this.getOnlineUsers();
            socket.emit('user_list_update', users);
        });

        // Handle matching
        socket.on('start_matching', async () => {
            await this.startMatching(userId, socket);
        });

        socket.on('cancel_matching', async () => {
            await this.cancelMatching(userId);
        });

        // Handle AI game
        socket.on('start_ai_game', async (data) => {
            await this.startAiGame(userId, socket, data.level);
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            this.handleDisconnect(userId);
        });
    }

    async getOnlineUsers() {
        const redis = getRedisClient();
        const userIds = Array.from(this.onlineUsers.keys());
        
        const users = await Promise.all(
            userIds.map(async (userId) => {
                const status = await redis.get(`user:status:${userId}`) || 'waiting';
                const profile = await userService.getUserProfile(userId);
                if (!profile) return null;
                
                return {
                    id: profile.id,
                    nickname: profile.nickname,
                    rating: profile.rating,
                    status: status
                };
            })
        );

        return users.filter(u => u !== null);
    }

    async updateUserStatus(userId, status) {
        const redis = getRedisClient();
        await redis.setEx(`user:status:${userId}`, 3600, status); // 1 hour TTL
    }

    publishUserJoined(userId) {
        const pubClient = getPubClient();
        pubClient.publish('user:joined', JSON.stringify({ userId, timestamp: Date.now() }));
    }

    publishUserLeft(userId) {
        const pubClient = getPubClient();
        pubClient.publish('user:left', JSON.stringify({ userId, timestamp: Date.now() }));
    }

    publishUserStatusChanged(userId, status) {
        const pubClient = getPubClient();
        pubClient.publish('user:status_changed', JSON.stringify({ userId, status, timestamp: Date.now() }));
    }

    broadcastUserJoined(data) {
        this.io.emit('user_joined', data);
        // Update all clients with new user list
        this.broadcastUserListUpdate();
    }

    broadcastUserLeft(data) {
        this.io.emit('user_left', data);
        this.broadcastUserListUpdate();
    }

    broadcastUserStatusChanged(data) {
        this.io.emit('user_status_changed', data);
        this.broadcastUserListUpdate();
    }

    async broadcastUserListUpdate() {
        const users = await this.getOnlineUsers();
        this.io.emit('user_list_update', users);
    }

    async startMatching(userId, socket) {
        const rankingService = require('../services/rankingService');
        await this.updateUserStatus(userId, 'matching');
        this.publishUserStatusChanged(userId, 'matching');
        
        // Add to matching queue
        await rankingService.addToMatchingQueue(userId);
    }

    async cancelMatching(userId) {
        const rankingService = require('../services/rankingService');
        await this.updateUserStatus(userId, 'waiting');
        this.publishUserStatusChanged(userId, 'waiting');
        
        // Remove from matching queue
        await rankingService.removeFromMatchingQueue(userId);
    }

    async startAiGame(userId, socket, level) {
        try {
            const gameService = require('../services/gameService');
            const game = await gameService.createAiGame(userId, level);
            
            await this.updateUserStatus(userId, 'in-game');
            this.publishUserStatusChanged(userId, 'in-game');
            
            socket.emit('ai_game_started', { gameId: game.id });
        } catch (error) {
            console.error('Start AI game error:', error);
            socket.emit('ai_game_error', { error: error.message });
        }
    }

    handleDisconnect(userId) {
        this.onlineUsers.delete(userId);
        this.publishUserLeft(userId);
        
        // Remove from matching queue if in queue
        const rankingService = require('../services/rankingService');
        rankingService.removeFromMatchingQueue(userId);
    }
}

module.exports = WaitingRoomSocket;

