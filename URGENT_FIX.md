# 긴급 수정: 테이블 생성 문제

## 문제
- 로그에 "Running database migrations..." 메시지가 나옴 (이전 코드)
- 새 코드가 배포되지 않음
- 테이블이 생성되지 않음
- 에러: "The table `public.User` does not exist"

## 해결책

코드를 수정하여 빌드 단계에서 **강제로** `db push`를 실행하도록 했습니다.

### 변경 사항:
1. `.nixpacks.toml`: `|| echo` 제거 (실패해도 계속 진행하지 않도록)
2. `package.json`: `|| true` 제거 (실패 시 에러 표시)

## 다음 단계

### 1. 코드 푸시 (필수!)

VS Code에서:
1. Source Control 탭 (Ctrl+Shift+G)
2. 변경된 파일 스테이징:
   - `.nixpacks.toml`
   - `package.json`
3. 커밋: "Force db push in build step"
4. Push

### 2. Railway에서 재배포

1. Railway 대시보드 → **Sudam PVP** 서비스
2. **Deployments** 탭
3. **Redeploy** 버튼 클릭

### 3. 빌드 로그 확인

**Build Logs**에서 다음 메시지 확인:
```
npx prisma db push --accept-data-loss --skip-generate
The database is now in sync with your schema.
```

**중요**: 빌드가 실패하면 배포되지 않습니다. 빌드 로그를 확인하세요!

### 4. 테이블 확인

빌드가 성공하면:
- Railway 대시보드 → **Postgres** → **Database** → **Data** 탭
- 테이블 확인:
  - ✅ User
  - ✅ Game
  - ✅ Rating
  - ✅ Session
  - ✅ Spectator
  - ✅ AIProgress

## 만약 빌드가 실패한다면

빌드 로그의 에러 메시지를 알려주세요. 그에 따라 수정하겠습니다.

