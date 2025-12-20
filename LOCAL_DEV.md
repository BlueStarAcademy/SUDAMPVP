# 로컬 개발 환경 설정 가이드

로컬에서 개발하고 테스트하기 위한 빠른 설정 가이드입니다.

## 🚀 가장 빠른 방법 (SQLite 사용, 별도 설치 불필요)

**PowerShell에서 실행:**
```powershell
.\setup-local.ps1
```

이 스크립트가 자동으로:
1. SQLite 스키마로 변경
2. .env 파일 설정
3. 의존성 설치
4. Prisma 클라이언트 생성
5. 데이터베이스 마이그레이션

완료 후:
```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 접속하면 바로 사용 가능합니다!

---

## PostgreSQL 사용 방법 (프로덕션과 동일한 환경)

### 1. 데이터베이스 및 Redis 실행

**옵션 A: Docker 사용 (권장)**
```bash
# Docker Desktop 설치 필요: https://www.docker.com/products/docker-desktop
# PostgreSQL과 Redis만 실행 (앱은 로컬에서 실행)
docker-compose up -d db redis
```

**옵션 B: 직접 설치**
- **PostgreSQL 설치**: https://www.postgresql.org/download/windows/
  - 설치 후 PostgreSQL 서비스 시작
  - 데이터베이스 생성: `createdb -U postgres sudam`
  - 또는 pgAdmin에서 `sudam` 데이터베이스 생성
  - `.env` 파일의 `DATABASE_URL`을 실제 PostgreSQL 연결 정보로 수정
  
- **Redis 설치 (선택사항)**: https://github.com/microsoftarchive/redis/releases
  - Redis는 선택사항입니다. 없어도 메모리 스토어로 동작합니다.

### 2. 데이터베이스 마이그레이션

```bash
# Prisma 클라이언트 생성
npm run prisma:generate

# 데이터베이스 마이그레이션
npm run prisma:migrate
```

### 3. 서버 실행

```bash
# 개발 모드 (nodemon으로 자동 재시작)
npm run dev
```

서버가 `http://localhost:3000`에서 실행됩니다!

## 환경 변수 설정

`.env` 파일이 이미 생성되어 있습니다. 필요시 수정하세요:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database (로컬 PostgreSQL)
DATABASE_URL=postgresql://sudam:sudam@localhost:5432/sudam

# Redis (선택사항)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Session
SESSION_SECRET=local-dev-secret-key-change-in-production
```

## 테스트 계정 생성

1. 브라우저에서 `http://localhost:3000` 접속
2. 회원가입 버튼 클릭
3. 이메일, 닉네임, 비밀번호 입력하여 계정 생성

또는 Prisma Studio로 직접 생성:

```bash
npm run prisma:studio
```

## 개발 팁

### 코드 변경 시 자동 재시작
`npm run dev`를 사용하면 nodemon이 파일 변경을 감지하여 자동으로 서버를 재시작합니다.

### 데이터베이스 확인
```bash
npm run prisma:studio
```
브라우저에서 데이터베이스 내용을 확인하고 수정할 수 있습니다.

### 로그 확인
서버 콘솔에서 실시간으로 로그를 확인할 수 있습니다. 에러가 발생하면 콘솔에 상세한 정보가 출력됩니다.

## 문제 해결

### 데이터베이스 연결 오류
- PostgreSQL이 실행 중인지 확인: `docker ps` (Docker 사용 시)
- `DATABASE_URL`이 올바른지 확인
- 데이터베이스가 생성되었는지 확인

### Redis 연결 오류
- Redis는 선택사항입니다. 연결되지 않아도 메모리 스토어로 동작합니다.
- Redis를 사용하려면: `docker-compose up -d redis`

### 포트가 이미 사용 중
`.env` 파일에서 `PORT`를 다른 값으로 변경하세요 (예: 3001)

## 배포 없이 개발하기

이제 매번 배포할 필요 없이:
1. 코드 수정
2. 자동으로 서버 재시작 (nodemon)
3. 브라우저에서 바로 테스트

개발이 훨씬 빠르고 편리해집니다! 🚀

