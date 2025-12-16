# Railway Dockerfile 오류 해결 방법

## 문제
GnuGo와 KataGo 서비스에서 "Dockerfile `Dockerfile` does not exist" 오류 발생

## 원인
Railway가 Root Directory 설정을 인식하지 못하거나, Dockerfile 경로를 올바르게 찾지 못함

## 해결 방법

### 방법 1: Railway 대시보드에서 Root Directory 확인 및 재설정

#### GnuGo 서비스
1. **GnuGo** 서비스 클릭
2. **Settings** 탭 → 오른쪽 사이드바에서 **Source** 클릭
3. **Root Directory** 확인:
   - 값: `servers/gnugo` (정확히 입력)
   - 저장
4. **Settings** → 오른쪽 사이드바에서 **Build** 클릭
5. **Builder**: `Dockerfile` 확인
6. **Dockerfile Path**: `Dockerfile` (Root Directory 기준 상대 경로)
7. **Deployments** 탭 → **Redeploy** 클릭

#### KataGo 서비스
1. **KataGo** 서비스 클릭
2. **Settings** 탭 → 오른쪽 사이드바에서 **Source** 클릭
3. **Root Directory** 확인:
   - 값: `servers/katago` (정확히 입력)
   - 저장
4. **Settings** → 오른쪽 사이드바에서 **Build** 클릭
5. **Builder**: `Dockerfile` 확인
6. **Dockerfile Path**: `Dockerfile` (Root Directory 기준 상대 경로)
7. **Deployments** 탭 → **Redeploy** 클릭

### 방법 2: Root Directory 제거 후 재설정

만약 방법 1이 작동하지 않으면:

1. **Settings** → **Source** → **Root Directory** 삭제 (비우기)
2. 저장
3. 다시 **Root Directory** 추가: `servers/gnugo` 또는 `servers/katago`
4. 저장
5. **Redeploy**

### 방법 3: Railway 설정 파일 확인

각 서비스의 `railway.toml` 파일이 올바른 위치에 있는지 확인:

- ✅ `servers/gnugo/railway.toml` 존재
- ✅ `servers/katago/railway.toml` 존재

이 파일들이 있으면 Railway가 자동으로 인식해야 합니다.

### 방법 4: 서비스 재생성 (최후의 수단)

만약 위 방법들이 모두 실패하면:

1. 기존 GnuGo/KataGo 서비스 삭제
2. **New** → **GitHub Repo** 선택
3. 같은 저장소 선택
4. **Root Directory**: `servers/gnugo` 또는 `servers/katago` 설정
5. 서비스 생성

## 확인 체크리스트

### GnuGo
- [ ] Root Directory = `servers/gnugo`
- [ ] Builder = `Dockerfile`
- [ ] Dockerfile Path = `Dockerfile` (또는 비워둠)
- [ ] `servers/gnugo/Dockerfile` 파일 존재 확인

### KataGo
- [ ] Root Directory = `servers/katago`
- [ ] Builder = `Dockerfile`
- [ ] Dockerfile Path = `Dockerfile` (또는 비워둠)
- [ ] `servers/katago/Dockerfile` 파일 존재 확인

## 디버깅 팁

1. **로그 확인**: Deployments → View logs에서 정확한 오류 확인
2. **파일 구조 확인**: GitHub에서 `servers/gnugo/Dockerfile`과 `servers/katago/Dockerfile`이 존재하는지 확인
3. **대소문자 확인**: `Dockerfile` (대문자 D, 나머지 소문자) 정확히 맞는지 확인

## 예상 결과

설정이 올바르면:
- ✅ Build 단계에서 Dockerfile을 찾음
- ✅ Docker 이미지 빌드 시작
- ✅ 서비스가 정상적으로 배포됨

