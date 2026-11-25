-- S17: quem aprova tira um item do pedido (fica no histórico, com motivo, e não conta para estoque nem limite).
ALTER TYPE "SolicitacaoEventoTipo" ADD VALUE 'ITEM_CANCELADO';

ALTER TABLE "SolicitacaoItem" ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelNote" TEXT;
