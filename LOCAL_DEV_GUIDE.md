# 로컬 개발 및 배포 가이드

## 1. 로컬에서 실행하기

### 환경 변수 설정
`.env` 파일이 없다면 생성하세요:

```bash
# .env 파일 생성 (없는 경우)
cp .env.example .env  # 또는 직접 생성
```

필수 환경 변수:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/sudam?schema=public"
JWT_SECRET="your-secret-key-here-change-in-production"
GNUGO_SERVER_URL="http://localhost:3001"
KATAGO_SERVER_URL="http://localhost:3002"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_SOCKET_URL="http://localhost:3000"
```

### 데이터베이스 설정
```bash
# Prisma 클라이언트 생성
npx prisma generate

# 데이터베이스 마이그레이션 (로컬 DB가 있는 경우)
npx prisma migrate dev

# 또는 스키마만 동기화 (개발 중)
npx prisma db push
```

### 개발 서버 실행
```bash
# 의존성 설치 (처음이거나 package.json이 변경된 경우)
npm install

# 개발 서버 시작
npm run dev
```

서버가 `http://localhost:3000`에서 실행됩니다.

## 2. 변경사항 확인 및 수정

### 타입 체크
```bash
# 타입 오류 확인
npm run type-check

# 타입 체크 + 린트
npm run check
```

### 브라우저에서 확인
1. 브라우저에서 `http://localhost:3000` 접속
2. 로그인 후 대기실 페이지 확인
3. 레이아웃이 올바르게 표시되는지 확인:
   - 첫 번째 줄: 프로필, 레이팅, AI봇 대결
   - 두 번째 줄: 경기중인 대국실, 유저목록
   - 세 번째 줄: 랭킹전 매칭, 랭킹 순위

### 수정 사항 반영
- 파일을 수정하면 Next.js가 자동으로 Hot Reload됩니다
- 변경사항이 즉시 브라우저에 반영됩니다

## 3. 변경사항 커밋 및 푸시

### 변경사항 확인
```bash
# 변경된 파일 확인
git status

# 변경 내용 확인
git diff
```

### 커밋 및 푸시
```bash
# 모든 변경사항 스테이징
git add .

# 커밋 (의미있는 메시지 작성)
git commit -m "레이아웃 재구성: 3줄 그리드 시스템으로 변경"

# 원격 저장소에 푸시
git push
```

## 4. Railway 배포

### 자동 배포 (GitHub 연동 시)
Railway가 GitHub 저장소와 연동되어 있다면:
- `git push`만 하면 자동으로 배포가 시작됩니다
- Railway 대시보드에서 배포 상태 확인 가능

### 수동 배포 확인
1. [Railway 대시보드](https://railway.app) 접속
2. 프로젝트 선택
3. "Deployments" 탭에서 최신 배포 확인
4. 배포가 완료되면 "View" 버튼으로 사이트 확인

### 배포 후 확인사항
- [ ] 레이아웃이 올바르게 표시되는지
- [ ] 랭킹 순위가 제대로 로드되는지
- [ ] 전략바둑/놀이바둑 탭 전환이 작동하는지
- [ ] 유저 목록이 모드별로 필터링되는지

## 5. 문제 해결

### 타입 오류가 있는 경우
```bash
npm run type-check
```
오류 메시지를 확인하고 수정하세요.

### 빌드 오류가 있는 경우
```bash
npm run build
```
빌드 로그를 확인하고 오류를 수정하세요.

### 데이터베이스 오류가 있는 경우
```bash
# Prisma 스키마 확인
npx prisma format

# 마이그레이션 상태 확인
npx prisma migrate status

# 필요시 마이그레이션 재실행
npx prisma migrate dev
```

### Railway 배포 실패 시
1. Railway 대시보드의 "Logs" 탭 확인
2. 빌드 로그에서 오류 확인
3. 로컬에서 `npm run build`로 재현 가능한지 확인
4. 환경 변수가 올바르게 설정되었는지 확인

## 빠른 체크리스트

- [ ] `.env` 파일 설정 완료
- [ ] `npm install` 실행 완료
- [ ] `npx prisma generate` 실행 완료
- [ ] `npm run dev`로 로컬 서버 실행
- [ ] 브라우저에서 레이아웃 확인
- [ ] 타입 체크 통과 (`npm run type-check`)
- [ ] 변경사항 커밋 및 푸시
- [ ] Railway 배포 확인

