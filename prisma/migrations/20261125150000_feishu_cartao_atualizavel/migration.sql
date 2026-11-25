-- Feishu pelo app/bot da J&T (sem webhooks): cada mudança de status edita o MESMO cartão da solicitação.
-- O Feishu guarda o message_id de cada cartão enviado; aqui fica um por solicitação e destino (grupo ou pessoa).

ALTER TABLE "FeishuOutbox" ADD COLUMN "refId" TEXT,
ADD COLUMN "soAtualiza" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "FeishuOutbox_refId_idx" ON "FeishuOutbox"("refId");

CREATE TABLE "FeishuCartao" (
    "id" TEXT NOT NULL,
    "solicitacaoId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeishuCartao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeishuCartao_solicitacaoId_channel_target_key" ON "FeishuCartao"("solicitacaoId", "channel", "target");

ALTER TABLE "FeishuCartao" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "FeishuCartao" ADD CONSTRAINT "FeishuCartao_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "Solicitacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Webhooks deixaram de ser usados: o que estava na fila por webhook não tem mais como sair.
UPDATE "FeishuOutbox"
SET "status" = 'FAILED', "lastError" = 'Webhook não é mais usado: os avisos saem pelo app do Feishu.'
WHERE "channel" = 'webhook' AND "status" = 'PENDING';

-- Grupos de regional cadastrados como link de webhook não valem mais (só o chat_id oc_... do grupo onde o bot está).
UPDATE "Regional" SET "feishuStaffChatId" = NULL WHERE "feishuStaffChatId" IS NOT NULL AND "feishuStaffChatId" NOT LIKE 'oc\_%';
UPDATE "Regional" SET "feishuShippingChatId" = NULL WHERE "feishuShippingChatId" IS NOT NULL AND "feishuShippingChatId" NOT LIKE 'oc\_%';
