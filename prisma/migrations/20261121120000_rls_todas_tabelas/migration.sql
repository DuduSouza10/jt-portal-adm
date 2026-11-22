-- RLS ligado em TODAS as tabelas do schema do portal (no Supabase: "portal").
-- Sem policy nenhuma: a API pública do Supabase (anon/authenticated) não lê nem grava nada.
-- O app conecta como dono das tabelas e não é afetado (o dono passa por cima do RLS).
-- Idempotente: pode rodar num banco em que parte das tabelas já tem RLS.
-- Daqui para frente, toda migration que cria tabela liga o RLS nela (teste: src/lib/migrations.test.ts).
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = current_schema() AND c.relkind = 'r' AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;
