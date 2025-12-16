# Railway 빌드 실패 해결 가이드

## Root Directory는 설정되어 있는데도 빌드가 실패하는 경우

### 1. Build 설정 확인 (가장 중요!)

Railway 대시보드에서 각 서비스의 Build 설정을 확인하세요:

#### GnuGo 서비스
1. GnuGo 서비스 → **Settings** 탭
2. 오른쪽 사이드바에서 **Build** 클릭
3. 다음 설정 확인:
   - **Builder**: `Dockerfile` 선택되어 있어야 함 ⚠️
   - **Dockerfile Path**: `Dockerfile` (또는 비워둠)
   - **Build Command**: 비워둠 (Dockerfile 사용 시 불필요)
   - **Start Command**: `node server.js` 또는 비워둠

#### KataGo 서비스
1. KataGo 서비스 → **Settings** 탭
2. 오른쪽 사이드바에서 **Build** 클릭
3. 다음 설정 확인:
   - **Builder**: `Dockerfile` 선택되어 있어야 함 ⚠️
   - **Dockerfile Path**: `Dockerfile` (또는 비워둠)
   - **Build Command**: 비워둠 (Dockerfile 사용 시 불필요)
   - **Start Command**: `node server.js` 또는 비워둠

### 2. 빌드 로그 확인

빌드 실패의 정확한 원인을 확인하려면:

1. 각 서비스 → **Deployments** 탭
2. 실패한 배포 클릭
3. **View logs** 또는 로그 섹션 확인
4. 오류 메시지 확인:
   - "Dockerfile does not exist" → Builder 설정 문제
   - "npm install failed" → package.json 문제
   - "COPY failed" → 파일 경로 문제
   - 기타 오류 → 로그 내용 확인

### 3. 일반적인 문제 해결

#### 문제: Builder가 "Nixpacks"로 설정되어 있음
**해결**: Builder를 `Dockerfile`로 변경

#### 문제: Dockerfile Path가 잘못됨
**해결**: 
- Root Directory가 `servers/gnugo`인 경우: Dockerfile Path는 `Dockerfile` (비워둠도 가능)
- Root Directory가 루트인 경우: Dockerfile Path는 `servers/gnugo/Dockerfile`

#### 문제: Build Command가 설정되어 있음
**해결**: Dockerfile을 사용할 때는 Build Command를 비워둬야 합니다

### 4. Railway.toml 파일 확인

각 서비스 디렉토리에 `railway.toml` 파일이 있어야 합니다:

**servers/gnugo/railway.toml:**
```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "node server.js"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

**servers/katago/railway.toml:**
```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "node server.js"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

### 5. 서비스 재생성 (최후의 수단)

위 방법들이 모두 실패하면:

1. Railway 대시보드에서 서비스 삭제
2. 새 서비스 생성
3. GitHub 저장소 연결
4. Root Directory 설정: `servers/gnugo` 또는 `servers/katago`
5. Builder를 `Dockerfile`로 설정
6. 환경 변수 설정
7. 배포

### 6. 확인 체크리스트

#### GnuGo
- [ ] Root Directory: `servers/gnugo`
- [ ] Builder: `Dockerfile`
- [ ] Dockerfile Path: `Dockerfile` 또는 비워둠
- [ ] Build Command: 비워둠
- [ ] Start Command: `node server.js` 또는 비워둠
- [ ] PORT 환경 변수: `3001`

#### KataGo
- [ ] Root Directory: `servers/katago`
- [ ] Builder: `Dockerfile`
- [ ] Dockerfile Path: `Dockerfile` 또는 비워둠
- [ ] Build Command: 비워둠
- [ ] Start Command: `node server.js` 또는 비워둠
- [ ] PORT 환경 변수: `3002`
- [ ] KATAGO_MODEL_PATH 환경 변수 설정
- [ ] KATAGO_CONFIG_PATH 환경 변수 설정

### 7. 빌드 로그 공유

문제가 계속되면 빌드 로그의 오류 메시지를 확인하고 공유해주세요. 정확한 원인을 파악할 수 있습니다.

