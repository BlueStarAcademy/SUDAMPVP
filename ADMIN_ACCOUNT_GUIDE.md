# 관리자 계정 생성 가이드

## 문제 해결

로그인 시 500 오류가 발생하는 경우, 데이터베이스 마이그레이션이 제대로 실행되지 않았을 수 있습니다.

## 관리자 계정 생성 방법

### 방법 1: Railway에서 직접 SQL 실행 (가장 확실)

Railway 대시보드에서:
1. **Postgres** 서비스 클릭
2. **Data** 또는 **Query** 탭
3. 다음 SQL 실행:

```sql
-- UserRole enum이 없으면 생성
DO $$ BEGIN
    CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- role 컬럼이 없으면 추가
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'USER';

-- 관리자 계정 생성 (비밀번호: admin123456)
INSERT INTO "User" (id, email, username, "passwordHash", role, "createdAt")
VALUES (
  'admin_' || gen_random_uuid()::text,
  'admin@sudam.com',
  'admin',
  '$2a$10$rOzJqZqZqZqZqZqZqZqZqOqZqZqZqZqZqZqZqZqZqZqZqZqZqZqZqZqZqZq', -- bcrypt hash of 'admin123456'
  'ADMIN',
  NOW()
)
ON CONFLICT (email) DO NOTHING;
```

**주의**: 위의 passwordHash는 예시입니다. 실제로는 bcrypt로 해시된 값을 사용해야 합니다.

### 방법 2: 스크립트 사용 (로컬에서)

로컬 PostgreSQL이 설정되어 있다면:

```bash
# 환경 변수 설정
export DATABASE_URL="postgresql://user:password@localhost:5432/sudam"

# 관리자 계정 생성
npx tsx scripts/create-admin.ts
```

### 방법 3: Railway CLI 사용

```bash
# Railway CLI 설치
npm install -g @railway/cli

# 로그인 및 프로젝트 연결
railway login
railway link

# 관리자 계정 생성 스크립트 실행
railway run npx tsx scripts/create-admin.ts
```

## 비밀번호 해시 생성

관리자 비밀번호를 변경하려면 bcrypt 해시를 생성해야 합니다:

```bash
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('yourpassword', 10).then(hash => console.log(hash));"
```

또는 온라인 bcrypt 해시 생성기 사용:
- https://bcrypt-generator.com/

## 기본 관리자 계정

스크립트 기본값:
- **Email**: `admin@sudam.com`
- **Username**: `admin`
- **Password**: `admin123456`

환경 변수로 변경:
```bash
ADMIN_EMAIL=your@email.com ADMIN_USERNAME=yourusername ADMIN_PASSWORD=yourpassword npx tsx scripts/create-admin.ts
```

## 확인 방법

관리자 계정이 생성되었는지 확인:

```sql
SELECT id, email, username, role FROM "User" WHERE role = 'ADMIN';
```

## 로그인 테스트

1. `/login` 페이지로 이동
2. 관리자 이메일과 비밀번호 입력
3. 로그인 성공 시 JWT 토큰이 발급됨

## 문제 해결

### 500 오류가 계속 발생하는 경우

1. Railway 배포 로그 확인
2. 마이그레이션이 실행되었는지 확인
3. 데이터베이스에 `role` 컬럼이 있는지 확인:
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'User' AND column_name = 'role';
   ```
4. Prisma 클라이언트가 재생성되었는지 확인

### 마이그레이션 수동 실행

Railway에서 직접 SQL을 실행하여 마이그레이션 적용:

```sql
-- UserRole enum 생성
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- role 컬럼 추가
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'USER';
```

