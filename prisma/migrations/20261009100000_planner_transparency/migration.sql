-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "postponedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Habit" ADD COLUMN     "categoryId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "delegatedTo" TEXT,
ADD COLUMN     "handledPostponements" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "postponements" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CategoryBudget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weeklyMinutes" INTEGER NOT NULL,
    "preferredWindow" "PreferredWindow" NOT NULL DEFAULT 'ANY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CategoryBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanRevision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "undoneAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "preferredWindow" "PreferredWindow",
    "taskId" TEXT,
    "habitId" TEXT,
    "suggestedMinutes" INTEGER,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlanFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayCheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "mood" TEXT NOT NULL,
    "note" TEXT,
    "resolved" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DayCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryBudget_id_userId_key" ON "CategoryBudget"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryBudget_userId_name_key" ON "CategoryBudget"("userId", "name");

-- CreateIndex
CREATE INDEX "PlanRevision_userId_date_createdAt_idx" ON "PlanRevision"("userId", "date", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlanFeedback_userId_date_reason_key" ON "PlanFeedback"("userId", "date", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "DayCheckIn_userId_date_key" ON "DayCheckIn"("userId", "date");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "CategoryBudget"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "CategoryBudget"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "CategoryBudget"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryBudget" ADD CONSTRAINT "CategoryBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanRevision" ADD CONSTRAINT "PlanRevision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanFeedback" ADD CONSTRAINT "PlanFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayCheckIn" ADD CONSTRAINT "DayCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CategoryBudget" ADD CONSTRAINT "CategoryBudget_valid" CHECK ("weeklyMinutes" BETWEEN 5 AND 10080 AND length(trim("name")) BETWEEN 1 AND 80);
ALTER TABLE "Task" ADD CONSTRAINT "Task_postponements_valid" CHECK ("postponements" >= 0 AND "handledPostponements" BETWEEN 0 AND "postponements");
ALTER TABLE "PlanFeedback" ADD CONSTRAINT "PlanFeedback_valid" CHECK ("reason" IN ('OVERLOADED','BAD_TIME','ESTIMATE') AND ("suggestedMinutes" IS NULL OR "suggestedMinutes" BETWEEN 5 AND 480));
ALTER TABLE "DayCheckIn" ADD CONSTRAINT "DayCheckIn_valid" CHECK ("mood" IN ('OK','BUSY','DIFFICULT') AND "resolved" >= 0);
