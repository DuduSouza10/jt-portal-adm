-- AlterTable
ALTER TABLE "SolicitacaoItem" ADD COLUMN     "unitCost" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "StockBalance" ADD COLUMN     "avgCost" DECIMAL(14,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "unitCost" DECIMAL(14,4);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);
