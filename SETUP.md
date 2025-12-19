# SUDAM 설정 가이드

## 필수 요구사항

- Node.js 18 이상
- PostgreSQL 12 이상
- Redis 6 이상
- Gnugo (시스템에 설치 필요)
- Katago (시스템에 설치 필요, 선택사항)

## 설치 단계

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.example` 파일을 복사하여 `.env` 파일을 생성하고 필요한 값들을 설정하세요:

```bash
cp .env.example .env
```

`.env` 파일을 편집:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/sudam

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Session
SESSION_SECRET=your-secret-key-change-this-in-production

# AI Engines (paths)
GNUGO_PATH=gnugo
KATAGO_PATH=katago
KATAGO_MODEL=path/to/katago_model.bin.gz
KATAGO_CONFIG=path/to/katago_config.cfg
```

### 3. 데이터베이스 설정

PostgreSQL 데이터베이스를 생성하고 마이그레이션을 실행:

```bash
# Prisma 클라이언트 생성
npx prisma generate

# 데이터베이스 마이그레이션
npx prisma migrate dev
```

### 4. Redis 시작

Redis 서버가 실행 중인지 확인:

```bash
# Linux/Mac
redis-server

# Windows (다운로드 필요)
redis-server.exe
```

### 5. Gnugo 설치

#### Linux (Ubuntu/Debian)
```bash
sudo apt-get install gnugo
```

#### Mac
```bash
brew install gnugo
```

#### Windows
[GnuGo 공식 사이트](https://www.gnu.org/software/gnugo/)에서 다운로드

### 6. Katago 설치 (선택사항)

계가 기능을 사용하려면 Katago를 설치해야 합니다:

1. [Katago GitHub](https://github.com/lightvector/Katago)에서 릴리즈 다운로드
2. 모델 파일 다운로드
3. `.env` 파일에 경로 설정

## 실행

### 개발 모드

```bash
npm run dev
```

### 프로덕션 모드

PM2를 사용한 클러스터 모드:

```bash
npm install -g pm2
pm2 start ecosystem.config.js
```

또는 직접 실행:

```bash
npm start
```

## Docker를 사용한 실행

```bash
docker-compose up -d
```

## 문제 해결

### 데이터베이스 연결 오류

- PostgreSQL이 실행 중인지 확인
- `DATABASE_URL`이 올바른지 확인
- 데이터베이스가 생성되었는지 확인

### Redis 연결 오류

- Redis 서버가 실행 중인지 확인
- `REDIS_HOST`와 `REDIS_PORT`가 올바른지 확인

### Gnugo/Katago 오류

- 경로가 올바른지 확인
- 실행 권한이 있는지 확인
- 시스템 PATH에 포함되어 있는지 확인

## 개발 팁

- Prisma Studio로 데이터베이스 확인: `npx prisma studio`
- 로그 확인: `pm2 logs sudam` (PM2 사용 시)


