-- Pedido: itens digitados que não estão no cadastro de produtos (texto livre, sem estoque).
ALTER TABLE "Solicitacao" ADD COLUMN "outrosItens" JSONB;
