CREATE TABLE "AuthAuditEvent" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "accountRef" TEXT,
    "clientRef" TEXT,
    "errorCode" TEXT,
    CONSTRAINT "AuthAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuthAuditEvent_occurredAt_idx" ON "AuthAuditEvent"("occurredAt");
CREATE INDEX "AuthAuditEvent_requestId_idx" ON "AuthAuditEvent"("requestId");
CREATE INDEX "AuthAuditEvent_accountRef_occurredAt_idx" ON "AuthAuditEvent"("accountRef", "occurredAt");
