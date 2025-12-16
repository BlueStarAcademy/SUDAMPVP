# 실제 해결 방법

## 문제
서버 재시작만으로는 데이터베이스 테이블이 생성되지 않았습니다.

## 해결책

코드를 수정하여 **빌드 단계에서 자동으로 데이터베이스 스키마를 적용**하도록 했습니다.

### 변경 사항:
1. `package.json`에 `postbuild` 스크립트 추가
2. `.nixpacks.toml`에 빌드 단계에 `prisma db push` 추가
3. `server.ts`에 런타임 백업 로직 개선

## 다음 단계

### 방법 1: 코드 푸시 (권장)

```bash
git add .
git commit -m "Add database setup to build process"
git push origin main
```

Railway가 자동으로 재배포하면서 빌드 단계에서 데이터베이스 테이블이 생성됩니다.

### 방법 2: Railway 대시보드에서 직접 실행

1. Railway 대시보드 → **Sudam PVP** 서비스
2. **Deployments** 탭 → 최신 배포 클릭
3. **Shell** 또는 **Run Command** 찾기
4. 다음 명령 실행:
   ```
   npx prisma db push --accept-data-loss
   ```

## 확인

빌드 로그에서 다음 메시지 확인:
```
✔ Generated Prisma Client
The database is now in sync with your schema.
```

또는 Railway 대시보드 → **Postgres** → **Database** → **Data** 탭에서 테이블 확인:
- ✅ User
- ✅ Game
- ✅ Rating
- ✅ Session
- ✅ Spectator
- ✅ AIProgress

