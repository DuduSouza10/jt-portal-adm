-- CreateEnum
CREATE TYPE "SolicitacaoStatus" AS ENUM ('PENDENTE', 'APROVADA', 'EM_SEPARACAO', 'SEPARADA', 'ENVIADA', 'RECEBIDA', 'RECUSADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "Prioridade" AS ENUM ('NORMAL', 'URGENTE');

-- CreateEnum
CREATE TYPE "SolicitacaoEventoTipo" AS ENUM ('CRIADA', 'STATUS', 'COMENTARIO');

-- CreateTable
CREATE TABLE "Solicitacao" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "baseId" TEXT NOT NULL,
    "almoxarifadoId" TEXT,
    "createdById" TEXT NOT NULL,
    "status" "SolicitacaoStatus" NOT NULL DEFAULT 'PENDENTE',
    "priority" "Prioridade" NOT NULL DEFAULT 'NORMAL',
    "notes" TEXT,
    "decisionNote" TEXT,
    "partial" BOOLEAN NOT NULL DEFAULT false,
    "tripId" TEXT,
    "volumes" INTEGER,
    "shippingNotes" TEXT,
    "shipmentPhotoId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "separationAt" TIMESTAMP(3),
    "separatedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Solicitacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitacaoItem" (
    "id" TEXT NOT NULL,
    "solicitacaoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "requested" INTEGER NOT NULL,
    "approved" INTEGER,
    "separated" INTEGER,

    CONSTRAINT "SolicitacaoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitacaoEvento" (
    "id" TEXT NOT NULL,
    "solicitacaoId" TEXT NOT NULL,
    "type" "SolicitacaoEventoTipo" NOT NULL,
    "fromStatus" "SolicitacaoStatus",
    "toStatus" "SolicitacaoStatus",
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolicitacaoEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentPhoto" (
    "id" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Solicitacao_number_key" ON "Solicitacao"("number");

-- CreateIndex
CREATE INDEX "Solicitacao_baseId_createdAt_idx" ON "Solicitacao"("baseId", "createdAt");

-- CreateIndex
CREATE INDEX "Solicitacao_status_almoxarifadoId_idx" ON "Solicitacao"("status", "almoxarifadoId");

-- CreateIndex
CREATE INDEX "Solicitacao_shippedAt_idx" ON "Solicitacao"("shippedAt");

-- CreateIndex
CREATE INDEX "Solicitacao_tripId_idx" ON "Solicitacao"("tripId");

-- CreateIndex
CREATE INDEX "SolicitacaoItem_produtoId_idx" ON "SolicitacaoItem"("produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "SolicitacaoItem_solicitacaoId_produtoId_key" ON "SolicitacaoItem"("solicitacaoId", "produtoId");

-- CreateIndex
CREATE INDEX "SolicitacaoEvento_solicitacaoId_createdAt_idx" ON "SolicitacaoEvento"("solicitacaoId", "createdAt");

-- CreateIndex
CREATE INDEX "ShipmentPhoto_createdAt_idx" ON "ShipmentPhoto"("createdAt");

-- AddForeignKey
ALTER TABLE "Solicitacao" ADD CONSTRAINT "Solicitacao_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "Base"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Solicitacao" ADD CONSTRAINT "Solicitacao_almoxarifadoId_fkey" FOREIGN KEY ("almoxarifadoId") REFERENCES "Base"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Solicitacao" ADD CONSTRAINT "Solicitacao_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Solicitacao" ADD CONSTRAINT "Solicitacao_shipmentPhotoId_fkey" FOREIGN KEY ("shipmentPhotoId") REFERENCES "ShipmentPhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoItem" ADD CONSTRAINT "SolicitacaoItem_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "Solicitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoItem" ADD CONSTRAINT "SolicitacaoItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoEvento" ADD CONSTRAINT "SolicitacaoEvento_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "Solicitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoEvento" ADD CONSTRAINT "SolicitacaoEvento_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
