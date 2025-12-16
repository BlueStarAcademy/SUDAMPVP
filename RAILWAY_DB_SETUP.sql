-- Railway 데이터베이스 수동 설정 SQL
-- Railway Postgres 서비스의 Data 탭에서 이 SQL을 실행하세요

-- 1. 실패한 마이그레이션 해결 (있는 경우)
-- _prisma_migrations 테이블에서 실패한 마이그레이션 확인
SELECT * FROM "_prisma_migrations" WHERE finished_at IS NULL;

-- 실패한 마이그레이션을 해결된 것으로 표시 (있는 경우)
-- UPDATE "_prisma_migrations" SET finished_at = NOW(), rolled_back_at = NULL WHERE migration_name = '20241216000000_init' AND finished_at IS NULL;

-- 2. UserRole enum 생성 (없는 경우)
DO $$ BEGIN
    CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. 모든 테이블 생성 (초기 마이그레이션)
CREATE SCHEMA IF NOT EXISTS "public";

-- GameMode enum
DO $$ BEGIN
    CREATE TYPE "GameMode" AS ENUM ('STRATEGY', 'PLAY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- GameStatus enum
DO $$ BEGIN
    CREATE TYPE "GameStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'FINISHED', 'ABANDONED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- GameResult enum
DO $$ BEGIN
    CREATE TYPE "GameResult" AS ENUM ('PLAYER1_WIN', 'PLAYER2_WIN', 'DRAW', 'TIMEOUT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- User 테이블 생성
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- User 인덱스 생성
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");

-- Game 테이블 생성
CREATE TABLE IF NOT EXISTS "Game" (
    "id" TEXT NOT NULL,
    "mode" "GameMode" NOT NULL,
    "season" INTEGER NOT NULL,
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT,
    "aiType" TEXT,
    "aiLevel" INTEGER,
    "status" "GameStatus" NOT NULL DEFAULT 'WAITING',
    "moves" JSONB NOT NULL DEFAULT '[]',
    "boardState" JSONB,
    "timeLimit" INTEGER NOT NULL,
    "player1Time" INTEGER NOT NULL,
    "player2Time" INTEGER,
    "currentPlayer" INTEGER NOT NULL DEFAULT 1,
    "winnerId" TEXT,
    "result" "GameResult",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- Game 인덱스 생성
CREATE INDEX IF NOT EXISTS "Game_status_idx" ON "Game"("status");
CREATE INDEX IF NOT EXISTS "Game_season_mode_idx" ON "Game"("season", "mode");

-- Rating 테이블 생성
CREATE TABLE IF NOT EXISTS "Rating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "mode" "GameMode" NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1500,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- Rating 인덱스 생성
CREATE UNIQUE INDEX IF NOT EXISTS "Rating_userId_season_mode_key" ON "Rating"("userId", "season", "mode");
CREATE INDEX IF NOT EXISTS "Rating_season_mode_rating_idx" ON "Rating"("season", "mode", "rating");

-- Session 테이블 생성
CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "socketId" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT true,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- Session 인덱스 생성
CREATE UNIQUE INDEX IF NOT EXISTS "Session_socketId_key" ON "Session"("socketId");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "Session_isOnline_idx" ON "Session"("isOnline");

-- Spectator 테이블 생성
CREATE TABLE IF NOT EXISTS "Spectator" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Spectator_pkey" PRIMARY KEY ("id")
);

-- Spectator 인덱스 생성
CREATE UNIQUE INDEX IF NOT EXISTS "Spectator_gameId_userId_key" ON "Spectator"("gameId", "userId");
CREATE INDEX IF NOT EXISTS "Spectator_gameId_idx" ON "Spectator"("gameId");

-- AIProgress 테이블 생성
CREATE TABLE IF NOT EXISTS "AIProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentLevel" INTEGER NOT NULL DEFAULT 1,
    "highestLevel" INTEGER NOT NULL DEFAULT 1,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AIProgress_pkey" PRIMARY KEY ("id")
);

-- AIProgress 인덱스 생성
CREATE UNIQUE INDEX IF NOT EXISTS "AIProgress_userId_key" ON "AIProgress"("userId");
CREATE INDEX IF NOT EXISTS "AIProgress_userId_idx" ON "AIProgress"("userId");

-- 외래 키 생성
DO $$ BEGIN
    ALTER TABLE "Game" ADD CONSTRAINT "Game_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Game" ADD CONSTRAINT "Game_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Spectator" ADD CONSTRAINT "Spectator_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Spectator" ADD CONSTRAINT "Spectator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "AIProgress" ADD CONSTRAINT "AIProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 마이그레이션 기록 업데이트
INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES 
    ('20241216000000_init', 'checksum_placeholder', NOW(), '20241216000000_init', NULL, NULL, NOW(), 1),
    ('20241216000001_add_admin_role', 'checksum_placeholder', NOW(), '20241216000001_add_admin_role', NULL, NULL, NOW(), 1)
ON CONFLICT (id) DO NOTHING;

-- 확인: 생성된 테이블 목록
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

