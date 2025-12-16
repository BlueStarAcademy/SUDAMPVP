# Railway Dockerfile 오류 최종 해결 방법

## 문제
"Dockerfile 'Dockerfile' does not exist" 오류가 계속 발생합니다.

## 원인
Railway가 Root Directory를 설정했어도, Builder 설정이 제대로 인식되지 않거나 빌드 컨텍스트가 잘못 설정되었을 수 있습니다.

## 해결 방법

### 방법 1: Railway 대시보드에서 Builder 명시적 설정 (권장)

#### GnuGo 서비스
1. **GnuGo 서비스** → **Settings** 탭
2. 오른쪽 사이드바에서 **Build** 클릭
3. **Builder** 섹션:
   - **Builder 선택**: 드롭다운에서 **"Dockerfile"** 선택 (Nixpacks가 아님!)
   - **Dockerfile Path**: 비워두기 (Root Directory 기준이므로)
   - 또는 `Dockerfile` 입력
4. **Build Command**: 완전히 비워두기 (Dockerfile 사용 시 불필요)
5. **Start Command**: `node server.js` 또는 비워두기
6. **저장** 클릭
7. **Deployments** 탭 → **Redeploy** 클릭

#### KataGo 서비스
1. **KataGo 서비스** → **Settings** 탭
2. 오른쪽 사이드바에서 **Build** 클릭
3. **Builder** 섹션:
   - **Builder 선택**: 드롭다운에서 **"Dockerfile"** 선택
   - **Dockerfile Path**: 비워두기 또는 `Dockerfile`
4. **Build Command**: 완전히 비워두기
5. **Start Command**: `node server.js` 또는 비워두기
6. **저장** 클릭
7. **Deployments** 탭 → **Redeploy** 클릭

### 방법 2: 서비스 재생성 (방법 1이 실패할 경우)

1. Railway 대시보드에서 **GnuGo** 서비스 삭제
2. **+ New** → **GitHub Repo** 선택
3. 저장소 선택: `BlueStarAcademy/SUDAMPVP`
4. **Root Directory** 설정: `servers/gnugo` 입력
5. 서비스 생성 후:
   - **Settings** → **Build**
   - **Builder**: `Dockerfile` 선택
   - **Dockerfile Path**: 비워두기
   - **Build Command**: 비워두기
   - **Start Command**: `node server.js`
6. **Variables** → `PORT=3001` 추가
7. 배포 시작

### 방법 3: Railway.toml 파일 확인 및 수정

각 서비스 디렉토리의 `railway.toml` 파일이 올바른지 확인:

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

이 파일들을 GitHub에 푸시했는지 확인:
```bash
git add servers/gnugo/railway.toml servers/katago/railway.toml
git commit -m "Add railway.toml for GnuGo and KataGo"
git push origin main
```

### 방법 4: Dockerfile이 실제로 존재하는지 확인

로컬에서 확인:
```bash
# GnuGo
ls -la servers/gnugo/Dockerfile

# KataGo
ls -la servers/katago/Dockerfile
```

GitHub에서 확인:
- https://github.com/BlueStarAcademy/SUDAMPVP/tree/main/servers/gnugo
- https://github.com/BlueStarAcademy/SUDAMPVP/tree/main/servers/katago

Dockerfile이 GitHub에 푸시되어 있는지 확인하세요.

## 확인 체크리스트

### GnuGo
- [ ] Root Directory: `servers/gnugo` (대시보드에서 확인)
- [ ] Builder: `Dockerfile` (Nixpacks가 아님!)
- [ ] Dockerfile Path: 비워둠 또는 `Dockerfile`
- [ ] Build Command: 비워둠
- [ ] Start Command: `node server.js` 또는 비워둠
- [ ] Dockerfile이 GitHub에 존재함
- [ ] railway.toml이 GitHub에 존재함

### KataGo
- [ ] Root Directory: `servers/katago` (대시보드에서 확인)
- [ ] Builder: `Dockerfile` (Nixpacks가 아님!)
- [ ] Dockerfile Path: 비워둠 또는 `Dockerfile`
- [ ] Build Command: 비워둠
- [ ] Start Command: `node server.js` 또는 비워둠
- [ ] Dockerfile이 GitHub에 존재함
- [ ] railway.toml이 GitHub에 존재함

## 중요 참고사항

1. **Builder는 반드시 "Dockerfile"이어야 합니다** (Nixpacks가 아님)
2. **Root Directory 설정 후에도 Builder를 수동으로 설정해야 할 수 있습니다**
3. **Build Command는 비워야 합니다** (Dockerfile 사용 시)
4. **변경사항 저장 후 반드시 Redeploy해야 합니다**

## 여전히 실패하는 경우

빌드 로그의 전체 오류 메시지를 확인하고 다음 정보를 공유해주세요:
1. Builder 설정 (스크린샷)
2. Root Directory 설정 (스크린샷)
3. 빌드 로그의 전체 오류 메시지

