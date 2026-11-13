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

1. Banco: seguir `docs/producao.md` (migrations no schema `portal`, RLS nas tabelas novas, usuários).
2. Variáveis no painel: `DATABASE_URL` (pooler de transação do Supabase, porta 6543), `DATABASE_SCHEMA=portal`, `APP_URL`,
   `CRON_SECRET` e as do Feishu (`.env.example`).
3. Região das funções: **São Paulo (`gru1`)**, perto do Supabase (`sa-east-1`).
4. Agendador: ver acima.
5. Depois do primeiro deploy: mandar o pedido de OA do login Feishu com a URL final (`/api/auth/feishu/callback`).
