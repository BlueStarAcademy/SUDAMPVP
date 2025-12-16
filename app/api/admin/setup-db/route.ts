import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

/**
 * 데이터베이스 스키마 설정 API
 * 보안: 환경 변수 DB_SETUP_KEY로 보호
 * 사용법: POST /api/admin/setup-db?key=YOUR_SECRET_KEY
 */
export async function POST(request: NextRequest) {
  try {
    // 보안: 환경 변수로 키 확인
    const expectedKey = process.env.DB_SETUP_KEY || 'default-setup-key-change-in-production';
    const url = new URL(request.url);
    const providedKey = url.searchParams.get('key');

    if (providedKey !== expectedKey) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid setup key' },
        { status: 401 }
      );
    }

    const results: string[] = [];
    
    try {
      // 1. Prisma Client 생성
      results.push('Generating Prisma Client...');
      execSync('npx prisma generate', { 
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: 30000 
      });
      results.push('✅ Prisma Client generated');
    } catch (error: any) {
      results.push(`⚠️ Prisma generate: ${error.message}`);
    }

    try {
      // 2. 데이터베이스 스키마 적용
      results.push('Pushing database schema...');
      const output = execSync('npx prisma db push --accept-data-loss', { 
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: 60000 
      });
      results.push('✅ Database schema pushed');
      results.push(output);
    } catch (error: any) {
      results.push(`❌ Database push failed: ${error.message}`);
      // 에러 출력도 포함
      if (error.stdout) results.push(`Output: ${error.stdout}`);
      if (error.stderr) results.push(`Error: ${error.stderr}`);
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: 'Database setup completed',
      results: results.join('\n'),
    });
  } catch (error: any) {
    console.error('Database setup error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Database setup failed',
        results: error.results || [],
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Use POST method with ?key=YOUR_SECRET_KEY',
    hint: 'Set DB_SETUP_KEY environment variable in Railway',
  });
}

