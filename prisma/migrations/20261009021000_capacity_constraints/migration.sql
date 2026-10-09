ALTER TABLE "DayOverride" DROP CONSTRAINT "DayOverride_valid";
ALTER TABLE "DayOverride" ADD CONSTRAINT "DayOverride_valid" CHECK ("capacityPercent" BETWEEN 10 AND 100 AND (("startTime" IS NULL AND "endTime" IS NULL) OR ("startTime" IS NOT NULL AND "endTime" IS NOT NULL AND "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "startTime" < "endTime")));
ALTER TABLE "Task" DROP CONSTRAINT "Task_period";
ALTER TABLE "Task" ADD CONSTRAINT "Task_period" CHECK (("seriesId" IS NULL AND "periodStart" IS NULL) OR ("seriesId" IS NOT NULL AND "periodStart" IS NOT NULL AND "availableFrom" IS NOT NULL AND "dueDate" IS NOT NULL AND "dueDate" >= "availableFrom"));
