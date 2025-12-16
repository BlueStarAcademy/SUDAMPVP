import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { initializeSocket } from './server/socket/index';
import { execSync } from 'child_process';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0'; // Railway는 0.0.0.0 사용
const port = parseInt(process.env.PORT || '3000', 10);

// 프로덕션 환경에서 데이터베이스 스키마 동기화 및 마이그레이션 실행
if (process.env.NODE_ENV === 'production' && !process.env.MIGRATIONS_RUN) {
  try {
    console.log('Setting up database schema...');
    
    // 먼저 Prisma Client 생성
    execSync('npx prisma generate', { stdio: 'inherit' });
    
    // 마이그레이션 시도 (마이그레이션 파일이 있는 경우)
    try {
      console.log('Attempting to run migrations...');
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
      console.log('Database migrations completed');
    } catch (migrateError: any) {
      console.log('Migration failed, trying db push instead...');
      console.log('Error:', migrateError.message);
      
      // 마이그레이션이 실패하면 db push로 스키마 직접 적용
      // db push는 마이그레이션 파일 없이 스키마를 직접 데이터베이스에 적용
      execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
      console.log('Database schema pushed successfully');
    }
    
    process.env.MIGRATIONS_RUN = 'true';
    console.log('Database setup completed');
  } catch (error: any) {
    console.error('Database setup failed:', error.message);
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

