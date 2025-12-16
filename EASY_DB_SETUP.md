# 간단한 데이터베이스 설정 방법

Railway의 UI가 불편하므로 더 간단한 방법들을 제공합니다.

## 방법 1: Railway CLI 사용 (가장 간단!)

```bash
# Railway CLI 설치 (한 번만)
npm install -g @railway/cli

# Railway 로그인
railway login

# 프로젝트 연결
railway link

# 데이터베이스 스키마 적용 (한 줄로 끝!)
railway run npx prisma db push --accept-data-loss

# Prisma Client 생성
railway run npx prisma generate
```

**끝!** 이제 모든 테이블이 생성되었습니다.

## 방법 2: 서버 자동 설정 (이미 적용됨)

서버가 시작될 때 자동으로 데이터베이스 스키마를 적용합니다.
- 마이그레이션 파일이 있으면 `migrate deploy` 실행
- 실패하면 `db push`로 자동 전환
- Railway에서 서버만 재시작하면 자동으로 테이블 생성됨

## 방법 3: 외부 PostgreSQL 클라이언트 사용

1. Railway Postgres 서비스 → **Database** → **Credentials** 탭
2. 연결 정보 복사
3. 로컬에서 `psql` 또는 pgAdmin으로 연결
4. 다음 명령 실행:

```bash
# 로컬에서 Railway 데이터베이스에 연결
psql "postgresql://user:password@host:port/database"

# 또는 Railway CLI로 연결
railway connect postgres
```

연결 후:
```sql
-- Prisma db push 실행 (psql 안에서)
\! npx prisma db push --accept-data-loss
```

## 확인 방법

Railway 대시보드 → Postgres → Database → Data 탭에서 다음 테이블 확인:
- ✅ User
- ✅ Game
- ✅ Rating
- ✅ Session
- ✅ Spectator
- ✅ AIProgress

## 관리자 계정 생성

테이블 생성 후, Railway CLI로 관리자 계정 생성:

```bash
# 환경 변수 설정 (선택사항)
railway variables set ADMIN_EMAIL=admin@sudam.com
railway variables set ADMIN_USERNAME=admin
railway variables set ADMIN_PASSWORD=admin123456

# 관리자 계정 생성 스크립트 실행
railway run npx tsx scripts/create-admin.ts
```

또는 로컬에서 Railway 데이터베이스에 연결하여 직접 생성할 수도 있습니다.

