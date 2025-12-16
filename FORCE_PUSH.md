# GitHub에 강제로 푸시하기

## 문제
로컬 파일은 수정되었지만 GitHub 원격 저장소에 푸시가 안되고 있습니다.

## 해결 방법

### 방법 1: VS Code Git GUI 사용 (권장)

1. **Source Control 탭 열기**
   - `Ctrl+Shift+G` 또는 왼쪽 사이드바의 Source Control 아이콘

2. **변경된 파일 확인**
   - 다음 파일들이 "Changes" 섹션에 보여야 합니다:
     - `server.ts`
     - `.nixpacks.toml`
     - `package.json`
     - 기타 수정된 파일들

3. **모든 파일 스테이징**
   - 각 파일 옆의 **+** 버튼 클릭
   - 또는 상단의 **"Stage All Changes"** 버튼 클릭

4. **커밋 메시지 입력**
   ```
   Force db push in build step to create database tables
   ```

5. **커밋 실행**
   - `Ctrl+Enter` 또는 "Commit" 버튼 클릭

6. **푸시 실행**
   - `Ctrl+Shift+P` → "Git: Push" 입력 후 선택
   - 또는 Source Control 탭에서 **...** (더보기) → **Push**

### 방법 2: VS Code 명령 팔레트 사용

1. `Ctrl+Shift+P` 누르기
2. 다음 명령어 순서대로 실행:
   - "Git: Stage All Changes"
   - "Git: Commit" (커밋 메시지 입력)
   - "Git: Push"

### 방법 3: 터미널 사용 (VS Code Git GUI가 안 될 때)

VS Code 터미널에서:
```bash
# 변경사항 확인
git status

# 모든 파일 스테이징
git add .

# 커밋
git commit -m "Force db push in build step to create database tables"

# 푸시
git push origin main
```

## 확인

푸시 후:
1. GitHub 저장소 확인: https://github.com/BlueStarAcademy/SUDAMPVP
2. **Commits** 탭에서 최근 커밋 확인
3. **Code** 탭에서 파일 내용 확인:
   - `server.ts` 파일 열기
   - "=== Setting up database schema ===" 메시지 확인

## 문제 해결

### 푸시가 실패한다면
1. GitHub 인증 확인
2. VS Code에서 GitHub 계정 연결 확인
3. Personal Access Token 필요할 수 있음

### 변경사항이 보이지 않는다면
1. 파일 저장 확인 (`Ctrl+S`)
2. VS Code 새로고침
3. `Ctrl+Shift+P` → "Git: Refresh"

## 푸시 후

GitHub에 푸시가 완료되면:
1. Railway가 자동으로 재배포를 시작합니다
2. Railway 대시보드 → **Sudam PVP** → **Deployments** 확인
3. 빌드 로그에서 `prisma db push` 실행 확인

