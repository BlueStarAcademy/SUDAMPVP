# Railway 데이터베이스 연결 문제 해결

## 문제
`railway run` 명령이 내부 네트워크 주소(`postgres.railway.internal:5432`)를 사용하여 로컬에서 연결할 수 없습니다.

## 해결 방법

### 방법 1: Railway Postgres 서비스의 외부 연결 정보 사용

1. Railway 대시보드 → **Postgres** 서비스
2. **Database** 탭 → **Credentials** 서브탭
3. **Connection String** 또는 **External Connection** 정보 복사
4. 로컬 `.env` 파일에 추가:

```env
DATABASE_URL="postgresql://user:password@host.railway.app:port/railway"
```

5. 로컬에서 직접 실행:

```bash
npx prisma db push --accept-data-loss
npx prisma generate
```

### 방법 2: Railway의 Postgres 서비스에 직접 연결

```bash
# Postgres 서비스에 연결
railway connect postgres

# 연결되면 psql 프롬프트에서:
\dt  # 테이블 목록 확인

# 또는 Railway CLI로 SQL 실행
railway run --service Postgres psql -c "SELECT version();"
```

### 방법 3: Sudam PVP 서비스에서 실행 (내부 네트워크 사용)

```bash
# Sudam PVP 서비스에 연결
railway link
# > Select a service: Sudam PVP

# 서비스 내부에서 실행 (내부 네트워크 사용 가능)
railway run --service "Sudam PVP" npx prisma db push --accept-data-loss
railway run --service "Sudam PVP" npx prisma generate
```

### 방법 4: Railway 대시보드에서 직접 실행

1. Railway 대시보드 → **Sudam PVP** 서비스
2. **Deployments** 탭 → 최신 배포 클릭
3. **Shell** 탭 또는 **Run Command** 옵션 찾기
4. 다음 명령 실행:

```bash
npx prisma db push --accept-data-loss
npx prisma generate
```

## 권장 방법

**방법 3**이 가장 확실합니다. Sudam PVP 서비스 내부에서 실행하면 Railway의 내부 네트워크를 통해 Postgres에 접근할 수 있습니다.

