-- Dúvidas (balão de ajuda): conversa de cada usuário com a equipe do portal.
CREATE TABLE "DuvidaMensagem" (
    "id" TEXT NOT NULL,
    "solicitanteId" TEXT NOT NULL,
    "autorId" TEXT,
    "texto" TEXT NOT NULL,
    "daEquipe" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DuvidaMensagem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DuvidaMensagem_solicitanteId_createdAt_idx" ON "DuvidaMensagem"("solicitanteId", "createdAt");
CREATE INDEX "DuvidaMensagem_createdAt_idx" ON "DuvidaMensagem"("createdAt");
ALTER TABLE "DuvidaMensagem" ADD CONSTRAINT "DuvidaMensagem_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DuvidaMensagem" ADD CONSTRAINT "DuvidaMensagem_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DuvidaMensagem" ENABLE ROW LEVEL SECURITY;
