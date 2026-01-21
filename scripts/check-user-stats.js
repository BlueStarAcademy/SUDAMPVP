const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUserStats() {
    try {
        // 노란별과 푸른별 사용자 찾기
        const users = await prisma.user.findMany({
            where: {
                nickname: {
                    in: ['노란별', '푸른별']
                }
            },
            select: {
                id: true,
                nickname: true,
                email: true,
                wins: true,
                losses: true,
                draws: true,
                rating: true
            }
        });

        console.log('\n=== 사용자 현재 승패 기록 ===\n');
        for (const user of users) {
            console.log(`${user.nickname} (${user.email}):`);
            console.log(`  현재 DB 기록: ${user.wins || 0}승 ${user.losses || 0}패 ${user.draws || 0}무`);
            console.log(`  레이팅: ${user.rating || 1500}`);
            console.log(`  사용자 ID: ${user.id}`);
            console.log('');
        }

        // 각 사용자의 실제 게임 결과 확인
        console.log('\n=== 실제 게임 결과로 재계산 ===\n');
        for (const user of users) {
            // AI 게임 제외, 결과가 있는 게임만
            const games = await prisma.game.findMany({
                where: {
                    OR: [
                        { blackId: user.id },
                        { whiteId: user.id }
                    ],
                    result: { not: null },
                    isAiGame: false
                },
                select: {
                    id: true,
                    blackId: true,
                    whiteId: true,
                    result: true,
                    mode: true,
                    createdAt: true
                },
                orderBy: {
                    createdAt: 'asc'
                }
            });

            let actualWins = 0;
            let actualLosses = 0;
            let actualDraws = 0;

            for (const game of games) {
                if (game.result === 'draw') {
                    actualDraws++;
                } else if (game.blackId === user.id) {
                    if (game.result === 'black_win') {
                        actualWins++;
                    } else if (game.result === 'white_win') {
                        actualLosses++;
                    }
                } else if (game.whiteId === user.id) {
                    if (game.result === 'white_win') {
                        actualWins++;
                    } else if (game.result === 'black_win') {
                        actualLosses++;
                    }
                }
            }

            console.log(`${user.nickname}:`);
            console.log(`  총 게임 수: ${games.length}`);
            console.log(`  실제 승: ${actualWins}`);
            console.log(`  실제 패: ${actualLosses}`);
            console.log(`  실제 무: ${actualDraws}`);
            console.log(`  현재 DB: ${user.wins || 0}승 ${user.losses || 0}패 ${user.draws || 0}무`);
            console.log(`  차이: 승 ${(user.wins || 0) - actualWins}, 패 ${(user.losses || 0) - actualLosses}, 무 ${(user.draws || 0) - actualDraws}`);
            console.log('');

            // 잘못된 기록이 있으면 수정
            if ((user.wins || 0) !== actualWins || (user.losses || 0) !== actualLosses || (user.draws || 0) !== actualDraws) {
                console.log(`  ⚠️  잘못된 기록 발견! 수정 중...`);
                await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        wins: actualWins,
                        losses: actualLosses,
                        draws: actualDraws
                    }
                });
                console.log(`  ✅ 수정 완료: ${actualWins}승 ${actualLosses}패 ${actualDraws}무`);
            } else {
                console.log(`  ✅ 기록이 정확합니다.`);
            }
            console.log('');
        }

        // 최근 게임 몇 개 확인
        console.log('\n=== 최근 게임 10개 확인 ===\n');
        for (const user of users) {
            const recentGames = await prisma.game.findMany({
                where: {
                    OR: [
                        { blackId: user.id },
                        { whiteId: user.id }
                    ],
                    result: { not: null },
                    isAiGame: false
                },
                select: {
                    id: true,
                    blackId: true,
                    whiteId: true,
                    result: true,
                    mode: true,
                    createdAt: true
                },
                orderBy: {
                    createdAt: 'desc'
                },
                take: 10
            });

            console.log(`${user.nickname}의 최근 게임:`);
            for (const game of recentGames) {
                const isBlack = game.blackId === user.id;
                const isWhite = game.whiteId === user.id;
                let result = '';
                if (game.result === 'draw') {
                    result = '무승부';
                } else if (isBlack && game.result === 'black_win') {
                    result = '승';
                } else if (isBlack && game.result === 'white_win') {
                    result = '패';
                } else if (isWhite && game.result === 'white_win') {
                    result = '승';
                } else if (isWhite && game.result === 'black_win') {
                    result = '패';
                }
                console.log(`  게임 ID: ${game.id}, 모드: ${game.mode}, 결과: ${result}, 시간: ${game.createdAt}`);
            }
            console.log('');
        }

    } catch (error) {
        console.error('오류 발생:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkUserStats();

