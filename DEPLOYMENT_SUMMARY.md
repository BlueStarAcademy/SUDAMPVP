# 배포 및 구현 요약

## 구현 완료 사항

### 1. GnuGo 단계별 난이도 시스템 ✅
- **단계**: 1-10단계 난이도 설정
- **진행도 추적**: `AIProgress` 모델로 사용자 진행도 관리
- **레벨업 시스템**: 현재 레벨에서 승리 시 다음 단계로 진행
- **대기실 UI**: 10개 단계 버튼으로 선택 가능

### 2. KataGo 계가 및 힌트 기능 ✅
- **계가 기능**: `/api/ai/score` 엔드포인트
- **힌트 기능**: `/api/ai/hint` 엔드포인트
- **게임 페이지**: 힌트 및 계가 버튼 추가
- **대결 제외**: KataGo는 대결에 사용하지 않음

### 3. Railway 배포 설정 ✅
- **배포 파일**: `railway.json`, `Procfile`, `.nixpacks.toml`, `railway.toml`
- **서버 설정**: `server.ts`에서 Railway 포트 및 호스트 설정
- **배포 가이드**: `RAILWAY_DEPLOY.md` 작성

## 데이터베이스 변경사항

### 새로운 모델: AIProgress
```prisma
model AIProgress {
  id            String   @id @default(cuid())
  userId        String   @unique
  currentLevel  Int      @default(1) // 1-10 단계
  highestLevel  Int      @default(1)
  wins          Int      @default(0)
  losses        Int      @default(0)
  updatedAt     DateTime @updatedAt
}
```

### Game 모델 변경
- `aiLevel` 필드 추가 (GnuGo 난이도 1-10)

## API 변경사항

### 게임 생성 (`/api/game/create`)
- `aiLevel` 파라미터 추가
- 사용자 현재 레벨 자동 적용

### AI 이동 (`/api/ai/move`)
- KataGo 제거, GnuGo만 사용
- `aiLevel` 파라미터 사용

### 새로운 API
- `/api/ai/hint` - KataGo 힌트 제공
- `/api/ai/score` - KataGo 계가 (기존)

## 다음 단계

1. **데이터베이스 마이그레이션 실행**:
   ```bash
   npx prisma migrate dev --name add_ai_progress
   npx prisma generate
   ```

2. **Railway 배포**:
   - `RAILWAY_DEPLOY.md` 참조
   - 환경 변수 설정
   - PostgreSQL 데이터베이스 연결

3. **테스트**:
   - GnuGo 단계별 대결 테스트
   - KataGo 힌트 및 계가 테스트
   - 레벨업 시스템 테스트

## 주의사항

- GnuGo 서버는 난이도 레벨(1-10)을 지원해야 합니다
- KataGo 서버는 계가 및 힌트 기능을 제공해야 합니다
- Railway 배포 시 모든 환경 변수를 설정해야 합니다

