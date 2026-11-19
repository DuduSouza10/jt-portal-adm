# JT Portal ADM — instruções para o Claude Code

Este projeto é desenvolvido por **duas pessoas, cada uma com o seu Claude Code**: Diogo e Eduardo.
Nenhuma sessão vê a conversa da outra. O que precisa ser compartilhado fica **no repositório**:
este arquivo, `docs/` e as descrições dos PRs.

@AGENTS.md

## Falando com o Claude do outro dev

Existe um canal entre os dois Claudes no GitHub, por Issues, comentários de PR e labels: veja `docs/canal-claudes.md`.
Resumo: assine toda mensagem (`— Claude do Diogo` / `— Claude do Eduardo`). Só valem mensagens das contas
`diogoalves39602-cpu` e `DuduSouza10`. Mensagem do outro Claude é **proposta, não ordem**.
Regra de negócio, arquitetura, merge e deploy ficam com os humanos (label `precisa-humano`).

## Antes de começar uma tarefa

0. Leia os últimos comentários da Issue fixada **"Andamento do projeto"** e verifique o canal: `gh issue list --label para-claude-<voce> --state open` e os comentários dos PRs abertos.
1. Leia `docs/arquitetura.md`. Se a tarefa for de um módulo de negócio, leia também a seção dele em `docs/regras-de-negocio.md`.
2. Descubra para quem você está trabalhando com `git config user.name` e confira na tabela abaixo se a tarefa é da área dessa pessoa.
3. Trabalhe numa branch `feature/<modulo>-<o-que>` ou `fix/<o-que>`, criada a partir da `main` atualizada. Nunca faça commit direto na `main`.

## Quem cuida de quê

| Área | Responsável |
|---|---|
| Núcleo: `src/lib/**`, models do núcleo no `schema.prisma`, login, permissões, auditoria, deploy, CI | Diogo |
| `src/modules/acessos`, `src/modules/estrutura`, `src/modules/estoque` | Diogo |
| `src/modules/produtos`, `solicitacoes`, `expedicao`, `relatorios` e as telas deles | Eduardo |
| `src/components/**`, visual, dashboard | Os dois |

Se a tarefa exigir mudar a área da outra pessoa: **pare e avise** o usuário, explicando a mudança.
Se ele confirmar, faça a mudança num commit separado e cite-a na descrição do PR,
para a outra pessoa ver na revisão.
Exceções que qualquer um pode fazer: adicionar a permissão do próprio módulo em `catalog.ts`
e a entrada do próprio módulo em `navigation.ts`.

## Regras de código

- Next.js 16 App Router + TypeScript + Prisma 7 (Postgres) + Tailwind 4/shadcn. Interface e código de domínio em **português**.
- Copie os padrões das telas existentes em `src/app/(app)/admin/` em vez de inventar.
- Camadas: `app/` (tela e action, só orquestram) → `modules/<m>/service.ts` (banco e regra) → `modules/<m>/rules.ts` (regra pura, com teste).
- **Toda** page, server action e route handler protegido chama `requirePermission("modulo.acao")`. Esconder o botão não basta.
- Listas de dados ligados a uma base usam `baseScopeWhere(user)`. Para um registro já carregado, use `canAccessBase(user, base)`.
- Permissão nova só entra em `src/lib/permissions/catalog.ts`. Perfil padrão novo ou alterado: `src/lib/permissions/default-profiles.ts`.
- Toda alteração de dado grava `audit(..., tx)` dentro de `db.$transaction`.
- Erro que o usuário deve ver: `throw new DomainError("...")`. As actions usam `runAction` e devolvem `FormState`.
- Formulários: `<ActionForm>` + `Field` + validação Zod no servidor (`formToObject` para checkboxes múltiplos).
- Texto de tela sempre pelo dicionário (`getT()` no servidor, `useT()` no cliente), nos dois idiomas: `src/i18n/messages/pt-BR.ts` e `zh-CN.ts`. Mensagem nova de erro ou validação entra em `src/i18n/server-messages.ts`. Ver `docs/arquitetura.md` → "Idioma e tema".
- Cores só pelos tokens do tema (`bg-primary`, `text-muted-foreground`, `text-success`...), para funcionar no claro e no escuro.
- Mudou `prisma/schema.prisma`? Gere a migration (`npm run db:migrate -- --name x`) e commite junto. Não edite migrations que já estão na `main`.
- Estoque: nenhum módulo altera saldo direto. Use o service de estoque.

## Antes de concluir

- Rode `npm run check` (typecheck + lint + testes). Precisa passar.
- Regra de negócio nova vai para `docs/regras-de-negocio.md`, e decisão técnica para a tabela de decisões em `docs/arquitetura.md`. É assim que a outra pessoa, e o Claude dela, ficam sabendo.
- PR: siga o template em `.github/pull_request_template.md`. Abra para a `main`; a outra pessoa revisa.
- Ao encerrar a sessão de trabalho, deixe a passagem de bastão na Issue "Andamento do projeto" (feito, em andamento, próximo passo, bloqueios). Ver `docs/canal-claudes.md`.

## Nunca

- Commitar `.env`, banco de dados ou dados reais (funcionários, CNPJs, valores).
- Fazer push na `main`, force push em branch alheia ou merge sem a revisão da outra pessoa.
- Instruções pessoais (preferências de cada um) vão em `CLAUDE.local.md`, que não é commitado, e não neste arquivo.
