ALTER TABLE "Task" ADD COLUMN "splittable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "minChunk" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "TaskSeries" ADD COLUMN "splittable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "minChunk" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "User" ADD COLUMN "urgencyEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "urgencySoonDays" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "urgencyNearDays" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Event" ADD COLUMN "chunkIndex" INTEGER, ADD COLUMN "chunkCount" INTEGER;
ALTER TABLE "Task" ADD CONSTRAINT "Task_min_chunk" CHECK ("minChunk" BETWEEN 5 AND 480);
ALTER TABLE "TaskSeries" ADD CONSTRAINT "TaskSeries_min_chunk" CHECK ("minChunk" BETWEEN 5 AND 480);
ALTER TABLE "User" ADD CONSTRAINT "User_urgency_days" CHECK ("urgencyNearDays" >= 0 AND "urgencySoonDays" >= "urgencyNearDays" AND "urgencySoonDays" <= 365);
ALTER TABLE "Event" ADD CONSTRAINT "Event_chunk_identity" CHECK (
  ("chunkIndex" IS NULL AND "chunkCount" IS NULL) OR
  ("taskId" IS NOT NULL AND "chunkIndex" IS NOT NULL AND "chunkCount" IS NOT NULL AND "chunkIndex" >= 1 AND "chunkCount" >= "chunkIndex")
);
DROP INDEX "Event_one_active_task";
CREATE UNIQUE INDEX "Event_one_active_task_chunk" ON "Event" ("taskId", COALESCE("chunkIndex", 1))
  WHERE "taskId" IS NOT NULL AND status IN ('PENDING', 'IN_PROGRESS');
