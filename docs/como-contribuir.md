# Como trabalhamos

## Branches

- `main` — sempre funcionando. Ninguém faz commit direto nela.
- `feature/<modulo>-<o-que>` — ex.: `feature/solicitacoes-carrinho`, `feature/estoque-entrada-nf`
- `fix/<o-que>` — correções

## Fluxo de uma tarefa

1. Pegue (ou crie) uma **Issue** no GitHub e se atribua.
2. `git switch main && git pull` → `git switch -c feature/...`
3. Desenvolva. Commits pequenos, mensagem dizendo **o que** mudou:
   - ✅ `Solicitações: carrinho com limite por produto`
   - ❌ `ajustes`, `fix`, `teste`
4. Antes de abrir o PR, rode: `npm run check` (typecheck + lint + testes).
5. Abra o **Pull Request** para a `main`, com `Closes #<issue>` na descrição.
6. O outro revisa. Só faz merge depois da aprovação e do CI verde.

## Checklist do PR

- [ ] `npm run check` passa
- [ ] Toda page/action nova chama `requirePermission(...)`
- [ ] Toda alteração de dado grava `audit(...)` na transação
- [ ] Mudou o schema? A migration está no PR
- [ ] Permissão nova? Está no `catalog.ts` (e no seed, se for padrão)
- [ ] Regra de negócio nova tem teste em `rules.test.ts`

## Usando IA (Claude Code / ChatGPT)

O arquivo `CLAUDE.md` na raiz já passa as regras do projeto para o Claude Code.
Para outras IAs, cole o `docs/arquitetura.md` como contexto antes de pedir código.
Revise sempre o que a IA gerou antes de commitar.

## Dados

Nunca coloque dados reais (funcionários, CNPJs, valores) em seed, teste, Issue ou print público.
O repositório **não** guarda banco de dados nem `.env`.
