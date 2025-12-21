# 로컬 개발 환경 빠른 설정 스크립트 (PowerShell)
# SQLite를 사용하여 별도 설치 없이 바로 개발 가능

Write-Host "=== SUDAM 로컬 개발 환경 설정 ===" -ForegroundColor Green
Write-Host ""

# 1. SQLite 스키마로 변경
Write-Host "1. SQLite 스키마 설정 중..." -ForegroundColor Yellow
if (Test-Path "prisma/schema.local.prisma") {
    Copy-Item "prisma/schema.local.prisma" "prisma/schema.prisma" -Force
    Write-Host "   ✓ SQLite 스키마로 변경 완료" -ForegroundColor Green
} else {
    Write-Host "   ✗ schema.local.prisma 파일을 찾을 수 없습니다" -ForegroundColor Red
    exit 1
}

# 2. .env 파일에 SQLite 설정 추가
Write-Host "2. .env 파일 설정 중..." -ForegroundColor Yellow
$envContent = @"
# Server Configuration
PORT=3000
NODE_ENV=development

# Database (SQLite - 로컬 개발용, 별도 설치 불필요)
DATABASE_URL=file:./dev.db

# Redis (선택사항 - 없어도 메모리 스토어로 동작)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Session
SESSION_SECRET=local-dev-secret-key-change-in-production

# AI Engines (로컬 개발 시 선택사항)
# AI_MODE: 'demo' (데모 모드, 그누고 없이 동작) 또는 'gnugo' (그누고 사용, 기본값)
AI_MODE=demo
GNUGO_PATH=gnugo
KATAGO_PATH=katago
"@

$envContent | Out-File -FilePath ".env" -Encoding utf8 -Force
Write-Host "   ✓ .env 파일 설정 완료" -ForegroundColor Green

# 3. 의존성 설치 확인
Write-Host "3. 의존성 확인 중..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Write-Host "   ✓ node_modules 존재" -ForegroundColor Green
} else {
    Write-Host "   npm install 실행 중..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ 의존성 설치 완료" -ForegroundColor Green
    } else {
        Write-Host "   ✗ 의존성 설치 실패" -ForegroundColor Red
        exit 1
    }
}

# 4. Prisma 클라이언트 생성
Write-Host "4. Prisma 클라이언트 생성 중..." -ForegroundColor Yellow
npm run prisma:generate
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Prisma 클라이언트 생성 완료" -ForegroundColor Green
} else {
    Write-Host "   ✗ Prisma 클라이언트 생성 실패" -ForegroundColor Red
    exit 1
}

# 5. 데이터베이스 마이그레이션 (비대화형)
Write-Host "5. 데이터베이스 마이그레이션 중..." -ForegroundColor Yellow
# prisma db push는 마이그레이션 파일 없이 스키마를 직접 적용 (로컬 개발용)
npx prisma db push --accept-data-loss
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ 데이터베이스 마이그레이션 완료" -ForegroundColor Green
} else {
    Write-Host "   ✗ 데이터베이스 마이그레이션 실패" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== 설정 완료! ===" -ForegroundColor Green
Write-Host ""
Write-Host "이제 다음 명령으로 서버를 실행하세요:" -ForegroundColor Cyan
Write-Host "  npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "브라우저에서 http://localhost:3000 접속" -ForegroundColor Cyan
Write-Host ""

