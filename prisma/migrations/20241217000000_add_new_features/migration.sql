-- Add new fields to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "gold" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "gameTickets" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastTicketRecovery" TIMESTAMP(3);

-- Create GameRequestStatus enum
DO $$ BEGIN
 CREATE TYPE "GameRequestStatus" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'MODIFIED', 'CANCELLED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Create GameRequest table
CREATE TABLE IF NOT EXISTS "GameRequest" (
  "id" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "receiverId" TEXT NOT NULL,
  "gameType" TEXT NOT NULL,
  "boardSize" INTEGER NOT NULL,
  "timeLimit" INTEGER NOT NULL DEFAULT 1800,
  "status" "GameRequestStatus" NOT NULL DEFAULT 'PENDING',
  "modifiedConditions" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  CONSTRAINT "GameRequest_pkey" PRIMARY KEY ("id")
);

-- Create GameRequest indexes
CREATE INDEX IF NOT EXISTS "GameRequest_senderId_idx" ON "GameRequest"("senderId");
CREATE INDEX IF NOT EXISTS "GameRequest_receiverId_status_idx" ON "GameRequest"("receiverId", "status");

-- Add foreign keys for GameRequest
ALTER TABLE "GameRequest" ADD CONSTRAINT "GameRequest_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameRequest" ADD CONSTRAINT "GameRequest_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create GameStats table
CREATE TABLE IF NOT EXISTS "GameStats" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "gameType" TEXT NOT NULL,
  "mode" "GameMode" NOT NULL,
  "wins" INTEGER NOT NULL DEFAULT 0,
  "losses" INTEGER NOT NULL DEFAULT 0,
  "draws" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GameStats_pkey" PRIMARY KEY ("id")
);

-- Create GameStats indexes
CREATE UNIQUE INDEX IF NOT EXISTS "GameStats_userId_gameType_key" ON "GameStats"("userId", "gameType");
CREATE INDEX IF NOT EXISTS "GameStats_userId_idx" ON "GameStats"("userId");

-- Add foreign key for GameStats
ALTER TABLE "GameStats" ADD CONSTRAINT "GameStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create ChatType enum
DO $$ BEGIN
 CREATE TYPE "ChatType" AS ENUM('GLOBAL', 'GAME');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Create ChatMessage table
CREATE TABLE IF NOT EXISTS "ChatMessage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "gameId" TEXT,
  "type" "ChatType" NOT NULL DEFAULT 'GLOBAL',
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- Create ChatMessage indexes
CREATE INDEX IF NOT EXISTS "ChatMessage_type_createdAt_idx" ON "ChatMessage"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "ChatMessage_gameId_createdAt_idx" ON "ChatMessage"("gameId", "createdAt");

-- Add foreign keys for ChatMessage
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create RankingMatchQueue table
CREATE TABLE IF NOT EXISTS "RankingMatchQueue" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "gameType" TEXT NOT NULL,
  "boardSize" INTEGER NOT NULL,
  "rating" INTEGER NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RankingMatchQueue_pkey" PRIMARY KEY ("id")
);

-- Create RankingMatchQueue indexes
CREATE UNIQUE INDEX IF NOT EXISTS "RankingMatchQueue_userId_key" ON "RankingMatchQueue"("userId");
CREATE INDEX IF NOT EXISTS "RankingMatchQueue_gameType_boardSize_rating_idx" ON "RankingMatchQueue"("gameType", "boardSize", "rating");
CREATE INDEX IF NOT EXISTS "RankingMatchQueue_joinedAt_idx" ON "RankingMatchQueue"("joinedAt");

-- Add foreign key for RankingMatchQueue
ALTER TABLE "RankingMatchQueue" ADD CONSTRAINT "RankingMatchQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

