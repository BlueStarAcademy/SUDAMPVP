# 가장 간단한 해결 방법

## 방법 1: 서버 재시작으로 자동 생성 (가장 간단!)

서버 코드를 이미 수정했으므로, Railway에서 **Sudam PVP 서비스를 재시작**하면 자동으로 데이터베이스 테이블이 생성됩니다!

1. Railway 대시보드 → **Sudam PVP** 서비스
2. **Settings** 탭
3. **Restart** 버튼 클릭
4. 또는 **Deployments** 탭 → **Redeploy** 클릭

서버가 시작되면 자동으로:
- `prisma migrate deploy` 시도
- 실패하면 `prisma db push` 실행
- 모든 테이블 자동 생성!

## 방법 2: Railway 대시보드에서 직접 실행

1. Railway 대시보드 → **Sudam PVP** 서비스
2. **Deployments** 탭 → 최신 배포 클릭
3. 상단에 **"Shell"** 또는 **"Run Command"** 버튼 찾기
4. 다음 명령 실행:
   ```
   npx prisma db push --accept-data-loss
   npx prisma generate
   ```

## 방법 3: 코드 푸시로 자동 실행

현재 코드를 GitHub에 푸시하면 Railway가 자동으로 재배포하고, 서버 시작 시 자동으로 테이블을 생성합니다:

```bash
git push origin main
```

## 확인

Railway 대시보드 → **Postgres** → **Database** → **Data** 탭에서 테이블 확인:
- ✅ User
- ✅ Game
- ✅ Rating
- ✅ Session
- ✅ Spectator
- ✅ AIProgress

**추천: 방법 1 (서버 재시작)이 가장 간단합니다!**

