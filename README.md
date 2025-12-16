# SUDAM PVP - Real-time Baduk Game

Next.js 기반의 실시간 바둑 게임 플랫폼입니다. PVP 모드(전략바둑, 놀이바둑)를 지원하며, 시즌별 등급 시스템, AI 봇 대결, 관전 기능을 포함합니다.

## 주요 기능

- 🔐 사용자 인증 (JWT 기반)
- 🎮 실시간 게임 진행 (Socket.io)
- 📊 시즌별 등급 시스템 (ELO)
- 🤖 AI 봇 통합
  - GnuGo: 단계별 난이도 시스템 (1-10단계)
  - KataGo: 계가 및 힌트 기능
- 👀 게임 관전 기능
- ⏱️ 엄격한 시간 제한 시스템

## 기술 스택

- **Frontend/Backend**: Next.js 14+ (App Router), TypeScript
- **Real-time**: Socket.io
- **Database**: PostgreSQL (Prisma ORM)
- **Authentication**: JWT
- **Styling**: Tailwind CSS
- **AI Engines**: 
  - GnuGo (별도 서버) - 대결용, 단계별 난이도
  - KataGo (별도 서버) - 계가 및 힌트용

## 시작하기

### 필수 요구사항

- Node.js 18+
- PostgreSQL
- GnuGo/KataGo 서버 (선택사항, AI 기능 사용 시)

### 설치

1. 의존성 설치:
```bash
npm install
```

2. 환경 변수 설정:
`.env` 파일을 생성하고 다음 변수를 설정하세요:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/sudam?schema=public"
JWT_SECRET="your-secret-key-here"
GNUGO_SERVER_URL="http://localhost:3001"
KATAGO_SERVER_URL="http://localhost:3002"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_SOCKET_URL="http://localhost:3000"
```

3. 데이터베이스 마이그레이션:
```bash
npx prisma migrate dev
npx prisma generate
```

4. 개발 서버 실행:
```bash
npm run dev
```

애플리케이션은 `http://localhost:3000`에서 실행됩니다.

## 프로젝트 구조

```
SUDAM/
├── app/                    # Next.js App Router
│   ├── (auth)/            # 인증 페이지
│   ├── (game)/            # 게임 페이지
│   └── api/               # API 라우트
├── components/             # React 컴포넌트
├── lib/                    # 유틸리티 및 라이브러리
│   ├── socket/            # Socket.io 클라이언트
│   ├── game/              # 게임 로직
│   ├── ai/                # AI 통합
│   ├── season/            # 시즌 관리
│   └── rating/            # 등급 시스템
├── server/                 # 서버 사이드 로직
│   └── socket/            # Socket.io 서버
└── prisma/                 # Prisma 스키마
```

## 주요 기능 설명

### 시즌 시스템
- 분기별 시즌 (1월/4월/7월/10월)
- 자동 시즌 관리
- 시즌별 게임 기록 및 등급

### 등급 시스템
- ELO 알고리즘 기반
- 시즌별 등급 추적
- 승/패/무승부 기록

### AI 봇
- GnuGo: 빠른 수 추천
- KataGo: 고급 수 추천 및 계가

### 관전 기능
- 진행 중인 게임 목록
- 실시간 게임 관전
- 읽기 전용 스트리밍

## 배포

### Railway 배포 (권장)

Railway는 Next.js + Socket.io + PostgreSQL을 쉽게 배포할 수 있는 플랫폼입니다.

자세한 배포 가이드는 [RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md)를 참조하세요.

**빠른 시작:**
1. [Railway](https://railway.app)에 가입
2. GitHub 저장소 연결
3. PostgreSQL 데이터베이스 추가
4. 환경 변수 설정
5. 자동 배포 완료!

### 자체 서버 배포
1. 프로덕션 빌드:
```bash
npm run build
```

2. 서버 실행:
```bash
npm start
```

## 라이선스

ISC

