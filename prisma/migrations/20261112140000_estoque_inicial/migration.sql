-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('ENTRADA', 'SAIDA', 'TRANSFERENCIA_SAIDA', 'TRANSFERENCIA_ENTRADA', 'INVENTARIO', 'RESERVA', 'LIBERACAO', 'BAIXA');

-- CreateEnum
CREATE TYPE "StockReservationStatus" AS ENUM ('ATIVA', 'BAIXADA', 'LIBERADA');

-- CreateTable
CREATE TABLE "Produto" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'un',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBalance" (
    "baseId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "minimum" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("baseId","produtoId")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "baseId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reservedDelta" INTEGER NOT NULL DEFAULT 0,
    "balanceAfter" INTEGER NOT NULL,
    "reservedAfter" INTEGER NOT NULL,
    "document" TEXT,
    "reason" TEXT,
    "batchId" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReservation" (
    "id" TEXT NOT NULL,
    "refType" TEXT NOT NULL DEFAULT 'solicitacao',
    "refId" TEXT NOT NULL,
    "baseId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "shipped" INTEGER NOT NULL DEFAULT 0,
    "status" "StockReservationStatus" NOT NULL DEFAULT 'ATIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Produto_code_key" ON "Produto"("code");

-- CreateIndex
CREATE INDEX "Produto_name_idx" ON "Produto"("name");

-- CreateIndex
CREATE INDEX "StockBalance_produtoId_idx" ON "StockBalance"("produtoId");

-- CreateIndex
CREATE INDEX "StockMovement_baseId_createdAt_idx" ON "StockMovement"("baseId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_produtoId_createdAt_idx" ON "StockMovement"("produtoId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_batchId_idx" ON "StockMovement"("batchId");

-- CreateIndex
CREATE INDEX "StockMovement_refType_refId_idx" ON "StockMovement"("refType", "refId");

-- CreateIndex
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

-- CreateIndex
CREATE INDEX "StockReservation_baseId_produtoId_status_idx" ON "StockReservation"("baseId", "produtoId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockReservation_refType_refId_baseId_produtoId_key" ON "StockReservation"("refType", "refId", "baseId", "produtoId");

-- CreateIndex
CREATE INDEX "Base_type_active_idx" ON "Base"("type", "active");

-- CreateIndex
CREATE INDEX "User_active_name_idx" ON "User"("active", "name");

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "Base"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "Base"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "Base"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Proteção no banco (K3): mesmo que algum código fure o service, o Postgres recusa.
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_quantity_nonneg" CHECK ("quantity" >= 0);
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_reserved_nonneg" CHECK ("reserved" >= 0);
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_minimum_nonneg" CHECK ("minimum" >= 0);
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_quantity_pos" CHECK ("quantity" > 0);
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_shipped_range" CHECK ("shipped" >= 0 AND "shipped" <= "quantity");
