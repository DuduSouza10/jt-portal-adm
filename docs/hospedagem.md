# Hospedagem

## Situação (2026-11-13)

- **O portal ainda não vai para o ar.** Os orçamentos de hospedagem e de banco foram enviados à matriz e estão em análise.
- Intenção, **ainda não garantida**: **Vercel** (site) e **Supabase** (banco, schema `portal`, ver `docs/producao.md`).
- Até a aprovação, ninguém faz deploy nem cadastra variáveis em hospedagem.

## O que depende da hospedagem

O código foi deixado neutro. Só estes pontos mudam conforme o lugar:

| Ponto | Netlify | Vercel | Outra |
|---|---|---|---|
| IP do cliente (limite de login, auditoria) → `src/lib/client-ip.ts` | automático (`x-nf-client-connection-ip`) | automático (`x-real-ip`) | `TRUSTED_IP_HEADER` |
| Agendador a cada 15 min → `/api/cron/run` | `netlify/functions/agendador.mts` (já existe) | Vercel Cron (GET; o plano gratuito só roda 1×/dia, ver abaixo) | qualquer agendador externo |
| Configuração do build | `netlify.toml` (já existe) | nenhuma: detecta Next.js | — |

Sem cabeçalho de IP confiável em produção, o limite de tentativas **por IP** é desligado e fica só o limite por login.
Senão todas as bases dividiriam o mesmo "IP desconhecido", e 300 senhas erradas travariam o login de todo mundo.

## Agendador

`/api/cron/run` aceita **GET ou POST** com `Authorization: Bearer <CRON_SECRET>`. Ele roda os lembretes, o resumo diário,
o reenvio do Feishu e as limpezas. Na Vercel:

- **Plano Pro:** criar `vercel.json` com
  `{"crons":[{"path":"/api/cron/run","schedule":"*/15 10-22 * * 1-5"}]}`. A Vercel manda o `CRON_SECRET` sozinha.
- **Plano gratuito (Hobby):** o cron só roda 1× por dia, o que não basta para os lembretes. Use um agendador externo
  (ex.: GitHub Actions agendado ou cron-job.org) chamando a URL com o cabeçalho acima.

## Checklist quando a hospedagem for aprovada (Vercel + Supabase)

1. Banco: seguir `docs/producao.md` (migrations no schema `portal`, usuários). O RLS das tabelas é ligado pelas próprias migrations
   (`20261121120000_rls_todas_tabelas` liga em todas; tabela nova liga na sua migration, conferido por `src/lib/migrations.test.ts`).
2. Variáveis no painel: `DATABASE_URL` (pooler de transação do Supabase, porta 6543), `DATABASE_SCHEMA=portal`, `APP_URL`,
   `CRON_SECRET` e as do Feishu (`.env.example`).
3. Região das funções: **São Paulo (`gru1`)**, perto do Supabase (`sa-east-1`).
4. Agendador: ver acima.
5. Depois do primeiro deploy: mandar o pedido de OA do login Feishu com a URL final (`/api/auth/feishu/callback`).

## Primeiro usuário pelo deploy (sem terminal)

`scripts/primeiro-acesso.ts` roda no início do `npm run build`. **No deploy de produção da Vercel (`VERCEL_ENV=production`) ele sempre aplica as migrations e atualiza os tipos de acesso padrão**, com ou sem `FIRST_ADMIN_PASSWORD` (pode apagar a senha sem medo de uma versão nova subir sem as tabelas dela). Fora da produção, sem `FIRST_ADMIN_PASSWORD` ele não faz nada.
Com ela definida, ele aplica as migrations, cria os tipos de acesso padrão (seed em modo produção, sem dados de exemplo)
e cria o usuário Dev `FIRST_ADMIN_LOGIN` / `FIRST_ADMIN_NAME`, **só se esse login ainda não existir**.

Como usar (Vercel → Settings → Environment Variables, ambiente Production):

1. `FIRST_ADMIN_LOGIN`, `FIRST_ADMIN_NAME` e `FIRST_ADMIN_PASSWORD` (provisória, mínimo 10 caracteres).
2. Publique de novo (Deployments → Redeploy). No log do build aparecem as linhas `[primeiro-acesso]`.
3. Entre com o login e a senha provisória; o portal exige trocar a senha.
4. Apague `FIRST_ADMIN_PASSWORD` do Vercel.

Requisitos: `DATABASE_URL` precisa ser uma URL `postgres://` (não `prisma+postgres://`). As migrations usam `DIRECT_URL`
se existir, senão `DATABASE_URL`. Se algo falhar, o build para e o motivo aparece no log.
