-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "recoveryMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Habit" ADD COLUMN     "frequencyMode" TEXT NOT NULL DEFAULT 'DAYS',
ADD COLUMN     "weeklyTarget" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "availableFrom" DATE,
ADD COLUMN     "periodStart" DATE,
ADD COLUMN     "seriesId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "longBlockMinutes" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "recoveryMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "slackPercent" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DayOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "startTime" TEXT,
    "endTime" TEXT,
    "capacityPercent" INTEGER NOT NULL DEFAULT 100,
    "essentialOnly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DayOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSeries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "preferredWindow" "PreferredWindow" NOT NULL DEFAULT 'ANY',
    "energy" TEXT NOT NULL DEFAULT 'LIGHT',
    "frequency" TEXT NOT NULL,
    "anchorDate" DATE NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 7,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TaskSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateUse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "TemplateUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DayOverride_userId_date_key" ON "DayOverride"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TaskSeries_id_userId_key" ON "TaskSeries"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateUse_userId_key_date_key" ON "TemplateUse"("userId", "key", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Task_seriesId_periodStart_key" ON "Task"("seriesId", "periodStart");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_seriesId_userId_fkey" FOREIGN KEY ("seriesId", "userId") REFERENCES "TaskSeries"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayOverride" ADD CONSTRAINT "DayOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSeries" ADD CONSTRAINT "TaskSeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateUse" ADD CONSTRAINT "TemplateUse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_capacity" CHECK ("slackPercent" BETWEEN 0 AND 50 AND "longBlockMinutes" BETWEEN 30 AND 240 AND "recoveryMinutes" BETWEEN 0 AND 60);
ALTER TABLE "Event" ADD CONSTRAINT "Event_recovery" CHECK ("recoveryMinutes" BETWEEN 0 AND 60);
ALTER TABLE "Habit" DROP CONSTRAINT "Habit_days";
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_frequency" CHECK (("frequencyMode" = 'DAYS' AND cardinality("daysOfWeek") > 0 AND "daysOfWeek" <@ ARRAY[0,1,2,3,4,5,6]) OR ("frequencyMode" = 'WEEKLY' AND "weeklyTarget" BETWEEN 1 AND 7));
ALTER TABLE "DayOverride" ADD CONSTRAINT "DayOverride_valid" CHECK ("capacityPercent" BETWEEN 10 AND 100 AND (("startTime" IS NULL AND "endTime" IS NULL) OR ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "startTime" < "endTime")));
ALTER TABLE "TaskSeries" ADD CONSTRAINT "TaskSeries_valid" CHECK (frequency IN ('WEEKLY','MONTHLY') AND "windowDays" BETWEEN 1 AND CASE WHEN frequency = 'WEEKLY' THEN 7 ELSE 31 END AND "durationMinutes" BETWEEN 5 AND 480 AND priority BETWEEN 1 AND 3 AND energy IN ('LIGHT','DEEP'));
ALTER TABLE "Task" ADD CONSTRAINT "Task_period" CHECK (("seriesId" IS NULL AND "periodStart" IS NULL) OR ("seriesId" IS NOT NULL AND "periodStart" IS NOT NULL AND "availableFrom" IS NOT NULL AND "dueDate" >= "availableFrom"));
