# Arquitetura do JT Portal ADM

Documento vivo. Toda decisão técnica que afeta os dois desenvolvedores entra aqui.

## Visão geral

Plataforma única de gestão de insumos da J&T. Cobre o ciclo inteiro:

```
BASE SOLICITA → RESPONSÁVEL APROVA → ALMOXARIFADO SEPARA → EXPEDIÇÃO ENVIA → BASE RECEBE
                                         │
                                  ESTOQUE (baixa, entrada, inventário)
```

## Stack

| Camada | Tecnologia | Por quê |
|---|---|---|
| App (front + back) | **Next.js 16** (App Router, Server Components, Server Actions) | Um projeto só: quem faz a tela faz o backend dela, sem depender do outro |
| Linguagem | **TypeScript** (strict) | Erros pegos antes de rodar |
| Banco | **PostgreSQL** | Transações e consistência de estoque |
| ORM | **Prisma 7** | Schema versionado com migrations; tipos gerados |
| Interface | **Tailwind CSS 4 + shadcn/ui** | Componentes prontos em `src/components/ui` |
| Validação | **Zod** | Todo dado de formulário é validado no servidor |
| Testes | **Vitest** | Regras de negócio puras testadas sem banco |
| Deploy | **Netlify** + **Supabase** (Postgres) | Mesmo esquema do sistema `insumos`, plano gratuito |

## Estrutura de pastas

```
prisma/
  schema.prisma          ← núcleo + uma seção por módulo
  migrations/            ← geradas por `npm run db:migrate`, sempre commitadas
  seed.ts                ← tipos de acesso padrão + dados de exemplo
src/
  app/                   ← ROTAS (telas e actions). Só orquestra: valida, chama o service, redireciona.
    (app)/               ← tudo que exige login (tem o cabeçalho)
      admin/             ← núcleo: usuários, perfis, estrutura, auditoria
      <modulo>/          ← telas de cada módulo
    login/
  modules/               ← REGRAS DE NEGÓCIO, uma pasta por módulo
    <modulo>/
      schemas.ts         ← Zod: formato dos dados de entrada
      rules.ts           ← funções PURAS (sem banco) — é aqui que ficam as regras testáveis
      rules.test.ts
      service.ts         ← operações com banco: transação + auditoria
  lib/                   ← infraestrutura compartilhada (núcleo)
    auth/                ← sessão, senha, rate limit
    permissions/         ← catálogo de permissões + checagem
    audit.ts             ← gravação de auditoria
    action-result.ts     ← runAction / FormState
    navigation.ts        ← menu
  components/
    ui/                  ← shadcn (não editar à mão; use `npx shadcn add`)
    action-form.tsx, page-header.tsx, form-field.tsx
docs/
```

### As 3 camadas de um módulo

1. **`app/.../page.tsx`** (tela) — chama `requirePermission()`, busca dados, renderiza.
2. **`app/.../actions.ts`** (server action) — `requirePermission()` → `schema.safeParse()` → `runAction(() => service(...))` → `revalidatePath` / `redirect`.
3. **`modules/<m>/service.ts`** — regra de negócio + banco. Lança `DomainError("mensagem")` para erro que o usuário deve ver. Grava `audit()` na mesma transação.

Regras puras (cálculo de ciclo de 3 meses, limite por produto, transição de status…) ficam em `rules.ts` e têm teste.

## Permissões

Modelo herdado do portal do Eduardo: **por página e por ação**, com **tipos de acesso personalizáveis**.

- Catálogo único: `src/lib/permissions/catalog.ts`. Chave `"<modulo>.<acao>"`.
- Cada usuário tem **um tipo de acesso** (`AccessProfile`) com uma lista de permissões e um **alcance**:
  - `GLOBAL` — todas as bases
  - `REGIONAL` — bases das regionais vinculadas ao usuário
  - `BASE` — só as bases vinculadas
- Perfil `dev` tem o curinga `*`.
- **Ninguém concede o que não tem**: um admin não promove ninguém (nem a si mesmo) acima do próprio nível.

### Como usar

```ts
// Página ou action: sem permissão → 404
const user = await requirePermission("solicitacoes.aprovar");

// Mostrar/esconder botão
can(user, "produtos.editar")

// Filtrar dados pelo alcance do usuário
db.solicitacao.findMany({ where: { base: baseScopeWhere(user) } })

// Checar um registro já carregado
if (!canAccessBase(user, pedido.base)) notFound();
```

> Esconder o botão **não** protege nada. Toda page, action e route handler chama `requirePermission`.

### Adicionar uma permissão

1. Inclua no grupo do módulo em `catalog.ts`.
2. Use com `requirePermission` / `can`.
3. Se algum perfil padrão deve ter, adicione em `prisma/seed.ts` e rode `npm run db:seed`.

## Auditoria

Toda alteração de dado de negócio grava um `AuditLog` **dentro da mesma transação**:

```ts
await db.$transaction(async (tx) => {
  const p = await tx.produto.update(...);
  await audit({ actorId: user.id, action: "produto.editar", entity: "Produto", entityId: p.id,
                summary: `Editou o produto ${p.code}`, data: diff(antes, depois) }, tx);
});
```

A tela `/admin/auditoria` mostra tudo. Registros nunca são editados nem apagados.

## Banco de dados

- **Mudou o schema?** `npm run db:migrate -- --name descricao_curta` → commita a pasta da migration junto.
- Nunca edite uma migration que já foi para a `main`. Crie outra.
- Cada módulo adiciona models numa seção própria em `schema.prisma`. Referenciar `User`, `Base`, `Regional` pode; mexer em models do núcleo ou de outro módulo, combine antes.
- Estoque: toda alteração de saldo passa pelo service de estoque (movimentação + saldo na mesma transação). Nenhum outro módulo altera saldo direto.

## Divisão de responsabilidades

| Área | Responsável |
|---|---|
| Núcleo: arquitetura, banco, login, permissões, auditoria, deploy, CI | **Diogo** |
| Estoque e movimentações | **Diogo** |
| Produtos (catálogo), solicitações, aprovação, ciclo de 3 meses | **Eduardo** |
| Separação, expedição, rastreio, Feishu, relatórios operacionais | **Eduardo** |
| Visual, dashboard, testes, revisão de PRs | **Os dois** |

## Decisões registradas

| Data | Decisão | Motivo |
|---|---|---|
| 2026-11-12 | Next.js full-stack em vez de React + Express separados | Um projeto só; cada dev entrega tela + backend do seu módulo sem depender do outro |
| 2026-11-12 | Sessão no banco em vez de JWT | Desativar usuário ou mudar perfil vale na hora |
| 2026-11-12 | Permissões por catálogo + tipos de acesso editáveis | Modelo do portal do Eduardo, já validado na operação |
| 2026-11-12 | Construir do zero usando os 3 projetos como referência | Evita herdar o monolito Flask e o escopo financeiro do sistema-estoque |
