# Arquitetura do Supply Dock

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
- **Ninguém concede o que não tem**: um admin não promove ninguém (nem a si mesmo) acima do próprio nível, nem em permissões, nem em alcance, nem em bases/regionais (regras E4 e E6).
- **A administração também respeita o alcance**: a lista de usuários usa `usersScopeWhere(user)`; um admin regional só vê os usuários da sua regional.

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
- Estoque: toda alteração de saldo passa pelo motor do estoque (`src/modules/estoque/engine.ts`). Nenhum outro módulo altera saldo direto. Ver "Estoque" abaixo.

## Estoque

- **Motor único** (`engine.ts → move()`): trava a linha do saldo com `SELECT … FOR UPDATE`, aplica a regra pura (`rules.ts → applyMovement`), grava o saldo e a linha do livro-razão. Tudo na transação do chamador.
- **Concorrência**: produtos diferentes andam em paralelo; o mesmo produto entra em fila. Os itens são sempre travados em ordem de `produtoId` (e as bases de uma transferência, em ordem de id) para não haver deadlock.
- **Defesa em profundidade**: CHECK no banco impede físico/reservado negativos mesmo se alguém furar o service.
- **Para o módulo de solicitações** (`api.ts`), dentro da mesma transação da mudança de status:

  ```ts
  import { reservar, liberarReserva, baixarReserva, STOCK_TX } from "@/modules/estoque/api";

  await db.$transaction(async (tx) => {
    await tx.solicitacao.update({ where: { id }, data: { status: "APROVADA" } });
    await reservar(tx, { solicitacaoId: id, almoxarifadoId, actorId: user.id, itens });
  }, STOCK_TX);
  // recusa/cancelamento: liberarReserva(tx, { solicitacaoId, actorId })
  // envio:               baixarReserva(tx, { solicitacaoId, actorId, enviados? })  — parcial libera o resto
  ```

- **Testes**: regras puras em `rules.test.ts` (`npm test`); ponta a ponta e concorrência em `estoque.integration.test.ts` (`npm run test:integration`), que no CI roda contra um PostgreSQL real. O `prisma dev` local atende uma conexão por vez, então localmente a concorrência fica em fila.

## Idioma e tema

O portal tem dois idiomas (**português** e **chinês simplificado**) e dois temas (**claro** e **escuro**).
O seletor `PT | 中文` e o botão sol/lua ficam no cabeçalho e na tela de login.

- **Textos de tela** saem de `src/i18n/messages/pt-BR.ts` e `zh-CN.ts`. Nada de texto solto no JSX.
  - Server Component, `generateMetadata`: `const t = await getT(); t("estoque.titulo")` (`@/i18n/server`).
  - Client Component: `const t = useT();` (`@/i18n/client`).
  - Valores: `t("usuarios.total", { n: 3 })` com `{n}` no texto.
  - O `zh-CN.ts` tem o tipo do `pt-BR.ts`: chave faltando ou sobrando quebra o typecheck.
    O teste `src/i18n/i18n.test.ts` confere também os `{campos}`.
- **Mensagens do servidor** (DomainError, validação Zod, `error`/`message` das actions) continuam em
  português no código. Quem mostra na tela passa por `useServerMessage()` (o `<ActionForm>` já faz),
  que traduz pelo catálogo `src/i18n/server-messages.ts`. **Mensagem nova precisa entrar nesse catálogo**:
  o teste varre o código e falha se faltar.
- **Menu, permissões, perfis padrão, tipos de base e de movimento** continuam definidos em `src/lib` e nos
  módulos. A tradução é achada pela chave (`src/i18n/labels.ts`); item novo sem tradução aparece em português.
- **Datas**: `fmtDateTime(data, t.locale)`.
- **Dados** (nome de produto, regional, textos da auditoria) não são traduzidos: aparecem como foram digitados.
- **Idioma** fica no cookie `portal_lang`, lido no servidor. **Tema** fica no `localStorage` (`portal_theme`) e
  um script no `<head>` aplica antes da página aparecer; sem escolha, segue o sistema operacional.

### Cores (J&T)

Tokens em `src/app/globals.css`, para os dois temas: `primary` é o vermelho J&T (#E60012), `header-*` a faixa do
topo (vermelha no claro, grafite com filete vermelho no escuro), `success` e `warning` para estado.
Use as classes dos tokens (`bg-primary`, `text-muted-foreground`, `text-success`), nunca cores fixas como
`text-emerald-700`, que somem no tema escuro.

### Gráficos

Todo gráfico (barra, coluna, ponto, linha) mostra os detalhes num cartão que segue o mouse:
envolva a marca com `<ChartTooltip title rows note>` (`src/components/chart-tooltip.tsx`).
Os textos do cartão também vêm do dicionário.

### Tela de login

Painel vermelho J&T com o Brasil em pontos (`src/components/brasil-mapa.tsx`): as rotas se desenham a partir do almoxarifado
e duas encomendas percorrem as linhas. É a única animação da tela; com "reduzir movimento" fica tudo parado e já desenhado.
Os pontos vêm de `src/components/brasil-mapa-dados.ts`, **gerado** por `node scripts/gen-mapa-brasil.mjs` (não editar à mão).
É só ilustração, sem dado real: nada de números ou nomes de bases na tela de login, que é pública.

## Notificações (sino + Feishu)

Trazido do sistema antigo de insumos. Regras S7 e S8 em `regras-de-negocio.md`.

- **Evento → avisos**: `modules/solicitacoes/notify-rules.ts` (puro, com teste) decide os públicos e o texto; `notify.ts` acha os usuários pela **permissão e alcance** (não por cargo fixo), grava o sino (`Notification`) e enfileira o cartão do Feishu (`FeishuOutbox`) **na mesma transação** do evento.
- **Envio**: depois da action, `flushFeishuSoon()` manda a fila sem atrasar a tela; o que falhar tenta de novo (1 min, 5 min, 15 min, 1 h, 3 h) pelo agendador. Duas execuções não mandam a mesma mensagem (a linha é "reservada" antes).
- **Um cartão por pedido** (`FeishuCartao`, 2026-11-25): o `message_id` de cada cartão enviado fica guardado por (solicitação, destino). Cada mudança de status **edita o mesmo cartão** (PATCH `im/v1/messages/:id`, o cartão tem `update_multi: true`) com status, cor, itens e andamento atuais, em vez de mandar outro; quem já tem o cartão e não é avisado do evento é editado em silêncio (`FeishuOutbox.soAtualiza`, nunca cria cartão novo). O Feishu só deixa editar até 14 dias (usamos 13): depois disso sai um cartão novo. Linhas da mesma solicitação e destino saem em ordem, uma por vez (`refId`). Comentário não mexe no cartão. Na última tentativa, uma edição que falha vira cartão novo.
- **Destinos** (`lib/feishu/outbox.ts`): equipe = grupo (app) > webhook > mensagem direta; expedição = webhook próprio > equipe; base = mensagem direta (`User.feishuOpenId`) + grupo da base (`Base.feishuChatId`).
- **Agendador**: `netlify/functions/agendador.mts` chama `POST /api/cron/run` (com `CRON_SECRET`) a cada 15 min em horário comercial: lembretes, resumo diário, fila do Feishu, limpeza de fotos de envio (180 dias) e de notificações lidas (90 dias).
- **Admin**: `/admin/feishu` (permissão `integracoes.gerenciar`) mostra a configuração, envia teste e reenvia o que falhou.
- **Sino na tela**: o sino do cabeçalho (`components/notification-bell.tsx`) abre um balão com os 15 avisos mais recentes (`recentNotifications` em `modules/notificacoes/queries.ts`); clicar num aviso marca como lido e abre o link dele, e "Marcar todas" zera o contador. Não existe página `/notificacoes`. O contador usa `unreadCount(user.id)` (o ícone no cabeçalho é do front, Eduardo).
- **Outro módulo quer avisar?** Siga o mesmo padrão: regras puras → `tx.notification.createMany` + `enqueue(tx, ...)` na transação → `flushFeishuSoon()` na action.

## Escala (≈ 5.000 usuários)

- Toda lista é **paginada** no banco (50 por página) e filtrada pelo alcance do usuário. Nada de `findMany` sem `take` em tabela que cresce.
- Índices em todas as colunas de filtro/ordenação das telas (ver `schema.prisma`).
- Serverless: poucas conexões por instância (`DATABASE_POOL_MAX`, padrão 3) e o pooler do Supabase na frente.
- Operações de estoque usam `STOCK_TX` (timeout de 30 s) por causa de inventários grandes.

## Divisão de responsabilidades

| Área | Responsável |
|---|---|
| Núcleo: arquitetura, banco, login, permissões, auditoria, deploy, CI | **Diogo** |
| Estoque e movimentações | **Diogo** |
| Produtos (catálogo), ciclo de 3 meses e limites (S1–S3) | **Eduardo** |
| Solicitações, aprovação, separação e expedição (trazidos do sistema antigo) | **Diogo** (decidido em 2026-11-13) |
| Rastreio, Feishu, relatórios operacionais | **Eduardo** |
| Visual, dashboard, testes, revisão de PRs | **Os dois** |

## Decisões registradas

| Data | Decisão | Motivo |
|---|---|---|
| 2026-11-12 | Next.js full-stack em vez de React + Express separados | Um projeto só; cada dev entrega tela + backend do seu módulo sem depender do outro |
| 2026-11-12 | Sessão no banco em vez de JWT | Desativar usuário ou mudar perfil vale na hora |
| 2026-11-12 | Permissões por catálogo + tipos de acesso editáveis | Modelo do portal do Eduardo, já validado na operação |
| 2026-11-12 | Administração de usuários filtrada pelo alcance (revisão do PR #1) | Permite admins regionais sem abrir brecha para conceder acesso fora da área |
| 2026-11-12 | Limpeza de sessões e tentativas de login em ~1% dos logins | Tabelas não crescem sem parar; não precisa de job agendado |
| 2026-11-12 | Importação de usuários lida no navegador e enviada em lotes (500 para conferir, 25 para gravar) | Cada requisição cabe no limite de 10 s do Netlify; 5.000 usuários ≈ 11 min com barra de progresso |
| 2026-11-12 | Senha temporária com bcrypt custo 8 (a escolhida pela pessoa segue com 11) | Senha aleatória de ~69 bits não depende do custo; importar em massa ficou 5× mais rápido |
| 2026-11-13 | Avisos iguais ao sistema antigo (sino + Feishu com fila de saída), destinatários por permissão e alcance | Já validado na operação; permissão/alcance substituem os cargos fixos do sistema antigo |
| 2026-11-13 | Horário comercial e prazos dos lembretes como constantes no código (sem tela de configuração) | Menos coisa para manter agora; dá para virar configuração depois |
| 2026-11-25 | Abas da lista de solicitações são links (`?status=<aba>`) com contagem por `groupBy` de status, e `AbasNav` rola até a aba ativa | Cada aba tem URL própria (compartilhável, funciona com os atalhos da home); uma consulta só conta todas as abas |
| 2026-11-12 | Construir do zero usando os 3 projetos como referência | Evita herdar o monolito Flask e o escopo financeiro do sistema-estoque |
| 2026-11-12 | Model `Produto` mínimo criado pelo Diogo; o resto é do Eduardo (Issue #3) | Estoque precisava de produto; Eduardo acrescenta campos em migrations novas |
| 2026-11-12 | Reserva na aprovação, baixa no envio (Issue #4) | Físico sempre certo e duas aprovações não prometem o mesmo item |
| 2026-11-12 | Trava de linha (`FOR UPDATE`) + regra pura, em vez de update condicional | Uma regra só, testável, e correta com muitos usuários simultâneos |
| 2026-11-12 | Testes de integração com Postgres real no CI | Concorrência só se prova com conexões paralelas de verdade |
| 2026-11-12 | Idiomas pt-BR e zh-CN com dicionário tipado próprio, sem biblioteca de i18n | Dois idiomas só; o TypeScript acusa tradução faltando e não muda as rotas |
| 2026-11-12 | Mensagens do servidor traduzidas por catálogo na tela, não nos services | Os módulos seguem lançando DomainError em português; um teste garante que toda mensagem tem tradução |
| 2026-11-12 | Tema no `localStorage` + script no `<head>`; idioma em cookie | Tema sem piscar e sem ida ao servidor; idioma precisa ser conhecido no servidor para traduzir a página |
| 2026-11-13 | Login com mapa de pontos gerado por script, em vez de imagem ou biblioteca de mapas | Um único `path` (≈19 KB), segue o tema claro/escuro por `currentColor` e não depende de serviço externo |
| 2026-11-12 | Perfil "Expedição" só com `expedicao.enviar`; a fila da expedição é liberada por essa permissão, sem `solicitacoes.ver` (E9) | Quem é da expedição não enxerga as solicitações de outras etapas |
| 2026-11-12 | Ninguém (exceto Dev) edita o próprio tipo de acesso (E8) | Com o Administrador gerenciando perfis (#9), evita que um admin derrube o acesso de todos |
| 2026-11-13 | Solicitações, separação e expedição trazidas do sistema antigo pelo Diogo, sem mudar o layout do portal (Issue #2) | O sistema antigo já tem isso testado na operação; o Eduardo fica com produtos e relatórios |
| 2026-11-13 | Envio pela rota `/api/expedicao/enviar` (multipart), não server action | A foto passa do limite de 1 MB das server actions |
| 2026-11-13 | Almoxarifado que atende é escolhido na aprovação (o da regional da base vem sugerido) | Não existe vínculo fixo base → almoxarifado |
| 2026-11-13 | Telas de solicitações, separação, expedição e guia traduzidas (`solicitacoes.*`, `camera.*`); o status vem de `solicitacoes.status.*` (via `statusText`) e os badges usam só tokens do tema | Antes tinham texto fixo em português e cores cruas do Tailwind, que não traduziam nem funcionavam no escuro. A guia impressa continua em papel branco com tinta preta, de propósito |
| 2026-11-13 | Termos em chinês: **申领单** para solicitação e pedido, **产品** para produto/insumo nas tabelas (**物料** só no nome do menu e do botão "Solicitar insumos") | Um nome só para a mesma coisa em todas as telas e mensagens (alinhado com o Diogo no PR #9) |
| 2026-11-13 | Importação de usuários traduzida (`importacao.usuarios.*`, reaproveitando `importacao.*`); mensagens de erro das linhas passam por `server-messages.ts`, e os campos que mudam ("name, phone") aparecem pelo nome traduzido | Era a única tela de importação ainda em português (pedido do Claude do Diogo na Issue #18) |
| 2026-11-14 | Cadastro de produtos em `/produtos` (lista + formulário), sem preço no catálogo: o custo médio vem do estoque e só aparece com `produtos.precos` (P1–P5) | O valor do insumo nasce na NF de entrada (K5); guardar um preço no produto criaria duas fontes de custo |
| 2026-11-14 | No formulário de produto, `active` aceita o campo ausente (`checkbox.optional()`); o helper `checkbox` de `lib/form.ts` recusa caixa desmarcada no zod 4.6.7 | Achado ao testar na tela; a correção do helper é do Diogo (núcleo) e foi avisada na Issue #18 |
| 2026-11-17 | Login pelo Feishu (OAuth v2) com base e regional detectadas pelo organograma e criadas na hora se faltarem (E11); `Base/Regional.feishuDepartmentId` liga o departamento à base | O nome muda no Feishu, o id não; a base nova fica marcada (`autoCreated`) para o admin revisar |
| 2026-11-17 | Nome do sistema passa a ser **Supply Dock** (antes "Portal ADM"); repositório e pacote seguem `jt-portal-adm` | Já é o nome do app no Feishu (aprovado pela China em 17/11); um nome só em todo lugar |
| 2026-11-18 | Início com cartões de solicitações (aguardando, em separação, enviadas no mês, com série de 7 dias), solicitações recentes, contadores no menu (aprovar/separar/enviar) e avatar no topo | Deixar o portal igual ao protótipo; os números vêm de `resumoSolicitacoes`/`contadores` (`modules/solicitacoes/queries.ts`), dentro do alcance de quem vê |
| 2026-11-19 | Primeiro usuário Dev criado pelo deploy (`scripts/primeiro-acesso.ts`, só com `FIRST_ADMIN_PASSWORD`), nunca altera usuário existente | Permite entrar em produção sem terminal nem senha no Git; ver `docs/hospedagem.md` |
| 2026-11-23 | Grupos do Feishu por regional: `Regional.feishuStaffChatId` e `feishuShippingChatId` (equipe e expedição); `destinations()` recebe a regional e cai no grupo geral se ela não tiver grupo; lembretes e resumo saem um cartão por regional | SPN e MG têm equipes e expedições separadas (4 grupos). Pelo app do Feishu (chat_id), não por webhook: não guarda URL com acesso para postar no banco. O aviso usa a regional da base até existir almoxarifado, e a do almoxarifado depois |
| 2026-11-24 | Planilhas de importação aceitam `.xlsx` (lidas no navegador com `read-excel-file`, baixada só quando se escolhe um .xlsx); modelo e exportação de bases geradas no servidor com `write-excel-file` (+ `@onparallel/write-excel-file-data-validation` para as listas suspensas); a tela de Regionais e bases só recebe do servidor o que mostra (os links de webhook do Feishu não vão para o navegador) | Pedido do Eduardo: modelo em Excel, exportar e importar. Biblioteca leve (sem ExcelJS, que pesa 20 MB) |
| 2026-11-24 | Seletores padrão `Combobox` (campo com sugestões: busca por código/nome sem acento, destaque, teclado, texto livre opcional) e `SelectBox` (substitui todo `<select>`), em `components/ui/combobox.tsx`; regras puras em `combobox-rules.ts`. Acabaram o `<datalist>` e o `<select>` do navegador | O `<datalist>` mostrava lista própria do navegador e não aparecia com a base ainda não escolhida. `SelectBox` lê os `<option>` filhos e leva o valor em um campo escondido, então formulário comum (GET) e `required` seguem funcionando |
| 2026-11-24 | `Solicitacao.outrosItens` (JSON) guarda itens digitados fora do cadastro (S13); `planQuantities` aceita pedido sem item de estoque (`permitirVazio`) | Pedido do Eduardo: não bloquear a base quando o insumo ainda não foi cadastrado. Texto puro, sem mexer na área de estoque |
| 2026-11-25 | `FiltroForm` (`components/filtro-form.tsx`): todo formulário de filtro/busca de lista é GET e atualiza a URL sozinho, ao digitar (0,25 s) e ao trocar seletor/caixa, sem Enter nem "Filtrar". `SelectBox` avisa o formulário com um `change` | Pedido do Eduardo. Os campos continuam `name`/`defaultValue` e a página lê os mesmos parâmetros; como não remonta o formulário, foco e cursor ficam no lugar. Lista nova com busca usa `FiltroForm` |
| 2026-11-25 | S16 "um pedido por vez": `pedidoEmAndamento(tx, baseId)` em `limites.service.ts` olha `ABERTOS` e é chamada em `checkBeforeCreate` (dentro do `lockBase`, então dois envios simultâneos não passam) e nas 3 telas de pedido (`emAndamento` no `PedidoForm`, que avisa e desabilita o envio). Vale para BASE e FRANQUIA, independe do ciclo S1 e do toggle `cicloAtivo`; só quem tem `solicitacoes.aprovar` fica de fora. Sem migration. |
| 2026-11-25 | S17 cancelar item: `SolicitacaoItem.cancelledAt/cancelNote` (item do cadastro) e `cancelado: { motivo, em }` dentro de cada entrada de `Solicitacao.outrosItens` (item digitado, identificado pela posição na lista). Evento novo `SolicitacaoEventoTipo.ITEM_CANCELADO` (histórico) e `Evento { tipo: "itemCancelado" }` em `notify-rules.ts` (aviso só para a base). `cancelarItem` trava `pedido-item:<id>` (advisory lock) para dois cancelamentos simultâneos não sobrescreverem o JSON, zera `approved` do item e solta o bloqueio de produto que ele causou; `usedInPeriod` ignora item cancelado. Só em PENDENTE: depois da aprovação exigiria liberar reserva por item (`estoque/api`, área do Diogo). Migration `20261125110000_solicitacao_item_cancelado`. |
| 2026-11-25 | Criar conta pública (`/cadastro`, fora de `(app)`): `cadastroSchema` + `criarContaFranquia`/`opcoesCadastro` em `modules/acessos/cadastro*.ts`; limite por IP em `lib/auth/rate-limit.ts` (`isSignupBlocked`, usa `LoginAttempt` com o login `#cadastro`, que nenhum usuário real pode ter); moldura das telas de fora do sistema em `components/auth-shell.tsx` (login e cadastro) | Pedido do Eduardo (E20): a franquia cria o próprio acesso. Perfil fixo `franquia`; a tela é pública, por isso o limite por IP e a validação da franquia/regional no servidor |
| 2026-11-25 | Notificação do navegador das dúvidas (E21): `DuvidasAvisos` (no layout de `(app)`) consulta `novosAvisosDuvidaAction` a cada 30 s, **só se a pessoa deu permissão** (sem permissão não há consulta), e mostra `new Notification`; a hora da última checagem vem do servidor (menos 20 s de folga) e fica no `localStorage` com os ids já mostrados (sem repetir; com `try/catch`). Janela de 10 min para o que chegou com a aba parada | Pedido do Eduardo. Polling em vez de push: não exige service worker, VAPID nem tabela nova; o custo fica só com quem ativou. Limite: não avisa com o navegador fechado |
| 2026-11-25 | `AutoAtualizar` (`components/auto-atualizar.tsx`): `router.refresh()` a cada N s e ao voltar para a aba, parado com a aba escondida ou offline; não perde campo nem diálogo aberto. Usado na tela de Usuários (15 s) e, via `AutoAtualizarAguardando` no layout, só para quem está "Aguardando liberação" (8 s). `Abas` (`components/abas.tsx`): abas por URL com contador. Usuários: aba `?aba=pendentes`; a lista exclui o perfil `aguardando` ativo | Pedido do Eduardo (E22). Atualização por polling do servidor (sem websocket nem tabela nova): custo só para quem está na tela ou aguardando; as permissões já são lidas do banco a cada requisição, então o refresh basta para liberar o menu |
| 2026-11-25 | Feishu por regional, visibilidade: `origemDoGrupo()` (`lib/feishu/outbox.ts`) diz de onde sai o aviso de cada regional (própria, insumos, geral, `oc_` sem app, nenhum) e a tela Feishu usa isso + teste por regional (`sendTestAction(alvo, regionalId)`) + rótulo do grupo em cada mensagem. Webhook de regional não é mais assinado com o segredo do webhook geral (`sendWebhookCard(..., "")`). `notify-regional.integration.test.ts` garante que MG e SPN não se misturam. |
| 2026-11-25 | Feishu pelo app/bot da J&T, sem webhooks: `lib/feishu/send.ts` (`sendAppCard` devolve o `message_id`, `updateAppCard`, `deliver` edita se já há cartão), `getTenantAccessToken("login"|"bot")` com cache por app, `botConfig()` (`FEISHU_BOT_APP_ID/SECRET`), `FeishuCartao` + `FeishuOutbox.refId/soAtualiza` (migration `20261125150000_feishu_cartao_atualizavel`, que também apaga webhook cadastrado nas regionais). Cartão montado por `cartaoPedido` (`notify-rules.ts`, puro). Mensagem direta: o `open_id` do login vira `union_id` (o open_id é por app) | Pedido do Eduardo: usar o app/bot da J&T (grupos Insumos e Expedição de SP e MG com o mesmo bot) e atualizar o mesmo cartão a cada status. O Feishu só edita cartão `update_multi` e com até 14 dias. Área do Diogo (`lib/feishu`, schema) alterada com autorização do Eduardo, em commit separado |
| 2026-11-25 | **Filtros lembrados no site todo:** `FiltroForm` (listas filtradas pela URL) guarda os campos em `sessionStorage` por tela (`filtros-lembrados.ts`, regras puras com teste) e restaura ao entrar sem filtro na URL (link com filtro, ex.: o painel, vale mais); mostra "Limpar filtros" quando há filtro. Listas que filtram no navegador (`ListaBases`) usam `useFiltroLembrado`. Só na sessão da aba (fechou, começa limpo). Regionais e bases: chips por regional com contagem, regionais fechadas por padrão e abertas ao filtrar; Usuários: busca maior e filtros de regional, base e último acesso | Pedido do Eduardo: voltar da ficha do registro e encontrar a lista como estava; achar SP sem rolar. Sem banco nem cookie: custo zero. Limite: um instante da lista sem filtro antes de aplicar o lembrado; vale por aba. Mexe em áreas do Diogo (estrutura, usuários, componentes), com autorização do Eduardo, em commit separado |
| 2026-11-25 | **Minhas bases em 3 abas (E23):** `?aba=escolher\|minhas\|supervisores` em `app/(app)/minhas-bases/`. Cada aba é um componente cliente (`escolha.tsx`, `minhas.tsx`, `supervisores.tsx`) sobre `partes.tsx` (cartões marcáveis, blocos por regional, barra de ação) e regras puras com teste em `filtro.ts`. Escolher *adiciona* (junta as marcadas às que a pessoa já tem) e Minhas *libera* (salva o que sobrou, vazio inclusive): as duas usam a mesma action e `escolherMinhasBases`, que passou a aceitar lista vazia. A aba Supervisores lê `supervisoresComBases()` (só leitura), agrupa por regional (`agruparSupervisoresPorRegional`, pura e testada) e abre o detalhe num `Dialog` com fundo desfocado. A página inteira usa `AutoAtualizar` (10 s): a base pega ou liberada por outro supervisor aparece/some sozinha e a seleção é podada (`podarSelecao`). Sem tempo real por websocket: o `router.refresh()` basta e não exige infraestrutura nova. |
| 2026-11-25 | **Expedição/separação por regional (E24):** `CurrentUser.baseRegionalIds` (regionais das bases vinculadas, carregado em `getCurrentUser`) + `canAccessAlmoxarifado` / `almoxarifadosExpedicaoWhere` em `lib/permissions/check.ts`, usados só nas filas, nas ações de separar/enviar e no aviso (`usuariosCom` com `viaBaseDaRegional`). Não alarga o `baseScopeWhere`: o resto do sistema não muda de alcance. |
| 2026-11-26 | **Página de lacres só da franquia (S19):** `produtosParaPedir({ lacres: "todos" })` em Solicitar insumos (a base pede insumo e lacre ali); `ehLacre()` (regra pura em `modules/solicitacoes/rules.ts`, espelha `EH_LACRE` de `queries.ts`) é usada em `criar()` só para a S13 (franquia só pede lacre). "Solicitar lacres" saiu de `navigation.ts`/`labels.ts`; `/solicitacoes/lacres` redireciona para `/franquias/lacres`. |
| 2026-11-26 | **Aba Pessoas em Regionais e bases (E25):** `?aba=pessoas` em `app/(app)/admin/estrutura/` (`pessoas.tsx`, cliente: busca, filtro por tipo de acesso, cartão + detalhe com fundo desfocado, igual à aba Supervisores). Dados em `pessoasComBases()`/`contarPessoasComBases()` (`modules/estrutura/service.ts`, só o necessário: sem e-mail, telefone ou matrícula) e regras puras com teste em `modules/estrutura/pessoas.ts`. `AutoAtualizar` (10 s) só nessa aba; a página só carrega a lista quando a aba está aberta e só a mostra com `usuarios.ver`. |
| 2026-11-26 | **Franquia: duas vagas por ciclo (S20):** `CicloBase` ganhou `insumosSolicitacaoId` e `lacresSolicitacaoId` (migration `ciclo_franquia_vagas`): a franquia usa a mesma linha de ciclo da base, mas o ciclo fica *aberto* (`blockedUntil = agora`, sem bloquear) até as duas vagas terem pedido vivo; aí `blockedUntil = envio + meses` e `sourceSolicitacaoId` = pedido que completou o par (o `onShipped` reconta do envio). Regras puras com teste em `limites.ts` (`estadoCicloFranquia`, `cicloFranquiaAcabou`) e `rules.ts` (`tipoPedidoFranquia`); banco em `limites.service.ts` (`estadoFranquia`, `avisosDoPedido`, `pedidoEmAndamento(…, tipo)`). Vaga "viva" = pedido contado (não recusado/cancelado), então recusar devolve a vaga sem código extra. Tela: `franquias/pedido-franquia.tsx` serve `/franquias/insumos` e `/franquias/lacres`. A S13 (franquia só pede lacres) caiu. Duração padrão do ciclo: 1 mês (`DEFAULT_PEDIDO_SETTINGS`, `lib/settings.ts`, área do Diogo, commit separado); o valor salvo em Configurações, se existir, continua valendo. |
| 2026-11-26 | **Editar quantidade pedida (S21):** `editarQuantidade` em `modules/solicitacoes/service.ts`, no mesmo molde do `cancelarItem` (trava consultiva por pedido, `allowed(user, "aprovar")`, só `PENDENTE`). Novo valor `QUANTIDADE_ALTERADA` no enum `SolicitacaoEventoTipo` (migration `solicitacao_quantidade_alterada`); a nota do evento guarda `item: de → para` em texto neutro e o histórico mostra quem e quando. Sem notificação ao solicitante (o Eduardo pediu só o histórico). Sobrescreve `requested` do item: o valor original só fica no histórico. UI: `EditarQuantidadeForm` (campo inline na linha do item). |
| 2026-11-27 | **Bases só pedem segunda e terça (S22):** regra pura `baseNoDiaDePedir(now)` em `modules/solicitacoes/limites.ts` (dia da semana via `Intl` no fuso `America/Sao_Paulo`, para a terça às 23h30 não virar quarta por causa do UTC), usada em `checkBeforeCreate` (só tipo BASE e só quem não aprova) e em `avisosDoPedido` (aviso e botão desligado na tela). Os dias são constantes, não configuração: o Eduardo pediu uma regra fixa; virar chave em Configurações custaria só mover `DIAS_PEDIDO_BASE` para `lib/settings.ts` (área do Diogo). **Testes de integração:** `src/test/dia-de-pedir.ts` (setup do `vitest.integration.config.mts`) deixa a regra sempre liberada, senão o CI quebraria de quarta a domingo; o teste do S22 liga a regra de verdade com `globalThis.__regraDoDiaDePedir` e falseia só o `Date` dentro dele. |
