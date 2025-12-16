# 빌드 실패 수정

## 문제
빌드 단계에서 `prisma db push`를 실행하려고 했지만, 빌드 단계에서는 데이터베이스에 접근할 수 없습니다.
- `postgres.railway.internal:5432`는 Railway의 내부 네트워크 주소
- 빌드 단계에서는 이 주소에 접근할 수 없음

## 해결책

빌드 단계에서 `db push`를 제거하고, **런타임에서만** 실행하도록 수정했습니다.

### 변경 사항:
1. ✅ `.nixpacks.toml`: 빌드 단계에서 `db push` 제거
2. ✅ `package.json`: `postbuild`에서 `db push` 제거
3. ✅ `server.ts`: 런타임에서 `db push` 실행 (이미 구현됨)

## 다음 단계

### 1. 코드 푸시
Cursor에서:
1. Source Control 탭 (Ctrl+Shift+G)
2. 변경된 파일 스테이징:
   - `.nixpacks.toml`
   - `package.json`
3. 커밋: "Remove db push from build step, run at runtime only"
4. 푸시

### 2. Railway 재배포
코드가 푸시되면 Railway가 자동으로 재배포합니다.

### 3. 배포 로그 확인
**Deploy Logs**에서 다음 메시지 확인:
```
=== Setting up database schema ===
Step 2: Pushing database schema (this will create all tables)...
✅ Database schema pushed successfully
=== Database setup completed ===
```

### 4. 테이블 확인
Railway 대시보드 → **Postgres** → **Database** → **Data** 탭에서 테이블 확인:
- ✅ User
- ✅ Game
- ✅ Rating
- ✅ Session
- ✅ Spectator
- ✅ AIProgress

## 설명

- **빌드 단계**: 코드 컴파일 및 Prisma Client 생성만 수행
- **런타임 단계**: 서버 시작 시 데이터베이스 스키마 적용 (`server.ts`에서 실행)

이제 빌드가 성공하고, 런타임에서 테이블이 생성됩니다!

