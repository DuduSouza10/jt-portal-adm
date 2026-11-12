## O que muda

<!-- Uma ou duas frases. -->

Closes #

## Checklist

- [ ] `npm run check` passa
- [ ] Toda page/action nova chama `requirePermission(...)`
- [ ] Toda alteração de dado grava `audit(...)` na transação
- [ ] Mudou o schema? A migration está no PR
- [ ] Permissão nova? Está no `catalog.ts` (e no seed, se for padrão)
- [ ] Regra de negócio nova tem teste
