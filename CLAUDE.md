# JT Portal ADM — instruções para IA

Leia `docs/arquitetura.md` antes de escrever código. Resumo obrigatório:

- Next.js 16 App Router + TypeScript + Prisma 7 (Postgres) + Tailwind 4/shadcn. Idioma da interface e do código de domínio: **português**.
- Esta versão do Next tem mudanças: consulte `node_modules/next/dist/docs/` antes de usar APIs que você não viu neste repo. Copie os padrões das páginas existentes em `src/app/(app)/admin/`.
- Camadas: `app/` (tela + action, só orquestra) → `modules/<m>/service.ts` (banco + regra) → `modules/<m>/rules.ts` (regra pura, com teste).
- **Toda** page, server action e route handler protegido chama `requirePermission("modulo.acao")` de `@/lib/auth/session`. Esconder botão não basta.
- Listas de dados ligados a base usam `baseScopeWhere(user)`; registro carregado usa `canAccessBase(user, base)`.
- Permissões novas: só em `src/lib/permissions/catalog.ts`.
- Toda alteração de dado grava `audit(..., tx)` dentro de `db.$transaction`.
- Erro que o usuário deve ver: `throw new DomainError("...")`. Actions usam `runAction` e devolvem `FormState`.
- Formulários: `<ActionForm>` + `Field` + validação Zod no servidor (`formToObject` para checkboxes múltiplos).
- Mudou `prisma/schema.prisma`? Gere a migration (`npm run db:migrate -- --name x`). Não edite migrations antigas.
- Não altere o núcleo (`src/lib/**`, models do núcleo) nem módulos de outra pessoa sem pedir — ver tabela de responsáveis em `docs/arquitetura.md`.
- Antes de concluir: `npm run check`.
- Nunca commitar `.env`, banco de dados ou dados reais.
