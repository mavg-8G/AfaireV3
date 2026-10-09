ALTER TABLE "Task" ADD COLUMN "learningMatch" TEXT NOT NULL DEFAULT 'TITLE', ADD COLUMN "learningKey" TEXT;
ALTER TABLE "Task" ADD CONSTRAINT "Task_learning_match_check" CHECK ("learningMatch" IN ('TITLE', 'TEMPLATE', 'CATEGORY') AND ("learningMatch" <> 'TEMPLATE' OR length(trim("learningKey")) > 0 AND "learningKey" IS NOT NULL) AND ("learningMatch" <> 'CATEGORY' OR "categoryId" IS NOT NULL));
ALTER TABLE "DayPlan" ADD COLUMN "generationCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "generationTotalMs" DOUBLE PRECISION NOT NULL DEFAULT 0, ADD COLUMN "unscheduledTaskCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WorkerRun" ADD COLUMN "pushSent" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "pushFailed" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "pushExpired" INTEGER NOT NULL DEFAULT 0;
