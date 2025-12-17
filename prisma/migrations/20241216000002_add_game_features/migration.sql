-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "nickname" TEXT,
ADD COLUMN IF NOT EXISTS "avatarId" TEXT,
ADD COLUMN IF NOT EXISTS "hasCompletedSetup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "status" "UserStatus" NOT NULL DEFAULT 'WAITING';

-- CreateEnum
DO $$ BEGIN
 CREATE TYPE "UserStatus" AS ENUM('PLAYING', 'RESTING', 'WAITING', 'SPECTATING');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "gameType" TEXT,
ADD COLUMN IF NOT EXISTS "boardSize" INTEGER,
ADD COLUMN IF NOT EXISTS "gameRules" JSONB;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Game_gameType_idx" ON "Game"("gameType");

-- CreateIndex (nickname unique는 이미 있으면 생성 안 함)
DO $$ BEGIN
 CREATE UNIQUE INDEX IF NOT EXISTS "User_nickname_key" ON "User"("nickname");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

