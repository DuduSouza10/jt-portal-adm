-- Grupos do Feishu por regional: equipe e expedição (SPN e MG recebem os avisos separados).
ALTER TABLE "Regional" ADD COLUMN "feishuStaffChatId" TEXT;
ALTER TABLE "Regional" ADD COLUMN "feishuShippingChatId" TEXT;
