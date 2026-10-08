-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adaptiveDurations" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "focusWindow" TEXT NOT NULL DEFAULT 'MORNING';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "actualMinutes" INTEGER,
ADD COLUMN     "estimatedMinutes" INTEGER,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "recurrenceDate" DATE,
ADD COLUMN     "seriesId" TEXT,
ADD COLUMN     "startedAt" TIMESTAMPTZ(3),
ADD COLUMN     "travelMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "energy" TEXT NOT NULL DEFAULT 'LIGHT';

-- CreateTable
CREATE TABLE "EventSeries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "location" TEXT,
    "travelMinutes" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "weekdays" INTEGER[],
    "startDate" DATE NOT NULL,
    "until" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "endDayOffset" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "userId" TEXT NOT NULL,
    "upcoming" BOOLEAN NOT NULL DEFAULT true,
    "leadMinutes" INTEGER NOT NULL DEFAULT 10,
    "dailySummary" BOOLEAN NOT NULL DEFAULT true,
    "summaryTime" TEXT NOT NULL DEFAULT '08:00',
    "dueTomorrow" BOOLEAN NOT NULL DEFAULT true,
    "dueTime" TEXT NOT NULL DEFAULT '18:00',

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDelivery" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "attemptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "PushDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerRun" (
    "retryAt" TIMESTAMPTZ(3),
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "attemptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventSeries_id_userId_key" ON "EventSeries"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "PushDelivery_subscriptionId_key_key" ON "PushDelivery"("subscriptionId", "key");

-- CreateIndex
CREATE INDEX "WorkerRun_userId_attemptedAt_idx" ON "WorkerRun"("userId", "attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_seriesId_recurrenceDate_key" ON "Event"("seriesId", "recurrenceDate");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_seriesId_userId_fkey" FOREIGN KEY ("seriesId", "userId") REFERENCES "EventSeries"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDelivery" ADD CONSTRAINT "PushDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerRun" ADD CONSTRAINT "WorkerRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Domain constraints and ownership complement application validation.
ALTER TABLE "Event" ADD CONSTRAINT "Event_travel" CHECK ("travelMinutes" BETWEEN 0 AND 180);
ALTER TABLE "Event" ADD CONSTRAINT "Event_actual" CHECK ("actualMinutes" IS NULL OR "actualMinutes" BETWEEN 1 AND 480);
ALTER TABLE "Event" ADD CONSTRAINT "Event_series_identity" CHECK (("seriesId" IS NULL AND "recurrenceDate" IS NULL) OR ("seriesId" IS NOT NULL AND "recurrenceDate" IS NOT NULL AND source = 'MANUAL'));
ALTER TABLE "Task" ADD CONSTRAINT "Task_energy" CHECK (energy IN ('DEEP', 'LIGHT'));
ALTER TABLE "User" ADD CONSTRAINT "User_focus" CHECK ("focusWindow" IN ('MORNING', 'AFTERNOON', 'EVENING', 'LEARNED'));
ALTER TABLE "EventSeries" ADD CONSTRAINT "EventSeries_rule" CHECK (frequency IN ('DAILY', 'WEEKLY', 'MONTHLY') AND "endDayOffset" BETWEEN 0 AND 7 AND "travelMinutes" BETWEEN 0 AND 180 AND (frequency <> 'WEEKLY' OR cardinality(weekdays) > 0) AND weekdays <@ ARRAY[0,1,2,3,4,5,6]);
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_valid" CHECK ("leadMinutes" BETWEEN 1 AND 120 AND "summaryTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "dueTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
