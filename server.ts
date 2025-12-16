import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { initializeSocket } from './server/socket/index';
import { execSync } from 'child_process';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0'; // Railway는 0.0.0.0 사용
const port = parseInt(process.env.PORT || '3000', 10);

// 프로덕션 환경에서 데이터베이스 마이그레이션 실행
if (process.env.NODE_ENV === 'production' && !process.env.MIGRATIONS_RUN) {
  try {
    console.log('Running database migrations...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    execSync('npx prisma generate', { stdio: 'inherit' });
    process.env.MIGRATIONS_RUN = 'true';
    console.log('Database migrations completed');
  } catch (error) {
    console.error('Migration failed:', error);
    // 마이그레이션 실패해도 서버는 시작 (이미 마이그레이션된 경우)
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

