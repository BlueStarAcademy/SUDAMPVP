# Railway 배포 가이드

## Railway 배포 설정

### 1. Railway 계정 생성 및 프로젝트 생성

1. [Railway](https://railway.app)에 가입/로그인
2. "New Project" 클릭
3. "Deploy from GitHub repo" 선택
4. GitHub 저장소 연결

### 2. PostgreSQL 데이터베이스 추가

1. Railway 대시보드에서 프로젝트 선택
2. "New" → "Database" → "Add PostgreSQL" 클릭
3. 데이터베이스가 생성되면 자동으로 `DATABASE_URL` 환경 변수가 설정됩니다

### 3. 환경 변수 설정

Railway 대시보드의 "Variables" 탭에서 다음 환경 변수를 설정:

```env
# Database (자동 설정됨)
DATABASE_URL=postgresql://...

# JWT Secret (랜덤 문자열 생성)
JWT_SECRET=your-secret-key-here-change-in-production

# Socket.io 및 Next.js URL
NEXT_PUBLIC_APP_URL=https://your-app-name.railway.app
NEXT_PUBLIC_SOCKET_URL=https://your-app-name.railway.app

# AI 서버 (선택사항)
GNUGO_SERVER_URL=http://your-gnugo-server:3001
KATAGO_SERVER_URL=http://your-katago-server:3002
```

### 4. 빌드 및 배포

Railway는 GitHub에 푸시할 때마다 자동으로 배포합니다.

또는 Railway CLI 사용:
```bash
railway login
railway link
railway up
```

### 5. 데이터베이스 마이그레이션

배포 후 Railway 대시보드에서 "Deploy Logs"를 확인하고, 필요시 수동으로 마이그레이션:

```bash
railway run npx prisma migrate deploy
railway run npx prisma generate
```

또는 Railway 대시보드의 "Shell" 탭에서 실행할 수 있습니다.

### 6. 포트 설정

Railway는 자동으로 포트를 할당합니다. `server.ts`에서 `process.env.PORT`를 사용하도록 설정되어 있습니다.

### 7. 도메인 설정 (선택사항)

1. Railway 대시보드에서 "Settings" → "Domains"
2. "Generate Domain" 클릭하여 무료 도메인 생성
3. 또는 커스텀 도메인 추가

## 주의사항

1. **환경 변수**: `JWT_SECRET`은 반드시 강력한 랜덤 문자열로 설정하세요
2. **데이터베이스**: PostgreSQL은 Railway에서 자동으로 관리되지만, 백업을 정기적으로 확인하세요
3. **AI 서버**: GnuGo/KataGo 서버는 별도로 배포해야 합니다 (Railway 또는 다른 플랫폼)
4. **빌드 시간**: 첫 빌드는 시간이 걸릴 수 있습니다 (5-10분)
5. **로그**: Railway 대시보드의 "Deploy Logs"에서 빌드 및 실행 로그를 확인할 수 있습니다

## 트러블슈팅

### 빌드 실패
- `package.json`의 스크립트 확인
- Node.js 버전 확인 (18+ 필요)
- 환경 변수 누락 확인

### 데이터베이스 연결 실패
- `DATABASE_URL` 환경 변수 확인
- Prisma 마이그레이션 실행 확인

### Socket.io 연결 실패
- `NEXT_PUBLIC_SOCKET_URL` 환경 변수 확인
- CORS 설정 확인

