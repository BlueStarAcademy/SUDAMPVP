# 로컬 데모 실행 가이드

## 빠른 시작

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 변수 확인
`.env` 파일이 있는지 확인하고, 다음 변수들이 설정되어 있는지 확인하세요:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/sudam?schema=public"
JWT_SECRET="demo-secret-key-change-in-production"
GNUGO_SERVER_URL="http://localhost:3001"
KATAGO_SERVER_URL="http://localhost:3002"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_SOCKET_URL="http://localhost:3000"
```

**중요**: Railway의 공개 DATABASE_URL을 사용하려면 `.env` 파일의 `DATABASE_URL`을 Railway 대시보드에서 복사한 값으로 교체하세요.

### 3. Prisma 클라이언트 생성
```bash
npx prisma generate
```

### 4. 데이터베이스 연결 확인
```bash
# 데이터베이스 스키마 동기화 (로컬 DB가 있는 경우)
npx prisma db push

# 또는 마이그레이션 실행
npx prisma migrate dev
```

### 5. 개발 서버 실행
```bash
npm run dev
```

서버가 `http://localhost:3000`에서 실행됩니다.

## 문제 해결

### 데이터베이스 연결 오류가 발생하는 경우

**옵션 1: Railway 데이터베이스 사용 (권장)**
1. Railway 대시보드 접속
2. PostgreSQL 서비스 선택
3. "Variables" 탭에서 `DATABASE_URL` 복사
4. `.env` 파일의 `DATABASE_URL` 값을 교체

**옵션 2: 로컬 PostgreSQL 사용**
1. 로컬에 PostgreSQL 설치
2. 데이터베이스 생성: `CREATE DATABASE sudam;`
3. `.env` 파일의 `DATABASE_URL`을 로컬 설정으로 변경

### 포트가 이미 사용 중인 경우
다른 포트를 사용하거나 기존 프로세스를 종료하세요:
```bash
# Windows에서 포트 3000 사용 중인 프로세스 확인
netstat -ano | findstr :3000

# 프로세스 종료 (PID는 위 명령어 결과에서 확인)
taskkill /PID <PID> /F
```

### 타입 오류가 있는 경우
```bash
npm run type-check
```

## 변경사항 확인 및 푸시

### 1. 변경사항 확인
```bash
git status
git diff
```

### 2. 타입 체크 및 빌드 테스트
```bash
npm run type-check
npm run build
```

### 3. 커밋 및 푸시
```bash
git add .
git commit -m "변경사항 설명"
git push
```

## 데모 실행 체크리스트

- [ ] Node.js 20.19.0 이상 설치됨
- [ ] npm 9.0.0 이상 설치됨
- [ ] `npm install` 실행 완료
- [ ] `.env` 파일 설정 완료
- [ ] `npx prisma generate` 실행 완료
- [ ] 데이터베이스 연결 확인 완료
- [ ] `npm run dev` 실행 성공
- [ ] 브라우저에서 `http://localhost:3000` 접속 가능
- [ ] 로그인 및 대기실 페이지 확인 완료

