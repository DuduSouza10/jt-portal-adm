# JT Portal ADM

Portal administrativo de insumos da J&T Express: solicitações das bases, aprovação, separação,
expedição, estoque e administração de acessos, num sistema só.

Projeto de **Diogo** e **Eduardo**, construído a partir de três sistemas anteriores
(`sistema-estoque`, `jt-portal-insumos` e `insumos`).

- Arquitetura e padrões: [`docs/arquitetura.md`](docs/arquitetura.md)
- Como trabalhamos (branches, PRs): [`docs/como-contribuir.md`](docs/como-contribuir.md)
- Regras de negócio: [`docs/regras-de-negocio.md`](docs/regras-de-negocio.md)

## O que já existe

| Área | Status |
|---|---|
| Login com usuário/senha, sessões no banco, bloqueio após tentativas erradas | ✅ |
| Troca de senha obrigatória após senha temporária | ✅ |
| Tipos de acesso com permissões por ação e alcance (global / regional / base) | ✅ |
| Usuários, regionais e bases | ✅ |
| Auditoria de todas as alterações | ✅ |
| Estoque | a fazer (Diogo) |
| Produtos, solicitações, expedição, Feishu, relatórios | a fazer (Eduardo) |

## Rodar no computador

Pré-requisitos: **Node.js 22+** e **Git**.

```bash
npm install
cp .env.example .env
npm run db:dev          # sobe um Postgres local (mostra a URL — cole no .env)
npm run db:migrate      # cria as tabelas
npm run db:seed         # tipos de acesso + dados de exemplo
npm run dev             # http://localhost:3000
```

Usuários de exemplo (senha `portal123`): `dev`, `admin`, `gestor.mg`, `base.bhz`.

## Comandos

| Comando | Para quê |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run check` | Typecheck + lint + testes (rode antes de todo PR) |
| `npm run db:migrate -- --name x` | Cria migration depois de mudar o `schema.prisma` |
| `npm run db:seed` | Atualiza tipos de acesso padrão (+ exemplos em dev) |
| `npm run db:studio` | Ver/editar o banco no navegador |
| `npm run create-admin -- login "Nome"` | Cria o primeiro usuário Dev em produção |
