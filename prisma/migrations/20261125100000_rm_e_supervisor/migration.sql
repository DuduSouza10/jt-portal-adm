-- "RM / Supervisor" vira dois tipos de acesso: RM (quem já tinha continua como RM) e Supervisor (novo).
-- Quem é supervisor passa para o novo tipo em Usuários.
UPDATE "AccessProfile"
SET "key" = 'rm', "name" = 'RM', "description" = 'Escolhe as próprias bases e franquias (todas aparecem), vê os relatórios delas e aprova os pedidos.', "updatedAt" = now()
WHERE "key" = 'rm-supervisor' AND NOT EXISTS (SELECT 1 FROM "AccessProfile" WHERE "key" = 'rm');

INSERT INTO "AccessProfile" ("id", "key", "name", "description", "scope", "permissions", "system", "updatedAt")
SELECT gen_random_uuid()::text, 'supervisor', 'Supervisor', 'Escolhe as próprias bases e franquias (cada uma só com um supervisor), vê os relatórios delas e aprova os pedidos.', "scope", "permissions", true, now()
FROM "AccessProfile" WHERE "key" = 'rm'
ON CONFLICT ("key") DO NOTHING;
