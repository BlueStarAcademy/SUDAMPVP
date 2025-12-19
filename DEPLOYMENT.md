# 배포 가이드

## 프로덕션 환경 설정

### 1. 환경 변수 설정

프로덕션 환경에 맞게 `.env` 파일을 설정하세요:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:password@host:5432/sudam
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
SESSION_SECRET=strong-random-secret-key
```

### 2. 데이터베이스 마이그레이션

프로덕션 데이터베이스에 마이그레이션 적용:

```bash
npx prisma migrate deploy
npx prisma generate
```

### 3. PM2를 사용한 배포

```bash
# PM2 설치
npm install -g pm2

# 애플리케이션 시작
pm2 start ecosystem.config.js --env production

# 로그 확인
pm2 logs sudam

# 상태 확인
pm2 status

# 재시작
pm2 restart sudam

# 중지
pm2 stop sudam
```

### 4. Nginx 리버스 프록시 설정

`/etc/nginx/sites-available/sudam`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 5. SSL 인증서 설정 (Let's Encrypt)

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 6. 방화벽 설정

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Docker 배포

### Docker Compose 사용

```bash
docker-compose -f docker-compose.yml up -d
```

### 로그 확인

```bash
docker-compose logs -f app
```

### 재시작

```bash
docker-compose restart app
```

## 모니터링

### PM2 모니터링

```bash
pm2 monit
```

### 로그 관리

PM2는 자동으로 로그를 관리합니다. 로그 파일은 `./logs/` 디렉토리에 저장됩니다.

### 성능 모니터링

- Redis 모니터링: `redis-cli monitor`
- PostgreSQL 모니터링: `pg_stat_activity` 뷰 확인
- Node.js 프로세스: `pm2 status`로 CPU/메모리 사용량 확인

## 백업

### 데이터베이스 백업

```bash
pg_dump -U user -d sudam > backup_$(date +%Y%m%d).sql
```

### Redis 백업

```bash
redis-cli SAVE
cp /var/lib/redis/dump.rdb /backup/redis_$(date +%Y%m%d).rdb
```

## 확장성

### 수평 확장

여러 서버 인스턴스를 실행하려면:

1. 로드 밸런서 설정 (Nginx 또는 HAProxy)
2. Redis Pub/Sub로 서버 간 동기화 (이미 구현됨)
3. 세션을 Redis에 저장 (이미 구현됨)

### 수직 확장

- PM2 클러스터 모드로 CPU 코어 활용 (이미 설정됨)
- `ecosystem.config.js`에서 `instances: 'max'` 설정 확인

## 문제 해결

### 메모리 부족

PM2가 자동으로 재시작하도록 설정되어 있습니다. 필요시 `max_memory_restart` 값을 조정하세요.

### 연결 오류

- 데이터베이스 연결 풀 크기 확인
- Redis 연결 확인
- 방화벽 설정 확인

### 성능 문제

- Redis 캐싱 활용 확인
- 데이터베이스 인덱스 확인
- PM2 클러스터 모드 확인

## 초기 설정

### 서버 준비

```bash
# Node.js 18+ 설치 확인
node --version

# Git 클론 (또는 코드 업로드)
git clone <repository-url>
cd SUDAM

# 의존성 설치
npm install

# Prisma 클라이언트 생성
npx prisma generate
```

### 환경 변수 파일 생성

`.env` 파일을 생성하고 필요한 환경 변수를 설정하세요:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:password@host:5432/sudam
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
SESSION_SECRET=your-strong-random-secret-key-here
```

## Docker 배포 상세 가이드

### Docker 이미지 빌드

```bash
# 이미지 빌드
docker build -t sudam:latest .

# 이미지 확인
docker images | grep sudam
```

### Docker Compose를 사용한 전체 스택 배포

```bash
# 백그라운드에서 실행
docker-compose up -d

# 특정 서비스만 시작
docker-compose up -d db redis
docker-compose up -d app

# 상태 확인
docker-compose ps

# 로그 확인
docker-compose logs -f app
docker-compose logs -f db
docker-compose logs -f redis
```

### Docker 컨테이너 관리

```bash
# 컨테이너 중지
docker-compose stop

# 컨테이너 시작
docker-compose start

# 컨테이너 재시작
docker-compose restart app

# 컨테이너 제거 (볼륨은 유지)
docker-compose down

# 컨테이너 및 볼륨 모두 제거
docker-compose down -v
```

### 프로덕션 환경 변수 설정

Docker Compose에서 환경 변수를 설정하려면 `.env` 파일을 사용하거나 `docker-compose.override.yml` 파일을 생성하세요:

```yaml
version: '3.8'

services:
  app:
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=${SESSION_SECRET}
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_HOST=redis
      - REDIS_PORT=6379
```

## 업데이트 및 업그레이드

### 애플리케이션 업데이트 절차

```bash
# 1. 코드 업데이트
git pull origin main

# 2. 의존성 업데이트
npm install

# 3. 데이터베이스 마이그레이션
npx prisma migrate deploy
npx prisma generate

# 4. PM2 재시작
pm2 restart sudam

# 또는 Docker 사용 시
docker-compose build app
docker-compose up -d app
```

### 무중단 배포 (Zero-Downtime)

PM2를 사용한 무중단 배포:

```bash
# 새 버전 배포
pm2 reload sudam

# 또는 점진적 재시작
pm2 gracefulReload sudam
```

Docker를 사용한 무중단 배포:

```bash
# 새 이미지 빌드
docker-compose build app

# 롤링 업데이트 (로드 밸런서와 함께 사용)
docker-compose up -d --no-deps app
```

## 롤백 절차

### PM2 롤백

```bash
# 이전 버전으로 코드 복원
git checkout <previous-commit-hash>

# 데이터베이스 롤백 (필요시)
npx prisma migrate resolve --rolled-back <migration-name>

# 애플리케이션 재시작
pm2 restart sudam
```

### Docker 롤백

```bash
# 이전 이미지 태그로 롤백
docker-compose up -d --no-deps app:previous-tag

# 또는 이전 버전으로 빌드
git checkout <previous-commit-hash>
docker-compose build app
docker-compose up -d app
```

## 헬스체크 및 상태 확인

### 애플리케이션 헬스체크

애플리케이션이 정상 작동하는지 확인:

```bash
# HTTP 헬스체크
curl http://localhost:3000/health

# PM2 상태 확인
pm2 status
pm2 info sudam

# Docker 컨테이너 상태
docker-compose ps
docker stats
```

### 데이터베이스 연결 확인

```bash
# PostgreSQL 연결 테스트
psql -h localhost -U user -d sudam -c "SELECT 1;"

# Prisma Studio로 데이터 확인
npx prisma studio
```

### Redis 연결 확인

```bash
# Redis 연결 테스트
redis-cli -h localhost -p 6379 ping

# Redis 정보 확인
redis-cli info
```

## CI/CD 파이프라인 예시

### GitHub Actions 예시

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.HOST }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /path/to/SUDAM
            git pull
            npm install
            npx prisma migrate deploy
            npx prisma generate
            pm2 restart sudam
```

## 보안 체크리스트

### 필수 보안 설정

- [ ] 강력한 `SESSION_SECRET` 사용
- [ ] 데이터베이스 비밀번호 강화
- [ ] Redis 비밀번호 설정
- [ ] HTTPS/SSL 인증서 설정
- [ ] 방화벽 규칙 설정
- [ ] 정기적인 보안 업데이트
- [ ] 로그 모니터링 설정
- [ ] 백업 자동화 설정

### 보안 모니터링

```bash
# 실패한 로그인 시도 확인
pm2 logs sudam | grep "login"

# 의심스러운 활동 모니터링
tail -f logs/err.log
```

## 자동화 스크립트

### 배포 스크립트 예시

`deploy.sh`:

```bash
#!/bin/bash

set -e

echo "Starting deployment..."

# 코드 업데이트
git pull origin main

# 의존성 설치
npm install

# 데이터베이스 마이그레이션
npx prisma migrate deploy
npx prisma generate

# 애플리케이션 재시작
pm2 restart sudam

echo "Deployment completed successfully!"
```

### 백업 스크립트 예시

`backup.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/backup/sudam"
DATE=$(date +%Y%m%d_%H%M%S)

# 데이터베이스 백업
pg_dump -U user -d sudam > "$BACKUP_DIR/db_$DATE.sql"

# Redis 백업
redis-cli SAVE
cp /var/lib/redis/dump.rdb "$BACKUP_DIR/redis_$DATE.rdb"

# 오래된 백업 삭제 (30일 이상)
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete
find $BACKUP_DIR -name "*.rdb" -mtime +30 -delete

echo "Backup completed: $DATE"
```

## 성능 튜닝

### 데이터베이스 최적화

```sql
-- 인덱스 확인
SELECT * FROM pg_indexes WHERE tablename = 'users';

-- 느린 쿼리 확인
SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;
```

### Redis 최적화

```bash
# 메모리 사용량 확인
redis-cli info memory

# 키 개수 확인
redis-cli dbsize

# 오래된 키 정리 (필요시)
redis-cli --scan --pattern "*" | xargs redis-cli del
```

### PM2 최적화

`ecosystem.config.js`에서 다음 설정을 조정할 수 있습니다:

- `instances`: CPU 코어 수에 맞게 조정
- `max_memory_restart`: 메모리 제한 설정
- `min_uptime`: 최소 실행 시간 설정
- `max_restarts`: 최대 재시작 횟수 설정

## 알림 및 모니터링

### PM2 모니터링 설정

```bash
# PM2 웹 대시보드 (선택사항)
pm2 web

# PM2 Plus (클라우드 모니터링)
pm2 link <secret-key> <public-key>
```

### 로그 집계

중앙화된 로그 관리 시스템 (예: ELK Stack, Loki)을 사용하여 로그를 집계하고 분석할 수 있습니다.

## 지원 및 문의

배포 중 문제가 발생하면:

1. 로그 파일 확인: `pm2 logs sudam`
2. 시스템 리소스 확인: `pm2 monit`
3. 데이터베이스 연결 확인
4. Redis 연결 확인
5. 네트워크 설정 확인

