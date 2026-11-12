# Módulos

Uma pasta por módulo de negócio. Ver `docs/arquitetura.md` → "As 3 camadas de um módulo".

| Pasta | Responsável | Status |
|---|---|---|
| `acessos/` | Diogo (núcleo) | ✅ usuários e tipos de acesso |
| `estrutura/` | Diogo (núcleo) | ✅ regionais e bases |
| `estoque/` | Diogo | ✅ saldos, entradas, saídas, transferências, inventário e API de reservas (`api.ts`) |
| `produtos/` | Eduardo | model mínimo criado pelo Diogo (Issue #3); falta o resto |
| `solicitacoes/` | Eduardo | a fazer |
| `expedicao/` | Eduardo | a fazer |
| `relatorios/` | Eduardo | a fazer |

## Começando um módulo novo

1. Crie `src/modules/<modulo>/` com `schemas.ts`, `rules.ts`, `rules.test.ts`, `service.ts`.
2. Adicione os models numa seção `// ---- MÓDULO: <modulo> ----` no fim de `prisma/schema.prisma` e rode `npm run db:migrate -- --name <modulo>_inicial`.
3. As permissões do módulo já estão em `src/lib/permissions/catalog.ts` (ajuste se precisar).
4. Crie as telas em `src/app/(app)/<modulo>/` copiando o padrão de `src/app/(app)/admin/estrutura/`.
5. Descomente/adicione a entrada no menu em `src/lib/navigation.ts`.
