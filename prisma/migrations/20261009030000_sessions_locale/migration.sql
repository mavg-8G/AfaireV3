-- AlterTable
ALTER TABLE "PushSubscription" ADD COLUMN     "deviceSessionId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hourFormat" TEXT NOT NULL DEFAULT '24',
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'es',
ADD COLUMN     "weekStartsOn" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "DeviceSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DeviceSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceSession_userId_expiresAt_idx" ON "DeviceSession"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSession_id_userId_key" ON "DeviceSession"("id", "userId");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_deviceSessionId_userId_fkey" FOREIGN KEY ("deviceSessionId", "userId") REFERENCES "DeviceSession"("id", "userId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSession" ADD CONSTRAINT "DeviceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD CONSTRAINT "User_regional_preferences" CHECK ("locale" IN ('es','en') AND "hourFormat" IN ('12','24') AND "weekStartsOn" IN (0,1));
ALTER TABLE "DeviceSession" ADD CONSTRAINT "DeviceSession_times" CHECK ("expiresAt" > "createdAt" AND "lastSeenAt" >= "createdAt");
