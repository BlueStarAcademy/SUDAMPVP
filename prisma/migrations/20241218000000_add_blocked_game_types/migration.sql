-- Add blockedGameTypes field to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "blockedGameTypes" JSONB;

