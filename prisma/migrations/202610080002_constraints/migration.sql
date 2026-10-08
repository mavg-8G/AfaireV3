CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Event" ADD CONSTRAINT "Event_positive_interval" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Event" ADD CONSTRAINT "Event_one_source" CHECK (
  (source = 'MANUAL' AND "taskId" IS NULL AND "habitId" IS NULL AND "occurrenceId" IS NULL)
  OR (source = 'AUTO' AND "taskId" IS NOT NULL AND "habitId" IS NULL AND "occurrenceId" IS NULL)
  OR (source = 'HABIT' AND "habitId" IS NOT NULL AND "occurrenceId" IS NOT NULL AND "taskId" IS NULL)
);
ALTER TABLE "Event" ADD CONSTRAINT "Event_no_overlap"
  EXCLUDE USING gist ("userId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE (status NOT IN ('CANCELLED', 'SKIPPED'));
CREATE UNIQUE INDEX "Event_one_active_task" ON "Event" ("taskId") WHERE "taskId" IS NOT NULL AND status IN ('PENDING', 'IN_PROGRESS');
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_duration" CHECK ("durationMinutes" BETWEEN 5 AND 480);
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_priority" CHECK (priority BETWEEN 1 AND 3);
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_days" CHECK (cardinality("daysOfWeek") > 0 AND "daysOfWeek" <@ ARRAY[0,1,2,3,4,5,6]);
ALTER TABLE "Task" ADD CONSTRAINT "Task_duration" CHECK ("durationMinutes" BETWEEN 5 AND 480);
ALTER TABLE "Task" ADD CONSTRAINT "Task_priority" CHECK (priority BETWEEN 1 AND 3);
ALTER TABLE "User" ADD CONSTRAINT "User_buffer" CHECK ("bufferMinutes" BETWEEN 0 AND 60);
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_valid" CHECK (
  weekday BETWEEN 0 AND 6 AND start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND "end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND start < "end"
);
