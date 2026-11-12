# Preparar a máquina (ou o Claude) para o JT Portal ADM

Comece sempre por:

```bash
npm run doctor
```

Ele confere tudo o que está abaixo e diz o que falta, sem instalar nada. Se ainda não rodou `npm install`,
use `node scripts/doctor.mjs`.

## 1. Ferramentas

| Ferramenta | Para quê | Como instalar (Windows) |
|---|---|---|
| **Node.js 22+** (LTS) | Rodar o projeto | https://nodejs.org ou `winget install OpenJS.NodeJS.LTS` |
| **Git** | Versionar | https://git-scm.com ou `winget install Git.Git` |
| **GitHub CLI (`gh`)** | PRs, Issues e o **canal entre os Claudes** | https://cli.github.com ou `winget install GitHub.cli` |
| VS Code (opcional) | Editar | https://code.visualstudio.com |

Depois de instalar o `gh`, faça o login uma vez:

```bash
gh auth login
```

Escolha GitHub.com → HTTPS → "Login with a web browser". Sem isso o Claude não consegue ler nem comentar nas Issues e PRs.

> Instalou alguma coisa? Feche e abra o terminal (e o Claude Code) de novo, para ele enxergar o programa novo.

## 2. Projeto

```bash
git clone https://github.com/DuduSouza10/jt-portal-adm.git
cd jt-portal-adm
npm install
cp .env.example .env
npm run db:dev        # sobe um Postgres local; copie a porta que ele mostrar para o .env
npm run db:deploy     # cria as tabelas
npm run db:seed       # tipos de acesso + dados de exemplo
npm run dev           # http://localhost:3000  (usuário: dev / senha: portal123)
```

No Windows (PowerShell), troque `cp` por `copy`.

## 3. O que precisa de quê

| Comando | Precisa de banco? | Precisa da engine do Prisma? |
|---|---|---|
| `npm test`, `npm run typecheck`, `npm run lint` | Não | Não |
| `npm run dev`, `npm run test:integration`, `npm run db:seed` | Sim | Não |
| `npm run db:migrate`, `npm run db:deploy` | Sim | **Sim** |

Ou seja: mesmo com o Prisma bloqueado, dá para **programar e rodar os testes de unidade**. Só criar e aplicar
migrations depende da engine.

## 4. Problemas comuns

### Prisma bloqueado ("engines", `binaries.prisma.sh`, schema-engine)

No `npm install`, o Prisma baixa um programa (a engine de migrations) de `binaries.prisma.sh`. Se isso falhar:

- **Claude Code na nuvem (navegador/claude.ai)**: o ambiente tem rede restrita. Nas configurações do
  ambiente (acesso à rede), libere `binaries.prisma.sh` e `registry.npmjs.org` e rode `npm install` de novo.
- **Rede da empresa / proxy**: configure o proxy (`npm config set proxy http://...` e `https-proxy`, e a
  variável `HTTPS_PROXY`) ou rode o `npm install` uma vez fora da rede da empresa.
- **Antivírus**: ele pode apagar o `schema-engine-*.exe`. Libere a pasta `node_modules/@prisma/engines`.
- **npm muito novo avisando de "install scripts"**: o `package.json` já autoriza o Prisma em `allowScripts`.
  Se aparecer bloqueio, rode `npm approve-scripts prisma @prisma/engines` e `npm install` de novo.

Depois, `npm run doctor` deve mostrar "✓ Prisma: engine de migrations".

### Comandos com `VAR=valor comando` não funcionam

Isso é sintaxe de Linux/macOS. No PowerShell: `$env:VAR="valor"; comando`. Os scripts do `package.json`
já evitam isso.

### O banco local (`prisma dev`) caiu ou mudou de porta

Rode `npm run db:dev` de novo e atualize a porta no `.env`. Ele atende **uma conexão por vez**: os testes de
concorrência só rodam no CI (Postgres de verdade).

### `PageProps` / `LayoutProps` não encontrados no typecheck

Rode `npx next typegen` (gera os tipos das rotas). O `npm run dev` também gera.

## 5. Claude Code

- O `CLAUDE.md` na raiz já passa as regras do projeto para o Claude. Leia também `docs/canal-claudes.md`.
- O `.claude/settings.json` já libera os comandos de teste e bloqueia ler o `.env` e dar push na `main`.
- Preferências pessoais vão em `CLAUDE.local.md` (não vai para o GitHub).
- Se algo não funcionar, peça ao Claude: "rode `npm run doctor` e resolva o que ele apontar, seguindo docs/ambiente.md".
  Se não der, ele abre uma Issue com o resultado do doctor e o label `para-claude-diogo`.
