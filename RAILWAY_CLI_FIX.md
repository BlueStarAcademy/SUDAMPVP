# Railway CLI 문제 해결

## 문제
Railway CLI 명령어 실행 시 Ctrl+C가 안 먹히거나 터미널이 멈춤

## 해결 방법

### 1. 터미널 강제 종료
- PowerShell: `Ctrl+C` 여러 번 누르기
- 또는 터미널 창 닫기
- VS Code 터미널: 새 터미널 열기 (Ctrl+Shift+`)

### 2. Railway CLI 명령어 다시 실행

새 터미널에서:
```bash
# 먼저 연결 확인
railway link
# > Select a service: Sudam PVP

# 그 다음 db push 실행
railway run npx prisma db push --accept-data-loss
```

### 3. 대안: Railway 대시보드에서 직접 확인

Railway CLI가 계속 문제가 있다면:
1. Railway 대시보드 → **Sudam PVP** 서비스
2. **Deployments** 탭 → **최신 배포** 클릭
3. **Deploy Logs** 확인
4. 새 코드가 배포되었다면 자동으로 테이블이 생성되었을 것입니다

### 4. 수동 재배포

1. Railway 대시보드 → **Sudam PVP** 서비스
2. **Deployments** 탭
3. **Redeploy** 버튼 클릭
4. 빌드 로그와 배포 로그 확인

## 확인 방법

Railway 대시보드 → **Postgres** → **Database** → **Data** 탭에서 테이블 확인:
- ✅ User
- ✅ Game
- ✅ Rating
- ✅ Session
- ✅ Spectator
- ✅ AIProgress

