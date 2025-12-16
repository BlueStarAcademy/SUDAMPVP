# Railway 데이터베이스 마이그레이션 가이드

## 방법 1: Railway CLI 사용 (권장)

### Railway CLI 설치
```bash
npm install -g @railway/cli
```

### 로그인 및 프로젝트 연결
```bash
railway login
railway link
```

### 마이그레이션 실행
```bash
railway run npx prisma migrate deploy
railway run npx prisma generate
```

## 방법 2: 배포 후 스크립트로 자동 실행

`package.json`에 postinstall 스크립트를 추가하여 배포 후 자동으로 마이그레이션을 실행할 수 있습니다:

```json
{
  "scripts": {
    "postinstall": "prisma generate",
    "postbuild": "prisma migrate deploy"
  }
}
```

하지만 이 방법은 빌드 시간이 길어질 수 있습니다.

## 방법 3: Railway 대시보드에서 직접 실행

Railway 대시보드의 UI가 변경되었을 수 있습니다. 다음 위치를 확인해보세요:

1. **Sudam PVP** 서비스 → **Settings** 탭
2. **Deploy** 섹션 확인
3. **Run Command** 또는 **Execute Command** 옵션 확인
4. 또는 **Metrics** 탭에서 **Shell** 옵션 확인

## 방법 4: 배포 스크립트 수정

`server.ts` 파일을 수정하여 서버 시작 전에 자동으로 마이그레이션을 실행하도록 할 수 있습니다:

```typescript
// server.ts 시작 부분에 추가
import { execSync } from 'child_process';

// 프로덕션 환경에서만 마이그레이션 실행
if (process.env.NODE_ENV === 'production') {
  try {
    console.log('Running database migrations...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('Database migrations completed');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}
```

## 방법 5: Railway의 Deploy Hook 사용

Railway 대시보드에서:
1. **Sudam PVP** 서비스 → **Settings**
2. **Deploy** 섹션 확인
3. **Post Deploy Command** 또는 **Deploy Hook** 옵션 확인
4. 다음 명령 추가:
   ```
   npx prisma migrate deploy && npx prisma generate
   ```

## 확인 방법

마이그레이션이 실행되었는지 확인:
1. Railway 대시보드 → **Postgres** 서비스
2. **Data** 또는 **Query** 탭에서 테이블 확인
3. 다음 테이블이 있는지 확인:
   - `User`
   - `Game`
   - `Rating`
   - `Session`
   - `Spectator`
   - `AIProgress`

## 주의사항

- 마이그레이션은 프로덕션 데이터베이스에 직접 영향을 미칩니다
- 마이그레이션 실행 전에 데이터베이스 백업을 권장합니다
- 첫 배포 시에만 필요할 수 있습니다

