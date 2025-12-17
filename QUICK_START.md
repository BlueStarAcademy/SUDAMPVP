# 로컬 데모 빠른 시작 가이드

## 실행 전 확인사항

### 1. 환경 변수 설정
`.env` 파일의 `DATABASE_URL`이 Railway 공개 주소인지 확인하세요.

**Railway 공개 DATABASE_URL 확인 방법:**
1. Railway 대시보드 → PostgreSQL 서비스
2. "Variables" 탭에서 `DATABASE_URL` 확인
3. `postgres.railway.internal`이 아닌 `containers-us-west-xxx.railway.app` 형식인지 확인
4. 공개 URL이면 `.env` 파일에 교체

### 2. 실행 단계

```bash
# 1. 의존성 확인 (이미 설치되어 있으면 스킵)
npm install

# 2. Prisma 클라이언트 생성
npx prisma generate

# 3. 타입 체크
npm run type-check

# 4. 개발 서버 실행
npm run dev
```

### 3. 브라우저 접속
- URL: `http://localhost:3000`
- 로그인 후 대기실 페이지 확인

## 문제 해결

### Prisma generate 오류
파일이 사용 중일 수 있습니다. 다음을 시도하세요:
```bash
# 프로세스 종료 후 재시도
# 또는 관리자 권한으로 실행
```

### 데이터베이스 연결 오류
`.env` 파일의 `DATABASE_URL`을 Railway 공개 URL로 변경하세요.

### 포트 3000 사용 중
다른 터미널에서 실행 중인 프로세스를 종료하거나:
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

## 변경사항 푸시

```bash
# 1. 변경사항 확인
git status

# 2. 타입 체크
npm run type-check

# 3. 커밋
git add .
git commit -m "변경사항 설명"

# 4. 푸시
git push
```

