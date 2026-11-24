-- Lacre numerado: aparece só na aba "Solicitar lacres".
ALTER TABLE "Produto" ADD COLUMN "lacre" BOOLEAN NOT NULL DEFAULT false;
