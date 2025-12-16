# Cursor에서 GitHub에 푸시하기

## Cursor에서 Git 사용하기

Cursor는 VS Code 기반이므로 Git 기능이 동일합니다.

## 방법 1: Cursor Source Control 사용 (가장 간단)

1. **Source Control 탭 열기**
   - 왼쪽 사이드바의 **Source Control** 아이콘 클릭 (분기 모양 아이콘)
   - 또는 `Ctrl+Shift+G` (Windows/Linux) / `Cmd+Shift+G` (Mac)

2. **변경된 파일 확인**
   - "Changes" 섹션에 수정된 파일들이 보여야 합니다:
     - `server.ts`
     - `.nixpacks.toml`
     - `package.json`
     - 기타 수정된 파일들

3. **모든 파일 스테이징**
   - 각 파일 옆의 **+** 버튼 클릭
   - 또는 상단의 **"Stage All Changes"** 버튼 클릭

4. **커밋 메시지 입력**
   - 상단 입력란에 다음 메시지 입력:
     ```
     Force db push in build step to create database tables
     ```

5. **커밋 실행**
   - `Ctrl+Enter` (Windows/Linux) / `Cmd+Enter` (Mac)
   - 또는 "Commit" 버튼 클릭

6. **푸시 실행**
   - 상단에 **"Sync Changes"** 또는 **"Push"** 버튼이 보이면 클릭
   - 또는 `Ctrl+Shift+P` (Windows/Linux) / `Cmd+Shift+P` (Mac) → "Git: Push" 입력

## 방법 2: Cursor 명령 팔레트 사용

1. `Ctrl+Shift+P` (Windows/Linux) / `Cmd+Shift+P` (Mac) 누르기
2. 다음 명령어 순서대로 실행:
   - **"Git: Stage All Changes"** 입력 후 선택
   - **"Git: Commit"** 입력 후 선택 (커밋 메시지 입력)
   - **"Git: Push"** 입력 후 선택

## 방법 3: Cursor 터미널 사용

Cursor 하단 터미널에서:
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

푸시 후 GitHub 저장소 확인:
- https://github.com/BlueStarAcademy/SUDAMPVP
- **Commits** 탭에서 최근 커밋 확인
- **Code** 탭에서 `server.ts` 파일 열어 "=== Setting up database schema ===" 확인

## 문제 해결

### Source Control 탭에 변경사항이 안 보인다면
1. 파일 저장 확인 (`Ctrl+S` / `Cmd+S`)
2. Cursor 새로고침 (`Ctrl+R` / `Cmd+R`)
3. `Ctrl+Shift+P` → "Git: Refresh"

### 푸시가 실패한다면
1. GitHub 인증 확인
2. Cursor에서 GitHub 계정 연결 확인
3. Personal Access Token 필요할 수 있음

## 푸시 후

GitHub에 푸시가 완료되면:
1. Railway가 자동으로 재배포를 시작합니다
2. Railway 대시보드 → **Sudam PVP** → **Deployments** 확인
3. 빌드 로그에서 `prisma db push` 실행 확인

