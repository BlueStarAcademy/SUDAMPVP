const bcrypt = require('bcrypt');
const prisma = require('../config/database');

async function createTestUsers() {
  try {
    console.log('테스트 사용자 생성 시작...');

    const testUsers = [
      {
        email: 'blue@test.com',
        nickname: '푸른별',
        password: '1217'
      },
      {
        email: 'yellow@test.com',
        nickname: '노란별',
        password: '1217'
      }
    ];

    for (const userData of testUsers) {
      try {
        // 기존 사용자 확인
        const existingEmail = await prisma.user.findUnique({
          where: { email: userData.email }
        });
        
        const existingNickname = await prisma.user.findUnique({
          where: { nickname: userData.nickname }
        });

        if (existingEmail || existingNickname) {
          console.log(`⚠️  ${userData.nickname} (${userData.email}) - 이미 존재하는 사용자입니다. 건너뜁니다.`);
          continue;
        }

        // 비밀번호 해시
        const hashedPassword = await bcrypt.hash(userData.password, 10);

        // 사용자 생성
        const user = await prisma.user.create({
          data: {
            email: userData.email,
            nickname: userData.nickname,
            password: hashedPassword,
            rating: 1500,
            mannerScore: 1500,
            strategyTickets: 10,
            casualTickets: 10,
            strategyTicketMax: 10,
            casualTicketMax: 10,
            avatar: 1,
            gem: 1000, // 테스트용 젬 제공
            gold: 1000,
          },
        });

        // 랭킹 생성
        await prisma.ranking.create({
          data: {
            userId: user.id,
            rating: 1500,
          },
        });

        console.log(`✅ ${userData.nickname} (${userData.email}) - 생성 완료`);
        console.log(`   비밀번호: ${userData.password}`);
      } catch (error) {
        console.error(`❌ ${userData.nickname} (${userData.email}) - 생성 실패:`, error.message);
      }
    }

    console.log('\n테스트 사용자 생성 완료!');
    console.log('\n로그인 정보:');
    console.log('1. 이메일: blue@test.com, 닉네임: 푸른별, 비밀번호: 1217');
    console.log('2. 이메일: yellow@test.com, 닉네임: 노란별, 비밀번호: 1217');
  } catch (error) {
    console.error('오류 발생:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUsers();

