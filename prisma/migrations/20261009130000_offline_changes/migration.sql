CREATE TABLE "OfflineMutation" (
  "userId" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "eventUpdatedAt" TIMESTAMPTZ(3) NOT NULL,
  "appliedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfflineMutation_pkey" PRIMARY KEY ("userId", "id"),
  CONSTRAINT "OfflineMutation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OfflineMutation_appliedAt_idx" ON "OfflineMutation"("appliedAt");
