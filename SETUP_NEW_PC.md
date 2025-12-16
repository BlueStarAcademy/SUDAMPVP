# 새 PC에서 프로젝트 설정하기

## 다른 PC에서 작업 이어가기

GitHub에 모든 코드가 저장되어 있으므로, 다른 PC에서도 쉽게 이어서 작업할 수 있습니다.

## 1. 필수 프로그램 설치

### Git 설치
- Windows: https://git-scm.com/download/win
- macOS: `brew install git` 또는 Xcode Command Line Tools
- Linux: `sudo apt-get install git` (Ubuntu/Debian)

### Node.js 설치
- Node.js 20.x 이상 필요
- https://nodejs.org/ 에서 다운로드
- 또는 nvm 사용: `nvm install 20`

### 코드 에디터 (선택사항)
- VS Code: https://code.visualstudio.com/
- 또는 원하는 에디터

## 2. 프로젝트 클론

### GitHub에서 프로젝트 가져오기

```bash
# 원하는 디렉토리로 이동
cd ~/projects  # 또는 원하는 위치

# 프로젝트 클론
git clone https://github.com/BlueStarAcademy/SUDAMPVP.git

# 프로젝트 디렉토리로 이동
cd SUDAMPVP
```

## 3. 환경 설정

### 의존성 설치

```bash
npm install
```

### 환경 변수 파일 생성

`.env` 파일을 생성하고 다음 내용 추가:

```env
# Database (로컬 개발용)
DATABASE_URL="postgresql://user:password@localhost:5432/sudam?schema=public"

# JWT Secret (로컬 개발용, 프로덕션과 다르게 설정)
JWT_SECRET="local-development-secret-key"

# App URLs (로컬 개발용)
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_SOCKET_URL="http://localhost:3000"

# AI 서버 (로컬에서 실행하는 경우)
GNUGO_SERVER_URL="http://localhost:3001"
KATAGO_SERVER_URL="http://localhost:3002"
```

### 데이터베이스 설정

로컬 PostgreSQL이 필요합니다:

```bash
# PostgreSQL 설치 (macOS)
brew install postgresql
brew services start postgresql

# PostgreSQL 설치 (Ubuntu/Debian)
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql

# 데이터베이스 생성
createdb sudam

# 또는 psql 사용
psql -U postgres
CREATE DATABASE sudam;
```

### Prisma 마이그레이션

```bash
# Prisma 클라이언트 생성
npx prisma generate

# 데이터베이스 마이그레이션 실행
npx prisma migrate dev
```

## 4. 개발 서버 실행

```bash
# 개발 모드로 실행
npm run dev
```

서버는 `http://localhost:3000`에서 실행됩니다.

## 5. AI 서버 실행 (선택사항)

### GnuGo 서버

```bash
cd servers/gnugo
npm install
npm start
```

### KataGo 서버

```bash
cd servers/katago
npm install
npm start
```

**주의**: KataGo는 KataGo 바이너리가 필요합니다. 로컬에 설치되어 있어야 합니다.

## 6. Git 작업 흐름

### 변경사항 확인

```bash
git status
```

### 변경사항 커밋

```bash
# 변경된 파일 추가
git add .

# 커밋
git commit -m "작업 내용 설명"

# GitHub에 푸시
git push origin main
```

### 최신 변경사항 가져오기

```bash
# 다른 PC에서 작업한 내용 가져오기
git pull origin main
```

## 7. Railway 배포 연동

Railway는 GitHub 저장소와 자동으로 연동되므로:
- 코드를 푸시하면 자동으로 배포됩니다
- 환경 변수는 Railway 대시보드에서 관리합니다
- 별도 설정 불필요

## 8. 문제 해결

### 의존성 오류

```bash
# node_modules 삭제 후 재설치
rm -rf node_modules package-lock.json
npm install
```

### Prisma 오류

```bash
# Prisma 재생성
npx prisma generate
npx prisma migrate reset  # 주의: 데이터 삭제됨
npx prisma migrate dev
```

### 포트 충돌

다른 포트 사용:
```bash
PORT=3001 npm run dev
```

## 9. 유용한 명령어

```bash
# 프로젝트 상태 확인
git status
git log --oneline

# 브랜치 확인
git branch

# 원격 저장소 확인
git remote -v

# 최신 변경사항 가져오기
git fetch origin
git pull origin main
```

## 10. 작업 환경 동기화

### VS Code 설정 (선택사항)

`.vscode/settings.json` 파일이 있다면 자동으로 적용됩니다.

### 환경 변수 관리

- 로컬 개발: `.env` 파일 사용
- 프로덕션: Railway 대시보드에서 관리
- `.env` 파일은 Git에 커밋하지 않음 (`.gitignore`에 포함됨)

## 주의사항

1. **환경 변수**: `.env` 파일은 각 PC마다 다를 수 있습니다 (로컬 개발용)
2. **데이터베이스**: 로컬 DB와 프로덕션 DB는 별도입니다
3. **포트**: 로컬에서 실행 시 포트 충돌 주의
4. **의존성**: `package.json`이 최신인지 확인

## 빠른 시작 체크리스트

- [ ] Git 설치 확인: `git --version`
- [ ] Node.js 20+ 설치 확인: `node --version`
- [ ] 프로젝트 클론: `git clone https://github.com/BlueStarAcademy/SUDAMPVP.git`
- [ ] 의존성 설치: `npm install`
- [ ] `.env` 파일 생성 및 설정
- [ ] PostgreSQL 설치 및 데이터베이스 생성
- [ ] Prisma 마이그레이션: `npx prisma migrate dev`
- [ ] 개발 서버 실행: `npm run dev`

이제 다른 PC에서도 동일하게 작업할 수 있습니다!

