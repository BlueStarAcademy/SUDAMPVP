# 빠른 해결 방법

## 문제
로컬에서 `railway run`을 실행하면 내부 네트워크 주소에 접근할 수 없습니다.

## 해결: Sudam PVP 서비스 내부에서 실행

다음 명령어를 실행하세요:

```bash
# 1. Sudam PVP 서비스에 연결 (이미 했음)
railway link
# > Select a service: Sudam PVP

# 2. 서비스 내부에서 실행 (내부 네트워크 사용 가능)
railway run npx prisma db push --accept-data-loss

# 3. Prisma Client 생성
railway run npx prisma generate
```

**중요**: `railway link`로 **Sudam PVP** 서비스를 선택한 상태에서 실행해야 합니다!

## 또는 Railway 대시보드에서

1. Railway 대시보드 → **Sudam PVP** 서비스
2. **Deployments** 탭 → 최신 배포 클릭
3. **Shell** 또는 **Run Command** 찾기
4. 다음 명령 실행:
   ```
   npx prisma db push --accept-data-loss
   npx prisma generate
   ```

