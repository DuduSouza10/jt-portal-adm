# Produção

## Onde fica o banco

- **Supabase**, projeto `chamados-manutencao` (o mesmo do sistema de chamados), região São Paulo.
- As tabelas do portal ficam no schema **`portal`**. O schema `insumos` desse banco é do **sistema antigo** de insumos, que ainda está em uso: o portal não mexe nele.
- Todas as tabelas do `portal` têm RLS ligado e nenhuma policy, ou seja, a API pública do Supabase não lê nem grava nada. O app conecta como dono do banco e não é afetado.

## O que já foi feito (2026-11-12, Claude do Diogo)

- Schema `portal` criado com as migrations da `main` até `20261112150000_auth_limpeza`, registradas em `portal._prisma_migrations` (o `migrate deploy` sabe que já foram aplicadas).
- Tipos de acesso padrão criados: Dev, Administrador, Gestor regional, Almoxarifado, **Expedição**, Base e Franquia (regra E9).
- **Ainda não existem usuários.** Ver "Primeiro acesso" abaixo.

## Configurar o computador para produção

Crie `.env.producao` na raiz (o `.gitignore` já ignora; **nunca** commite):

```bash
# Supabase → projeto chamados-manutencao → botão "Connect"
# Transaction pooler (porta 6543): usado pelo app
DATABASE_URL="postgresql://postgres.<ref>:<SENHA>@aws-...pooler.supabase.com:6543/postgres"
# Conexão direta ou Session pooler (porta 5432): usada só pelas migrations
DIRECT_URL="postgresql://postgres.<ref>:<SENHA>@aws-...pooler.supabase.com:5432/postgres"
DATABASE_SCHEMA="portal"
APP_URL="https://<endereço do site>"
```

A senha do banco é a do projeto no Supabase (Project Settings → Database). Se ninguém souber, dá para redefinir lá, **mas o sistema de chamados usa a mesma senha**: atualize o dele junto.

## Primeiro acesso (criar os usuários do Diogo e do Eduardo)

```bash
# 1. Confere as migrations (deve dizer que não há nada pendente)
node --env-file=.env.producao node_modules/prisma/build/index.js migrate deploy

# 2. Atualiza os tipos de acesso padrão (seguro rodar de novo)
NODE_ENV=production node --env-file=.env.producao node_modules/prisma/build/index.js db seed

# 3. Cria o seu usuário com acesso completo (Dev). Mostra uma senha temporária só para você.
node --env-file=.env.producao --import tsx scripts/create-admin.ts diogo "Diogo Alves"
```

Depois, entre no portal com esse usuário e crie o do Eduardo em **Usuários → Novo**, com o tipo de acesso **Dev**.
O portal mostra a senha temporária para você passar a ele; ela é trocada no primeiro acesso.

> No PowerShell, troque o passo 2 por: `$env:NODE_ENV="production"; node --env-file=.env.producao node_modules/prisma/build/index.js db seed`
>
> `NODE_ENV=production` no seed é obrigatório: sem ele o seed cria os usuários e bases **de exemplo**.

## Quem recebe qual acesso (regra E9)

- **Dev** (tudo): só quem o Diogo e o Eduardo liberarem.
- **Base / Franquia**: só pedir insumos e acompanhar os próprios pedidos.
- **Expedição**: só a fila da expedição.
- O tipo de acesso de quem vem das bases é decidido na hora em que a pessoa entra.

## Deploy (Netlify)

Ainda não configurado. Quando for: no painel do Netlify, cadastre `DATABASE_URL`, `DATABASE_SCHEMA=portal` e `APP_URL`
(marcando `DATABASE_URL` como secreta) e conecte o repositório. O `netlify.toml` já tem o resto.
Migrations novas: rode o passo 1 acima **antes** de publicar a versão que depende delas.
