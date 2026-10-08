-- AlterTable
ALTER TABLE "Availability" ADD COLUMN     "learnedActive" BOOLEAN,
ADD COLUMN     "learnedAt" TIMESTAMPTZ(3),
ADD COLUMN     "learnedWindows" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "learningReason" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adaptiveAvailability" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "UsageSample" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weekday" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageSample_userId_observedAt_idx" ON "UsageSample"("userId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UsageSample_userId_date_minute_timezone_key" ON "UsageSample"("userId", "date", "minute", "timezone");

-- AddForeignKey
ALTER TABLE "UsageSample" ADD CONSTRAINT "UsageSample_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UsageSample" ADD CONSTRAINT "UsageSample_valid_bucket" CHECK (weekday BETWEEN 0 AND 6 AND minute BETWEEN 0 AND 1425 AND minute % 15 = 0);

