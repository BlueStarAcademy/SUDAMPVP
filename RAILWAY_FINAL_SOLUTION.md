# Railway Dockerfile 오류 최종 해결 방법

## 현재 상황
- Builder: "Dockerfile" ✓
- Dockerfile Path: "Dockerfile" ✓  
- Root Directory: "servers/gnugo" ✓
- 하지만 여전히 "Dockerfile 'Dockerfile' does not exist" 오류 발생

## 해결 방법 (순서대로 시도)

### 방법 1: Dockerfile Path 비워두기

1. **GnuGo 서비스** → **Settings** → **Build**
2. **Dockerfile Path** 필드를 **완전히 비워두기** (삭제)
3. **저장**
4. **Deployments** → **Redeploy**

Railway가 Root Directory 기준으로 자동으로 Dockerfile을 찾도록 합니다.

### 방법 2: 서비스 재생성 (가장 확실한 방법)

#### GnuGo 서비스 재생성
1. Railway 대시보드에서 **GnuGo** 서비스 클릭
2. **Settings** → 맨 아래 **Danger** 섹션
3. **Delete Service** 클릭 (환경 변수는 백업해두세요)
4. 프로젝트 루트에서 **+ New** → **GitHub Repo**
5. 저장소: `BlueStarAcademy/SUDAMPVP` 선택
6. **Root Directory**: `servers/gnugo` 입력 ⚠️
7. 서비스 생성 후:
   - **Settings** → **Build**
   - **Builder**: `Dockerfile` 선택
   - **Dockerfile Path**: 비워두기 (또는 `Dockerfile`)
   - **Build Command**: 비워두기
   - **Start Command**: `node server.js`
8. **Variables** → `PORT=3001` 추가
9. 배포 시작

#### KataGo 서비스 재생성
동일한 과정을 `servers/katago`로 반복

### 방법 3: Railway.toml 파일 확인 및 재푸시

Railway.toml 파일이 올바른지 확인하고 GitHub에 푸시:

```bash
# 파일 확인
cat servers/gnugo/railway.toml
cat servers/katago/railway.toml

# GitHub에 푸시 (변경사항이 있다면)
git add servers/gnugo/railway.toml servers/katago/railway.toml
git commit -m "Ensure railway.toml files are correct"
git push origin main
```

### 방법 4: 빌드 컨텍스트 확인

Railway가 빌드할 때 Root Directory를 제대로 인식하는지 확인하기 위해:

1. **GnuGo 서비스** → **Settings** → **Source**
2. **Root Directory**가 정확히 `servers/gnugo`인지 확인 (앞뒤 공백 없음)
3. 저장 후 **Deployments** → **Redeploy**

## 가장 확실한 해결책

**서비스를 완전히 삭제하고 재생성하는 것이 가장 확실합니다.**

기존 서비스는 Root Directory 설정이 제대로 적용되지 않았을 수 있습니다. 새로 생성하면 처음부터 올바르게 설정됩니다.

## 재생성 후 확인 사항

### GnuGo
- [ ] Root Directory: `servers/gnugo`
- [ ] Builder: `Dockerfile`
- [ ] Dockerfile Path: 비워둠 또는 `Dockerfile`
- [ ] Build Command: 비워둠
- [ ] Start Command: `node server.js`
- [ ] PORT 환경 변수: `3001`

### KataGo
- [ ] Root Directory: `servers/katago`
- [ ] Builder: `Dockerfile`
- [ ] Dockerfile Path: 비워둠 또는 `Dockerfile`
- [ ] Build Command: 비워둠
- [ ] Start Command: `node server.js`
- [ ] PORT 환경 변수: `3002`
- [ ] KATAGO_MODEL_PATH 환경 변수
- [ ] KATAGO_CONFIG_PATH 환경 변수

## 참고

- 서비스 삭제 시 환경 변수도 삭제되므로, 필요하면 미리 백업하세요
- 재생성 후 환경 변수를 다시 설정해야 합니다
- 빌드가 성공하면 서비스가 자동으로 시작됩니다

