-- CreateTable
CREATE TABLE "holders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicKey" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "holderId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "challenges_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "holders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "holderId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "holders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "dids" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "holderId" TEXT NOT NULL,
    "didIdentifier" TEXT NOT NULL,
    "documentCipher" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "dids_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "holders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "verifiable_credentials" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "holderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "issuedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME,
    "credentialCipher" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "verifiable_credentials_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "holders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "holders_publicKey_key" ON "holders"("publicKey");

-- CreateIndex
CREATE UNIQUE INDEX "challenges_nonce_key" ON "challenges"("nonce");

-- CreateIndex
CREATE INDEX "challenges_holderId_idx" ON "challenges"("holderId");

-- CreateIndex
CREATE INDEX "challenges_expiresAt_idx" ON "challenges"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_holderId_idx" ON "sessions"("holderId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "dids_didIdentifier_key" ON "dids"("didIdentifier");

-- CreateIndex
CREATE INDEX "dids_holderId_idx" ON "dids"("holderId");

-- CreateIndex
CREATE INDEX "verifiable_credentials_holderId_idx" ON "verifiable_credentials"("holderId");

-- CreateIndex
CREATE INDEX "verifiable_credentials_status_idx" ON "verifiable_credentials"("status");
