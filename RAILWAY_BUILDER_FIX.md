# Railway Builder 설정 수정 방법

## 문제
"Dockerfile does not exist" 오류가 발생하는 경우, Railway가 Dockerfile을 찾으려고 하지만 메인 앱은 Nixpacks를 사용해야 합니다.

## 해결 방법

### Sudam PVP (메인 앱) - Builder 변경

1. Railway 대시보드에서 **Sudam PVP** 서비스 클릭
2. **Settings** 탭 클릭
3. 오른쪽 사이드바에서 **Build** 클릭
4. **Builder** 섹션에서:
   - 현재: `Dockerfile` 또는 `Dockerfile Path` 설정됨
   - 변경: **`Nixpacks`** 선택
5. **Build Command**: `npm run build` 확인
6. **Start Command**: `npm start` 확인
7. 저장 후 **Deployments** 탭에서 **Redeploy** 클릭

### 확인 사항

- ✅ Builder: `Nixpacks`
- ✅ Build Command: `npm run build`
- ✅ Start Command: `npm start`
- ✅ Root Directory: 비워둠 (루트 사용)

### GnuGo와 KataGo는 Dockerfile 사용

- **GnuGo**: `servers/gnugo/Dockerfile` 사용 (정상)
- **KataGo**: `servers/katago/Dockerfile` 사용 (정상)
- **Sudam PVP**: Nixpacks 사용 (변경 필요)

## Railway 설정 파일

프로젝트 루트에 다음 파일들이 있어야 합니다:

- ✅ `.nixpacks.toml` - Nixpacks 설정 (Node.js 20 지정)
- ✅ `package.json` - engines 필드에 Node.js >= 20.9.0
- ✅ `railway.toml` - builder = "nixpacks"
- ✅ `railway.json` - builder = "NIXPACKS"

이 파일들이 있으면 Railway가 자동으로 Nixpacks를 사용해야 하지만, 대시보드에서 수동으로 설정해야 할 수도 있습니다.

