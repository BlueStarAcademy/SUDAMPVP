# SUDAM 바둑 애플리케이션

실시간 바둑 게임 플랫폼 - PVP 및 AI봇 대결

## 기능

- 실시간 PVP 대국
- Gnugo AI봇 (1-10단 난이도)
- Katago 계가 시스템
- 랭킹 및 매칭 시스템
- 실시간 유저 목록 동기화
- 서버 사이드 타이머 (정확한 시간 관리)
- 드래그 가능한 모달 (위치 저장)

## 기술 스택

- **Backend**: Express.js, Socket.io
- **Database**: PostgreSQL (Prisma ORM)
- **Cache/Queue**: Redis, Bull
- **AI Engines**: Gnugo, Katago
- **Template Engine**: EJS

## 설치

1. 의존성 설치:
```bash
npm install
```

2. 환경 변수 설정:
```bash
cp .env.example .env
# .env 파일을 편집하여 설정값 입력
```

3. 데이터베이스 설정:
```bash
npx prisma migrate dev
npx prisma generate
```

4. 서버 실행:
```bash
npm run dev
```

## 필수 요구사항

- Node.js 18+
- PostgreSQL
- Redis
- Gnugo (시스템에 설치 필요, 데모 모드에서는 선택사항)
- Katago (시스템에 설치 필요, 선택사항)

## AI 모드 설정

환경 변수 `AI_MODE`로 AI 엔진을 선택할 수 있습니다:

- `demo`: 데모 모드 (그누고 없이 동작, 간단한 휴리스틱 기반 AI)
- `gnugo`: 그누고 사용 (기본값, 그누고 설치 필요)

로컬 개발 시 `.env` 파일에 다음을 추가:
```bash
AI_MODE=demo  # 데모 모드 사용
# 또는
AI_MODE=gnugo  # 그누고 사용 (기본값)
```

배포 시에는 `AI_MODE=gnugo`로 설정하여 그누고를 사용하세요.

