const prisma = require('../config/database');

class TicketService {
    // 이용권 회복 시간 (밀리초) - 30분
    static TICKET_RECOVERY_INTERVAL = 30 * 60 * 1000; // 30분
    static MAX_TICKETS = 10;

    /**
     * 이용권 회복 처리
     * @param {string} userId 
     * @returns {Promise<{strategyTickets: number, casualTickets: number, recovered: boolean}>}
     */
    async recoverTickets(userId) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new Error('User not found');
        }

        const now = new Date();
        let recovered = false;
        let strategyTickets = user.strategyTickets || 0;
        let casualTickets = user.casualTickets || 0;
        let lastRecovery = user.lastTicketRecovery || user.createdAt;

        // 마지막 회복 시간으로부터 경과한 시간 계산
        const elapsed = now.getTime() - new Date(lastRecovery).getTime();
        
        // 30분마다 1개씩 회복
        const recoveryCount = Math.floor(elapsed / TicketService.TICKET_RECOVERY_INTERVAL);

        // 사용자의 최대 이용권 개수 가져오기
        const strategyMax = user.strategyTicketMax || TicketService.MAX_TICKETS;
        const casualMax = user.casualTicketMax || TicketService.MAX_TICKETS;

        if (recoveryCount > 0) {
            // 전략바둑 이용권 회복
            if (strategyTickets < strategyMax) {
                strategyTickets = Math.min(
                    strategyMax,
                    strategyTickets + recoveryCount
                );
                recovered = true;
            }

            // 놀이바둑 이용권 회복
            if (casualTickets < casualMax) {
                casualTickets = Math.min(
                    casualMax,
                    casualTickets + recoveryCount
                );
                recovered = true;
            }

            // 데이터베이스 업데이트
            await prisma.user.update({
                where: { id: userId },
                data: {
                    strategyTickets,
                    casualTickets,
                    lastTicketRecovery: now
                }
            });
        }

        return {
            strategyTickets,
            casualTickets,
            recovered
        };
    }

    /**
     * 이용권 소모
     * @param {string} userId 
     * @param {string} ticketType - 'strategy' 또는 'casual'
     * @returns {Promise<boolean>} 성공 여부
     */
    async consumeTicket(userId, ticketType) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new Error('User not found');
        }

        // 먼저 회복 처리
        await this.recoverTickets(userId);
        
        // 최신 데이터 다시 가져오기
        const updatedUser = await prisma.user.findUnique({ where: { id: userId } });
        
        const currentTickets = ticketType === 'strategy' 
            ? updatedUser.strategyTickets 
            : updatedUser.casualTickets;

        if (currentTickets <= 0) {
            return false;
        }

        // 이용권 소모
        const updateData = ticketType === 'strategy'
            ? { strategyTickets: { decrement: 1 } }
            : { casualTickets: { decrement: 1 } };

        await prisma.user.update({
            where: { id: userId },
            data: {
                ...updateData,
                lastTicketRecovery: new Date() // 소모 시점을 회복 기준으로 설정
            }
        });

        return true;
    }

    /**
     * 이용권 개수 조회 (회복 처리 포함)
     * @param {string} userId 
     * @returns {Promise<{strategyTickets: number, casualTickets: number, strategyMax: number, casualMax: number}>}
     */
    async getTickets(userId) {
        const result = await this.recoverTickets(userId);
        const user = await prisma.user.findUnique({ where: { id: userId } });
        
        return {
            strategyTickets: user.strategyTickets || 0,
            casualTickets: user.casualTickets || 0,
            strategyMax: user.strategyTicketMax || TicketService.MAX_TICKETS,
            casualMax: user.casualTicketMax || TicketService.MAX_TICKETS
        };
    }

    /**
     * 다음 회복까지 남은 시간 계산
     * @param {string} userId 
     * @param {string} ticketType - 'strategy' 또는 'casual'
     * @returns {Promise<number>} 남은 시간 (밀리초)
     */
    async getTimeUntilNextRecovery(userId, ticketType = 'strategy') {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return 0;
        }

        // 먼저 회복 처리
        await this.recoverTickets(userId);
        
        // 최신 데이터 다시 가져오기
        const updatedUser = await prisma.user.findUnique({ where: { id: userId } });
        
        const currentTickets = ticketType === 'strategy' 
            ? updatedUser.strategyTickets 
            : updatedUser.casualTickets;
        const maxTickets = ticketType === 'strategy'
            ? updatedUser.strategyTicketMax
            : updatedUser.casualTicketMax;

        // 이미 최대치면 0 반환
        if (currentTickets >= maxTickets) {
            return 0;
        }

        const now = new Date();
        const lastRecovery = updatedUser.lastTicketRecovery || updatedUser.createdAt;
        const elapsed = now.getTime() - new Date(lastRecovery).getTime();
        const remaining = TicketService.TICKET_RECOVERY_INTERVAL - (elapsed % TicketService.TICKET_RECOVERY_INTERVAL);

        return remaining;
    }
}

module.exports = new TicketService();

