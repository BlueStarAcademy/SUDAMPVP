# Git 푸시 가이드 (VS Code 사용)

## 문제
GitHub에 푸시가 안되고 있습니다. VS Code의 Git GUI를 사용하여 푸시하세요.

## 단계별 가이드

### 1. VS Code에서 Source Control 열기
- 왼쪽 사이드바의 **Source Control** 아이콘 클릭 (Ctrl+Shift+G)
- 또는 상단 메뉴: **View** → **Source Control**

### 2. 변경된 파일 확인
다음 파일들이 보여야 합니다:
- ✅ `server.ts` (수정됨)
- ✅ `.nixpacks.toml` (수정됨)
- ✅ `package.json` (수정됨)
- ✅ `app/api/admin/setup-db/route.ts` (새 파일)
- 기타 가이드 파일들

### 3. 모든 파일 스테이징
**방법 1: 개별 스테이징**
- 각 파일 옆의 **+** 버튼 클릭

**방법 2: 전체 스테이징**
- 상단의 **"Stage All Changes"** 버튼 클릭 (또는 `Ctrl+K Ctrl+A`)

### 4. 커밋 메시지 입력
상단 입력란에 다음 메시지 입력:
```
Force db push in build step to create database tables
```

### 5. 커밋 실행
- **Ctrl+Enter** 누르기
- 또는 **"Commit"** 버튼 클릭

### 6. 푸시 실행
**방법 1: Sync Changes 버튼**
- 상단에 **"Sync Changes"** 또는 **"Push"** 버튼이 보이면 클릭

**방법 2: 명령 팔레트 사용**
- `Ctrl+Shift+P` 누르기
- "Git: Push" 입력 후 선택
- 또는 "Git: Sync" 입력 후 선택

**방법 3: 더보기 메뉴**
- Source Control 탭에서 **...** (더보기) 메뉴 클릭
- **Push** 선택

### 7. 확인
1. GitHub 저장소 확인: https://github.com/BlueStarAcademy/SUDAMPVP
2. **Commits** 탭에서 최근 커밋 확인
3. **Code** 탭에서 파일 내용 확인:
   - `server.ts` 파일 열기
   - "=== Setting up database schema ===" 메시지 확인

## 문제 해결

### 푸시 버튼이 보이지 않는다면
1. 먼저 커밋을 완료했는지 확인
2. `Ctrl+Shift+P` → "Git: Push" 사용
3. 또는 터미널에서 직접:
   ```bash
   git push origin main
   ```

### 인증 문제가 있다면
1. GitHub에 로그인되어 있는지 확인
2. VS Code에서 GitHub 계정 연결 확인
3. 필요시 Personal Access Token 사용

### 변경사항이 보이지 않는다면
1. VS Code 새로고침 (F5)
2. 파일 저장 확인 (Ctrl+S)
3. Git 상태 확인: `Ctrl+Shift+P` → "Git: Show Git Output"

## 푸시 후 확인

GitHub에 푸시가 완료되면:
1. Railway가 자동으로 재배포를 시작합니다
2. Railway 대시보드 → **Sudam PVP** → **Deployments** 확인
3. 빌드 로그에서 `prisma db push` 실행 확인
4. 배포 완료 후 테이블 생성 확인

