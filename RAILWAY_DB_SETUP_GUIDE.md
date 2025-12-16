# Railway 데이터베이스 수동 설정 가이드

## 문제
Railway 데이터베이스에 `_prisma_migrations` 테이블만 있고 다른 테이블들(User, Game, Rating 등)이 없는 경우

## 해결 방법

### 방법 1: Railway 대시보드에서 SQL 실행

1. Railway 대시보드에서 **Postgres** 서비스를 선택합니다
2. **Database** 탭 → **Data** 서브탭으로 이동합니다
3. SQL 쿼리 에디터를 찾습니다 (Query 버튼 또는 SQL Editor)
4. `RAILWAY_DB_SETUP.sql` 파일의 전체 내용을 복사하여 실행합니다

### 방법 2: Railway CLI 사용

```bash
# Railway CLI 설치 (없는 경우)
npm install -g @railway/cli

# Railway 로그인
railway login

# 프로젝트 선택
railway link

# SQL 파일 실행
railway run psql < RAILWAY_DB_SETUP.sql
```

### 방법 3: 외부 PostgreSQL 클라이언트 사용

1. Railway Postgres 서비스의 **Database** 탭 → **Credentials**에서 연결 정보 확인
2. `psql` 또는 다른 PostgreSQL 클라이언트로 연결
3. `RAILWAY_DB_SETUP.sql` 파일의 내용 실행

## 확인

SQL 실행 후, Railway 대시보드의 **Database** → **Data** 탭에서 다음 테이블들이 생성되었는지 확인:

- ✅ User
- ✅ Game
- ✅ Rating
- ✅ Session
- ✅ Spectator
- ✅ AIProgress

## 다음 단계

테이블 생성 후:
1. 관리자 계정 생성: `npx tsx scripts/create-admin.ts` (로컬에서 실행)
2. 또는 Railway에서 직접 관리자 계정 생성 SQL 실행

