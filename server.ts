import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { initializeSocket } from './server/socket/index';
import { execSync } from 'child_process';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0'; // Railway는 0.0.0.0 사용
const port = parseInt(process.env.PORT || '3000', 10);

// 프로덕션 환경에서 데이터베이스 스키마 동기화
// 마이그레이션 기록과 관계없이 항상 db push로 강제 동기화
if (process.env.NODE_ENV === 'production' && !process.env.MIGRATIONS_RUN) {
  try {
    console.log('=== Setting up database schema ===');
    
    // Prisma Client 생성
    console.log('Step 1: Generating Prisma Client...');
    try {
      execSync('npx prisma generate', { stdio: 'inherit', timeout: 30000 });
      console.log('✅ Prisma Client generated');
    } catch (genError: any) {
      console.log('⚠️ Prisma generate warning:', genError.message);
      // 계속 진행
    }
    
    // db push로 스키마 강제 적용 (마이그레이션 기록 무시)
    console.log('Step 2: Pushing database schema (this will create all tables)...');
    try {
      const output = execSync('npx prisma db push --accept-data-loss --skip-generate', { 
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: 120000 
      });
      console.log('✅ Database schema pushed successfully');
      console.log('Output:', output);
    } catch (pushError: any) {
      console.error('❌ Database push failed!');
      console.error('Error message:', pushError.message);
      if (pushError.stdout) {
        console.error('Stdout:', pushError.stdout);
      }
      if (pushError.stderr) {
        console.error('Stderr:', pushError.stderr);
      }
      // 실패해도 서버는 시작 (수동 설정 필요)
      throw pushError;
    }
    
    process.env.MIGRATIONS_RUN = 'true';
    console.log('=== Database setup completed ===');
  } catch (error: any) {
    console.error('=== Database setup failed ===');
    console.error('Error:', error.message);
    console.log('Continuing server startup - database may need manual setup');
    // 데이터베이스 설정 실패해도 서버는 시작 (수동 설정 필요)
  }
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Initialize Socket.io
  const io = initializeSocket(httpServer);

  httpServer
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      console.log(`> Socket.io server initialized`);
    });
});

