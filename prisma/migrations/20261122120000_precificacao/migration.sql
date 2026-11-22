-- Precificação: histórico das alterações manuais de preço dos produtos.
CREATE TABLE "PrecoHistorico" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "valorAnterior" DECIMAL(14,4),
    "valorNovo" DECIMAL(14,4) NOT NULL,
    "motivo" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrecoHistorico_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PrecoHistorico_produtoId_createdAt_idx" ON "PrecoHistorico"("produtoId", "createdAt");
CREATE INDEX "PrecoHistorico_createdAt_idx" ON "PrecoHistorico"("createdAt");

ALTER TABLE "PrecoHistorico" ADD CONSTRAINT "PrecoHistorico_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrecoHistorico" ADD CONSTRAINT "PrecoHistorico_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Produção: tabela nova sem acesso pela API pública do Supabase (ver 20261121120000_rls_todas_tabelas).
ALTER TABLE "PrecoHistorico" ENABLE ROW LEVEL SECURITY;
