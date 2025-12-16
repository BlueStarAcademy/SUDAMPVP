# Railway Railpack Default 버그 해결 방법

## 문제
Railway 대시보드에서 Builder를 "Dockerfile"로 설정해도 자동으로 "Railpack Default"로 변경되는 버그가 발생합니다.

## 해결 방법

### 방법 1: Railway 대시보드에서 Builder 강제 설정 (즉시 시도)

1. **GnuGo 서비스** → **Settings** → **Build**
2. **Builder** 드롭다운에서 **"Dockerfile"** 선택 (Railpack Default가 아님!)
3. **저장** 클릭
4. **Deployments** 탭으로 이동
5. **Redeploy** 클릭
6. 빌드가 시작되면 **Settings** → **Build**로 다시 가서 Builder가 여전히 "Dockerfile"인지 확인
7. 만약 다시 "Railpack Default"로 변경되었다면 → **즉시 다시 "Dockerfile"로 변경** → **저장** → **Redeploy**

### 방법 2: Config-as-code 사용 (권장)

Railway의 Config-as-code 기능을 사용하여 설정을 코드로 관리:

1. **GnuGo 서비스** → **Settings** → **Config-as-code** 탭
2. **Enable Config-as-code** 토글 활성화
3. `servers/gnugo/railway.toml` 파일이 자동으로 인식됨
4. 파일 내용 확인:
   ```toml
   [build]
   builder = "DOCKERFILE"
   dockerfilePath = "Dockerfile"
   
   [deploy]
   startCommand = "node server.js"
   restartPolicyType = "ON_FAILURE"
   restartPolicyMaxRetries = 10
   ```
5. **저장** 후 재배포

### 방법 3: 서비스 재생성 (가장 확실)

Railway 버그를 우회하기 위해 서비스를 완전히 재생성:

#### GnuGo 재생성
1. **GnuGo 서비스** → **Settings** → **Danger** 섹션
2. **Delete Service** 클릭
3. 프로젝트 루트에서 **+ New** → **GitHub Repo**
4. 저장소: `BlueStarAcademy/SUDAMPVP` 선택
5. **Root Directory**: `servers/gnugo` 입력
6. 서비스 생성 후:
   - **Settings** → **Config-as-code** → **Enable** 활성화
   - 또는 **Settings** → **Build** → **Builder**: `Dockerfile` 선택
7. **Variables** → `PORT=3001` 추가
8. 배포 시작

#### KataGo도 동일하게 재생성

### 방법 4: railway.toml 파일 수정

현재 `railway.toml` 파일의 builder 값을 확인하고 수정:

**servers/gnugo/railway.toml:**
```toml
[build]
builder = "DOCKERFILE"  # 대문자로 명시
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "node server.js"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

변경 후 GitHub에 푸시:
```bash
git add servers/gnugo/railway.toml servers/katago/railway.toml
git commit -m "Fix Railway builder configuration"
git push origin main
```

## 확인 체크리스트

### GnuGo
- [ ] Root Directory: `servers/gnugo`
- [ ] Builder: **"Dockerfile"** (Railpack Default가 아님!)
- [ ] Dockerfile Path: `Dockerfile` 또는 비워둠
- [ ] Build Command: 비워둠
- [ ] Config-as-code 활성화 (선택사항이지만 권장)
- [ ] PORT 환경 변수: `3001`

### KataGo
- [ ] Root Directory: `servers/katago`
- [ ] Builder: **"Dockerfile"** (Railpack Default가 아님!)
- [ ] Dockerfile Path: `Dockerfile` 또는 비워둠
- [ ] Build Command: 비워둠
- [ ] Config-as-code 활성화 (선택사항이지만 권장)
- [ ] PORT 환경 변수: `3002`
- [ ] KATAGO_MODEL_PATH 환경 변수
- [ ] KATAGO_CONFIG_PATH 환경 변수

## 중요 참고사항

1. **Railway 버그**: Builder가 자동으로 "Railpack Default"로 변경되는 것은 Railway의 알려진 버그일 수 있습니다.
2. **Config-as-code 사용 권장**: 설정을 코드로 관리하면 버그의 영향을 덜 받을 수 있습니다.
3. **지속적인 모니터링**: 배포 후에도 Builder 설정이 변경되지 않았는지 확인하세요.
4. **서비스 재생성**: 버그가 계속되면 서비스를 재생성하는 것이 가장 확실한 해결책입니다.

## 트러블슈팅

### Builder가 계속 Railpack Default로 변경되는 경우
1. Config-as-code를 활성화해보세요
2. 서비스를 완전히 삭제하고 재생성하세요
3. Railway 지원팀에 문의하세요

### Dockerfile을 찾지 못하는 경우
1. Root Directory가 정확히 `servers/gnugo` 또는 `servers/katago`인지 확인
2. Dockerfile이 GitHub에 푸시되어 있는지 확인
3. Dockerfile Path를 비워두거나 `Dockerfile`로 설정

