# Railway Dockerfile 설정 가이드

## 문제
Railway에서 "Dockerfile 'Dockerfile' does not exist" 오류가 발생합니다.

## 원인
Railway가 프로젝트 루트 디렉토리에서 Dockerfile을 찾고 있지만, 실제로는 `servers/gnugo/Dockerfile`과 `servers/katago/Dockerfile`에 있습니다.

## 해결 방법

### GnuGo 서비스 설정

1. Railway 대시보드에서 **GnuGo** 서비스 클릭
2. **Settings** 탭 클릭
3. **Source** 섹션에서:
   - **Root Directory** 필드에 `servers/gnugo` 입력
   - 또는 "Add Root Directory" 버튼 클릭 후 `servers/gnugo` 입력
4. **Build** 섹션에서:
   - **Builder**: `Dockerfile` 확인
   - **Dockerfile Path**: `Dockerfile` (Root Directory 기준이므로 그대로 유지)
5. **Variables** 섹션에서:
   - `PORT=3001` 환경 변수 추가
6. **Deployments** 탭에서 **Redeploy** 클릭

### KataGo 서비스 설정

1. Railway 대시보드에서 **KataGo** 서비스 클릭
2. **Settings** 탭 클릭
3. **Source** 섹션에서:
   - **Root Directory** 필드에 `servers/katago` 입력
   - 또는 "Add Root Directory" 버튼 클릭 후 `servers/katago` 입력
4. **Build** 섹션에서:
   - **Builder**: `Dockerfile` 확인
   - **Dockerfile Path**: `Dockerfile` (Root Directory 기준이므로 그대로 유지)
5. **Variables** 섹션에서:
   - 다음 환경 변수 추가:
     ```
     PORT=3002
     KATAGO_MODEL_PATH=/katago-models/kata1-b40c256-s11101799168-d2715431527.bin.gz
     KATAGO_CONFIG_PATH=/app/config_gtp.cfg
     ```
6. **Deployments** 탭에서 **Redeploy** 클릭

## 확인 사항

### GnuGo
- ✅ Root Directory: `servers/gnugo`
- ✅ Builder: `Dockerfile`
- ✅ Dockerfile Path: `Dockerfile`
- ✅ PORT 환경 변수: `3001`

### KataGo
- ✅ Root Directory: `servers/katago`
- ✅ Builder: `Dockerfile`
- ✅ Dockerfile Path: `Dockerfile`
- ✅ PORT 환경 변수: `3002`
- ✅ KATAGO_MODEL_PATH 환경 변수 설정됨
- ✅ KATAGO_CONFIG_PATH 환경 변수 설정됨

## 중요 참고사항

- **Root Directory 설정은 Railway 대시보드에서만 가능합니다** (코드로 설정 불가)
- Root Directory를 설정하면 Railway가 해당 디렉토리를 서비스의 루트로 인식합니다
- `railway.toml` 파일의 `dockerfilePath = "Dockerfile"`은 Root Directory 기준 상대 경로입니다
- Root Directory를 설정하면 `servers/gnugo/Dockerfile`이 `Dockerfile`로 인식됩니다

## 트러블슈팅

### 여전히 "Dockerfile does not exist" 오류가 발생하는 경우

1. Root Directory가 정확히 설정되었는지 확인 (`servers/gnugo` 또는 `servers/katago`)
2. Railway 대시보드에서 서비스를 삭제하고 다시 생성해보세요
3. GitHub 저장소가 올바르게 연결되어 있는지 확인
4. 최신 코드가 푸시되었는지 확인 (`git push origin main`)

### 빌드는 성공하지만 실행이 안 되는 경우

1. 환경 변수가 올바르게 설정되었는지 확인
2. 포트가 올바르게 설정되었는지 확인
3. 로그를 확인하여 오류 메시지 확인
