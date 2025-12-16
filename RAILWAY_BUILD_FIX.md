# Railway 빌드 오류 수정 가이드

## 문제 요약

1. **Sudam PVP**: Node.js 버전 문제 - Prisma 6.19.1+는 Node.js 20.19+를 요구
2. **GnuGo**: Dockerfile을 찾지 못함 - Root Directory 설정 필요
3. **KataGo**: Dockerfile을 찾지 못함 - Root Directory 설정 필요

## 해결 방법

### 1. Sudam PVP - Node.js 버전 업데이트 ✅

**수정된 파일:**
- `package.json`: `engines.node`를 `>=20.19.0`으로 업데이트
- `.nixpacks.toml`: Node.js 20.x 사용 (package.json의 engines 필드 우선)

**Railway 대시보드 설정:**
1. Sudam PVP 서비스 → Settings → Build
2. **Builder**: `Nixpacks` 확인 (Dockerfile이 아님)
3. **Build Command**: `npm run build`
4. **Start Command**: `npm start`
5. **Root Directory**: 비워둠 (루트 사용)

### 2. GnuGo - Root Directory 설정 필요 ⚠️

**Railway 대시보드에서 설정:**
1. GnuGo 서비스 → Settings → Source
2. **Root Directory**: `servers/gnugo` 추가/확인
3. Settings → Build
4. **Builder**: `Dockerfile` 확인
5. **Dockerfile Path**: `Dockerfile` (Root Directory 기준)
6. Settings → Variables
7. `PORT=3001` 환경 변수 추가
8. Deployments 탭에서 **Redeploy** 클릭

### 3. KataGo - Root Directory 설정 필요 ⚠️

**Railway 대시보드에서 설정:**
1. KataGo 서비스 → Settings → Source
2. **Root Directory**: `servers/katago` 추가/확인
3. Settings → Build
4. **Builder**: `Dockerfile` 확인
5. **Dockerfile Path**: `Dockerfile` (Root Directory 기준)
6. Settings → Variables
7. 다음 환경 변수 추가:
   ```
   PORT=3002
   KATAGO_MODEL_PATH=/katago-models/kata1-b40c256-s11101799168-d2715431527.bin.gz
   KATAGO_CONFIG_PATH=/app/config_gtp.cfg
   ```
8. Deployments 탭에서 **Redeploy** 클릭

## 설정 체크리스트

### Sudam PVP
- [x] `package.json` engines.node >= 20.19.0
- [x] `.nixpacks.toml` 설정 확인
- [ ] Railway 대시보드: Builder = Nixpacks
- [ ] Railway 대시보드: Root Directory = 비워둠
- [ ] Railway 대시보드: 환경 변수 설정 (DATABASE_URL, JWT_SECRET 등)

### GnuGo
- [ ] Railway 대시보드: Root Directory = `servers/gnugo`
- [ ] Railway 대시보드: Builder = Dockerfile
- [ ] Railway 대시보드: Dockerfile Path = `Dockerfile`
- [ ] Railway 대시보드: PORT=3001 환경 변수

### KataGo
- [ ] Railway 대시보드: Root Directory = `servers/katago`
- [ ] Railway 대시보드: Builder = Dockerfile
- [ ] Railway 대시보드: Dockerfile Path = `Dockerfile`
- [ ] Railway 대시보드: 환경 변수 설정 (PORT, KATAGO_MODEL_PATH, KATAGO_CONFIG_PATH)

## 배포 순서

1. **GnuGo 배포** (Root Directory 설정 후)
2. **KataGo 배포** (Root Directory 설정 후)
3. **Sudam PVP 배포** (Node.js 버전 수정 후)
4. **환경 변수 설정** (각 서비스의 공개 도메인 확인 후)

## 참고

- Railway는 코드 변경 시 자동으로 재배포를 시도합니다
- Root Directory 설정은 Railway 대시보드에서만 가능합니다 (코드로 설정 불가)
- 각 서비스의 공개 도메인은 배포 후 Settings → Networking에서 확인할 수 있습니다

