# Railway 404 오류 해결 방법

## 문제
Railway에서 "Not Found" 오류가 발생합니다.

## 확인 사항

### 1. 빌드가 성공했는지 확인
1. Railway 대시보드 → **Sudam PVP** 서비스
2. **Deployments** 탭 확인
3. 최신 배포가 **성공(Success)** 상태인지 확인
4. 빌드 로그에서 오류가 없는지 확인

### 2. 서버가 실행 중인지 확인
1. **Deployments** 탭 → 최신 배포 클릭
2. **Deploy Logs** 탭 확인
3. 다음 메시지가 보이는지 확인:
   ```
   > Ready on http://0.0.0.0:PORT
   > Socket.io server initialized
   ```
4. 오류 메시지가 있는지 확인

### 3. 환경 변수 확인
Railway 대시보드 → **Sudam PVP** → **Variables** 탭에서 다음 확인:

**필수 환경 변수:**
- `DATABASE_URL` - Postgres 연결 문자열
- `JWT_SECRET` - JWT 시크릿 키
- `NEXT_PUBLIC_APP_URL` - 앱 URL (Railway 도메인)
- `NEXT_PUBLIC_SOCKET_URL` - Socket.io URL (Railway 도메인)

**설정 방법:**
```
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=your-secret-key-here
NEXT_PUBLIC_APP_URL=${{RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_SOCKET_URL=${{RAILWAY_PUBLIC_DOMAIN}}
```

### 4. 포트 설정 확인
Railway는 자동으로 포트를 할당합니다. `server.ts`에서 `process.env.PORT`를 사용하도록 설정되어 있으므로 추가 설정 불필요합니다.

### 5. 데이터베이스 마이그레이션 확인
서버가 시작되려면 데이터베이스 마이그레이션이 필요할 수 있습니다:

1. Railway 대시보드 → **Sudam PVP** 서비스
2. **Deployments** 탭 → 최신 배포
3. **Shell** 탭 또는 **Run Command** 사용
4. 다음 명령 실행:
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

### 6. Next.js 빌드 확인
빌드가 제대로 완료되었는지 확인:

1. **Deployments** → 최신 배포 → **Build Logs**
2. 다음 메시지 확인:
   ```
   ✓ Compiled successfully
   ✓ Finished TypeScript
   ✓ Collecting page data
   ✓ Generating static pages
   ```

## 일반적인 해결 방법

### 방법 1: 서비스 재배포
1. **Deployments** 탭
2. **Redeploy** 클릭
3. 배포 완료까지 대기

### 방법 2: 환경 변수 재설정
1. **Variables** 탭
2. 모든 환경 변수 확인
3. `NEXT_PUBLIC_APP_URL`과 `NEXT_PUBLIC_SOCKET_URL`이 올바른 도메인으로 설정되어 있는지 확인
4. 저장 후 재배포

### 방법 3: 로그 확인 및 오류 해결
1. **Deploy Logs** 확인
2. 오류 메시지 확인
3. 오류에 따라 수정:
   - 데이터베이스 연결 오류 → `DATABASE_URL` 확인
   - 포트 오류 → Railway가 자동 할당하므로 문제 없어야 함
   - 빌드 오류 → 빌드 로그 확인

## 확인 체크리스트

- [ ] 빌드가 성공적으로 완료됨
- [ ] 서버가 시작되었음 (로그에서 확인)
- [ ] `DATABASE_URL` 환경 변수 설정됨
- [ ] `JWT_SECRET` 환경 변수 설정됨
- [ ] `NEXT_PUBLIC_APP_URL` 환경 변수 설정됨
- [ ] `NEXT_PUBLIC_SOCKET_URL` 환경 변수 설정됨
- [ ] 데이터베이스 마이그레이션 실행됨
- [ ] 포트가 올바르게 할당됨

## 추가 디버깅

Railway 대시보드에서 **Deploy Logs**를 확인하여 정확한 오류 메시지를 찾아보세요. 오류 메시지를 공유해주시면 더 정확한 해결책을 제시할 수 있습니다.

