# Railway 설정 가이드

## 현재 상태
- Sudam PVP: Build failed
- GnuGo: Build failed  
- KataGo: Build failed
- Postgres: Online ✅

## 각 서비스별 설정

### 1. Sudam PVP (메인 앱)

#### Source 설정
1. **Root Directory**: 비워두기 (루트 디렉토리 사용)
   - 또는 설정하지 않음 (기본값)

2. **Branch**: `main` (이미 설정됨)

#### Build 설정
1. Settings → Build 탭
2. **Builder**: `Nixpacks` 선택 ⚠️ **중요!** (Dockerfile이 아님)
3. **Build Command**: `npm run build`
4. **Start Command**: `npm start` 또는 `tsx server.ts`

#### 환경 변수 (Variables 탭)
다음 환경 변수를 추가하세요:

```env
# Database (Railway가 자동 설정하지만 확인 필요)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# JWT Secret (랜덤 문자열 생성)
JWT_SECRET=your-secret-key-here-change-this

# App URLs (Railway가 자동 생성하는 도메인)
NEXT_PUBLIC_APP_URL=${{RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_SOCKET_URL=${{RAILWAY_PUBLIC_DOMAIN}}

# AI 서버 URLs (GnuGo와 KataGo 서비스의 도메인)
GNUGO_SERVER_URL=${{GnuGo.RAILWAY_PUBLIC_DOMAIN}}
KATAGO_SERVER_URL=${{KataGo.RAILWAY_PUBLIC_DOMAIN}}
```

**또는 직접 URL 입력:**
```env
GNUGO_SERVER_URL=https://your-gnugo-service.railway.app
KATAGO_SERVER_URL=https://your-katago-service.railway.app
```

#### Deploy 설정
1. Settings → Deploy 탭
2. **Restart Policy**: `ON_FAILURE`
3. **Healthcheck**: 비활성화 또는 `/api/health` 설정

---

### 2. GnuGo 서버

#### Source 설정
1. **Root Directory**: `servers/gnugo` ⚠️ **중요!**
   - "Add Root Directory" 클릭
   - `servers/gnugo` 입력

2. **Branch**: `main`

#### Build 설정
1. Settings → Build 탭
2. **Builder**: `Dockerfile` 선택
3. **Dockerfile Path**: `servers/gnugo/Dockerfile` (자동 감지)

#### 환경 변수
```env
PORT=3001
```

#### Deploy 설정
- 기본 설정 사용

---

### 3. KataGo 서버

#### Source 설정
1. **Root Directory**: `servers/katago` ⚠️ **중요!**
   - "Add Root Directory" 클릭
   - `servers/katago` 입력

2. **Branch**: `main`

#### Build 설정
1. Settings → Build 탭
2. **Builder**: `Dockerfile` 선택
3. **Dockerfile Path**: `servers/katago/Dockerfile` (자동 감지)

#### 환경 변수
```env
PORT=3002
KATAGO_MODEL_PATH=/katago-models/kata1-b40c256-s11101799168-d2715431527.bin.gz
KATAGO_CONFIG_PATH=/app/config_gtp.cfg
```

#### Deploy 설정
- 기본 설정 사용
- **주의**: KataGo는 빌드 시간이 오래 걸릴 수 있습니다 (모델 다운로드)

---

### 4. Postgres (이미 설정됨)

#### 확인 사항
1. Variables 탭에서 `DATABASE_URL` 확인
2. 다른 서비스에서 `${{Postgres.DATABASE_URL}}`로 참조 가능

---

## 설정 순서

### Step 1: GnuGo 서비스 설정
1. GnuGo 서비스 클릭
2. Settings → Source
3. **Root Directory**: `servers/gnugo` 추가
4. Settings → Variables
5. `PORT=3001` 추가
6. Deployments 탭에서 "Redeploy" 클릭

### Step 2: KataGo 서비스 설정
1. KataGo 서비스 클릭
2. Settings → Source
3. **Root Directory**: `servers/katago` 추가
4. Settings → Variables
5. 환경 변수 추가:
   ```
   PORT=3002
   KATAGO_MODEL_PATH=/katago-models/kata1-b40c256-s11101799168-d2715431527.bin.gz
   KATAGO_CONFIG_PATH=/app/config_gtp.cfg
   ```
6. Deployments 탭에서 "Redeploy" 클릭

### Step 3: Sudam PVP 메인 앱 설정
1. Sudam PVP 서비스 클릭
2. Settings → Variables
3. 다음 환경 변수 추가:

```env
# Database
DATABASE_URL=${{Postgres.DATABASE_URL}}

# JWT (중요: 강력한 랜덤 문자열 사용)
JWT_SECRET=your-very-secure-random-string-here

# App URLs
NEXT_PUBLIC_APP_URL=${{RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_SOCKET_URL=${{RAILWAY_PUBLIC_DOMAIN}}

# AI Servers (GnuGo와 KataGo 배포 후 URL 확인)
GNUGO_SERVER_URL=${{GnuGo.RAILWAY_PUBLIC_DOMAIN}}
KATAGO_SERVER_URL=${{KataGo.RAILWAY_PUBLIC_DOMAIN}}
```

4. Settings → Build
   - Build Command: `npm run build`
   - Start Command: `npm start`

5. Deployments 탭에서 "Redeploy" 클릭

### Step 4: 데이터베이스 마이그레이션
1. Sudam PVP 서비스의 Settings → Deploy
2. "Run Command" 또는 "Shell" 탭 사용
3. 다음 명령 실행:

```bash
npx prisma migrate deploy
npx prisma generate
```

---

## 빌드 실패 해결 방법

### GnuGo 빌드 실패
1. **Root Directory 확인**: `servers/gnugo`가 설정되어 있는지 확인
2. **Dockerfile 확인**: `servers/gnugo/Dockerfile` 존재 확인
3. **로그 확인**: Deployments → 최신 배포 → Logs 확인

### KataGo 빌드 실패
1. **Root Directory 확인**: `servers/katago`가 설정되어 있는지 확인
2. **Dockerfile 확인**: `servers/katago/Dockerfile` 존재 확인
3. **모델 다운로드 시간**: 모델 다운로드가 오래 걸릴 수 있음 (정상)
4. **로그 확인**: Deployments → 최신 배포 → Logs 확인

### Sudam PVP 빌드 실패
1. **환경 변수 확인**: 필수 환경 변수가 모두 설정되어 있는지 확인
2. **DATABASE_URL 확인**: Postgres 연결 확인
3. **빌드 로그 확인**: Deployments → 최신 배포 → Logs 확인
4. **Node.js 버전**: Railway가 자동으로 감지하지만, `package.json`에 `engines` 필드 확인

---

## 환경 변수 참조 방법

Railway에서는 다른 서비스의 환경 변수를 참조할 수 있습니다:

```env
# Postgres의 DATABASE_URL 참조
DATABASE_URL=${{Postgres.DATABASE_URL}}

# GnuGo 서비스의 공개 도메인 참조
GNUGO_SERVER_URL=${{GnuGo.RAILWAY_PUBLIC_DOMAIN}}

# KataGo 서비스의 공개 도메인 참조
KATAGO_SERVER_URL=${{KataGo.RAILWAY_PUBLIC_DOMAIN}}
```

**또는 직접 URL 입력:**
각 서비스의 Settings → Networking에서 공개 도메인을 확인하고 직접 입력할 수도 있습니다.

---

## 확인 체크리스트

- [ ] GnuGo: Root Directory = `servers/gnugo`
- [ ] KataGo: Root Directory = `servers/katago`
- [ ] Sudam PVP: Root Directory = 비워둠 (루트)
- [ ] Postgres: DATABASE_URL 확인
- [ ] Sudam PVP: JWT_SECRET 설정
- [ ] Sudam PVP: AI 서버 URL 설정
- [ ] 모든 서비스: 빌드 성공 확인
- [ ] 데이터베이스 마이그레이션 실행

---

## 트러블슈팅

### "Cannot find module" 오류
- Root Directory가 올바르게 설정되었는지 확인
- `package.json`이 올바른 위치에 있는지 확인

### "Port already in use" 오류
- Railway가 자동으로 포트를 할당하므로 `PORT` 환경 변수는 선택사항
- 코드에서 `process.env.PORT` 사용 확인

### "Database connection failed"
- Postgres 서비스가 실행 중인지 확인
- `DATABASE_URL` 환경 변수 확인
- Railway의 Private Networking 사용 확인

### "AI server not responding"
- GnuGo/KataGo 서비스가 실행 중인지 확인
- 각 서비스의 공개 도메인 확인
- 환경 변수 `GNUGO_SERVER_URL`, `KATAGO_SERVER_URL` 확인

