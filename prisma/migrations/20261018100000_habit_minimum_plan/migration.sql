-- Optional minimum version and if-then plan per habit; habit blocks record whether only the minimum was done.
ALTER TABLE "Habit" ADD COLUMN "minimumVersion" TEXT;
ALTER TABLE "Habit" ADD COLUMN "plan" TEXT;
ALTER TABLE "Event" ADD COLUMN "minimal" BOOLEAN NOT NULL DEFAULT false;
