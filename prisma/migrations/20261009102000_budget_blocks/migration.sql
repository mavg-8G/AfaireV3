-- Keep an identity for every generated block: a task or a weekly category objective.
ALTER TABLE "Event" DROP CONSTRAINT "Event_one_source";
ALTER TABLE "Event" ADD CONSTRAINT "Event_one_source" CHECK (
  (source = 'MANUAL' AND "taskId" IS NULL AND "habitId" IS NULL AND "occurrenceId" IS NULL)
  OR (source = 'AUTO' AND ("taskId" IS NOT NULL OR "categoryId" IS NOT NULL) AND "habitId" IS NULL AND "occurrenceId" IS NULL)
  OR (source = 'HABIT' AND "habitId" IS NOT NULL AND "occurrenceId" IS NOT NULL AND "taskId" IS NULL)
);
