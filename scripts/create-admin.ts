/**
 * 관리자 계정 생성 스크립트
 * 사용법: npx tsx scripts/create-admin.ts
 */

import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/auth';

const prisma = new PrismaClient();

async function createAdmin() {
  const email = process.env.ADMIN_EMAIL || 'admin@sudam.com';
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123456';

  try {
    // 기존 관리자 확인
    const existingAdmin = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username },
          { role: 'ADMIN' },
        ],
      },
    });

    if (existingAdmin) {
      console.log('관리자 계정이 이미 존재합니다:');
      console.log(`- Email: ${existingAdmin.email}`);
      console.log(`- Username: ${existingAdmin.username}`);
      console.log(`- Role: ${existingAdmin.role}`);
      return;
    }

    // 관리자 계정 생성
    const passwordHash = await hashPassword(password);
    const admin = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        role: 'ADMIN',
      },
    });

    console.log('✅ 관리자 계정이 생성되었습니다!');
    console.log(`- ID: ${admin.id}`);
    console.log(`- Email: ${admin.email}`);
    console.log(`- Username: ${admin.username}`);
    console.log(`- Role: ${admin.role}`);
    console.log(`- Password: ${password}`);
    console.log('\n⚠️  비밀번호를 안전한 곳에 저장하세요!');
  } catch (error) {
    console.error('❌ 관리자 계정 생성 실패:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();

