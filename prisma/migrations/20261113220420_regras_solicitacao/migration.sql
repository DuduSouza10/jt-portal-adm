-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "limitBase" INTEGER,
ADD COLUMN     "limitBlockDays" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "limitFranquia" INTEGER;

-- AlterTable
ALTER TABLE "Solicitacao" ADD COLUMN     "peopleCount" INTEGER;

-- CreateTable
CREATE TABLE "CicloBase" (
    "baseId" TEXT NOT NULL,
    "blockedUntil" TIMESTAMP(3) NOT NULL,
    "sourceSolicitacaoId" TEXT,
    "reason" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CicloBase_pkey" PRIMARY KEY ("baseId")
);

-- CreateTable
CREATE TABLE "BloqueioProduto" (
    "id" TEXT NOT NULL,
    "baseId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "blockedUntil" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceSolicitacaoId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BloqueioProduto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CicloBase_blockedUntil_idx" ON "CicloBase"("blockedUntil");

-- CreateIndex
CREATE INDEX "BloqueioProduto_blockedUntil_idx" ON "BloqueioProduto"("blockedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "BloqueioProduto_baseId_produtoId_key" ON "BloqueioProduto"("baseId", "produtoId");

-- AddForeignKey
ALTER TABLE "CicloBase" ADD CONSTRAINT "CicloBase_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "Base"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueioProduto" ADD CONSTRAINT "BloqueioProduto_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "Base"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueioProduto" ADD CONSTRAINT "BloqueioProduto_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
