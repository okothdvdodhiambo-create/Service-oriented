-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CallerType" AS ENUM ('PUBLIC', 'INSTITUTION', 'ADMIN');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('NUMBER', 'QR');

-- CreateEnum
CREATE TYPE "VerificationResult" AS ENUM ('GENUINE', 'NOT_FOUND', 'REPORTED_LOST', 'REVOKED', 'REPLACED', 'EXPIRED', 'INVALID_TOKEN');

-- CreateEnum
CREATE TYPE "InstitutionStatus" AS ENUM ('APPROVED', 'SUSPENDED', 'PENDING');

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "status" "InstitutionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "CallerType" NOT NULL DEFAULT 'INSTITUTION',
    "institutionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationLog" (
    "id" TEXT NOT NULL,
    "callerType" "CallerType" NOT NULL,
    "institutionId" TEXT,
    "userId" TEXT,
    "method" "VerificationMethod" NOT NULL,
    "documentType" TEXT,
    "numberHash" TEXT,
    "documentId" TEXT,
    "result" "VerificationResult" NOT NULL,
    "ipHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "correlationId" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyStat" (
    "date" TIMESTAMP(3) NOT NULL,
    "result" "VerificationResult" NOT NULL,
    "method" "VerificationMethod" NOT NULL,
    "callerType" "CallerType" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyStat_pkey" PRIMARY KEY ("date","result","method","callerType")
);

-- CreateIndex
CREATE UNIQUE INDEX "Institution_apiKeyHash_key" ON "Institution"("apiKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "AuthUser_email_key" ON "AuthUser"("email");

-- CreateIndex
CREATE INDEX "VerificationLog_institutionId_createdAt_idx" ON "VerificationLog"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "VerificationLog_createdAt_idx" ON "VerificationLog"("createdAt");

-- CreateIndex
CREATE INDEX "VerificationLog_result_createdAt_idx" ON "VerificationLog"("result", "createdAt");

-- CreateIndex
CREATE INDEX "DailyStat_date_idx" ON "DailyStat"("date");

-- AddForeignKey
ALTER TABLE "AuthUser" ADD CONSTRAINT "AuthUser_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationLog" ADD CONSTRAINT "VerificationLog_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
