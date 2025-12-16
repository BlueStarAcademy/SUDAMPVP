# 최종 해결 방법 (Railway 대시보드 사용)

터미널 명령어가 계속 멈추므로, Railway 대시보드에서 직접 처리하세요.

## 방법 1: 서버 재시작 (가장 간단!)

서버 코드를 이미 수정했으므로, Railway에서 서버를 재시작하면 **자동으로 데이터베이스 테이블이 생성**됩니다!

### 단계:
1. Railway 대시보드 열기: https://railway.app
2. **captivating-passion** 프로젝트 선택
3. **Sudam PVP** 서비스 클릭
4. **Settings** 탭 클릭
5. 맨 아래 **"Restart"** 버튼 클릭
6. 또는 **Deployments** 탭 → 최신 배포 → **"Redeploy"** 클릭

서버가 재시작되면 자동으로:
- `prisma migrate deploy` 시도
- 실패하면 `prisma db push` 실행
- 모든 테이블 자동 생성!

**Deploy Logs** 탭에서 다음 메시지를 확인하세요:
```
Setting up database schema...
Database schema pushed successfully
Database setup completed
> Ready on http://0.0.0.0:PORT
```

## 방법 2: Railway 대시보드에서 직접 명령 실행

1. Railway 대시보드 → **Sudam PVP** 서비스
2. **Deployments** 탭 → 최신 배포 클릭
3. 상단 메뉴에서 **"Shell"** 또는 **"Run Command"** 찾기
   - 없으면 **"View Logs"** 옆에 있을 수 있습니다
4. 다음 명령 실행:
   ```
   npx prisma db push --accept-data-loss
   ```
5. 그 다음:
   ```
   npx prisma generate
   ```

## 확인

Railway 대시보드 → **Postgres** 서비스 → **Database** → **Data** 탭에서 다음 테이블 확인:
- ✅ User
- ✅ Game
- ✅ Rating
- ✅ Session
- ✅ Spectator
- ✅ AIProgress

## 관리자 계정 생성

테이블 생성 후, Railway 대시보드에서:
1. **Sudam PVP** 서비스 → **Shell** 또는 **Run Command**
2. 다음 명령 실행:
   ```
   npx tsx scripts/create-admin.ts
   ```

**추천: 방법 1 (서버 재시작)이 가장 간단하고 확실합니다!**

