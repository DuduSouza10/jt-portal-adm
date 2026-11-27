-- CreateTable
CREATE TABLE "LiberacaoDia" (
    "id" TEXT NOT NULL,
    "baseId" TEXT NOT NULL,
    "dia" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiberacaoDia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiberacaoDia_dia_idx" ON "LiberacaoDia"("dia");

-- CreateIndex
CREATE UNIQUE INDEX "LiberacaoDia_baseId_dia_key" ON "LiberacaoDia"("baseId", "dia");

-- AddForeignKey
ALTER TABLE "LiberacaoDia" ADD CONSTRAINT "LiberacaoDia_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "Base"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (como nas demais tabelas: o portal acessa pelo servidor, nada pelo PostgREST)
ALTER TABLE "LiberacaoDia" ENABLE ROW LEVEL SECURITY;
