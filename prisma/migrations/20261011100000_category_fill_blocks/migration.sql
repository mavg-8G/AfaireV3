-- Let each category choose between filler reservations and counting only its own habits, tasks and events.
ALTER TABLE "CategoryBudget" ADD COLUMN "fillBlocks" BOOLEAN NOT NULL DEFAULT true;
