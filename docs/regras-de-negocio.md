# Regras de negócio

Documento do **Eduardo** (dono da operação). Registre aqui cada regra antes de implementar,
para os dois (e a IA) terem a mesma referência.

Formato sugerido: regra numerada, exemplo concreto, e onde está no código.

## Estrutura e acesso (núcleo — já implementado)

- **E1.** Toda base pertence a exatamente uma regional. → `Base.regionalId`
- **E2.** Tipos de base: Base, Franquia, Almoxarifado. → `BaseType`
- **E3.** Perfil com alcance BASE precisa de ao menos uma base; REGIONAL, de ao menos uma regional. → `modules/acessos/rules.ts`
- **E4.** Ninguém concede permissão que não tem. → `isSubsetOf`
- **E5.** Senha criada ou redefinida pelo admin é temporária: troca obrigatória no primeiro acesso. Trocar a senha encerra as outras sessões do usuário.
- **E6.** A administração de usuários respeita o alcance: quem é REGIONAL só vê e gerencia usuários ligados às suas regionais/bases, só concede tipos de acesso com alcance igual ou menor que o seu e só vincula bases/regionais do seu alcance. Ninguém muda as próprias bases e regionais. → `modules/acessos/rules.ts` (`scopeWithin`, `linksOutsideScopeError`), `queries.ts`
- **E7.** Login: 5 senhas erradas do mesmo login e mesmo IP bloqueiam por 15 min; 30 de qualquer IP (ataque distribuído); 300 por IP (uma base inteira sai pelo mesmo IP). Escolha consciente: alguém de fora pode travar uma conta, mas precisa de 30 tentativas e o bloqueio dura só 15 min.
- **E8.** Ninguém edita o tipo de acesso que ele mesmo usa (só o Dev). Assim um Administrador não tira, sem querer, permissões de todos os administradores de uma vez. → `modules/acessos/rules.ts` (`ownProfileEditError`)
- **E9.** Acesso hierárquico (decisão do Diogo, 2026-11-12):
  - **Acesso completo** (perfil Dev): só quem o Diogo e o Eduardo liberarem.
  - **Base / Franquia**: só pedem insumos para a própria base e acompanham o andamento do pedido (aprovado, separado, na expedição, enviado). Não veem estoque, administração nem relatórios.
  - **Expedição**: só a expedição. Vê os pedidos já separados que aguardam envio e confirma o envio. Não vê as outras áreas.
  - O tipo de acesso de quem vem das bases é escolhido pelo Diogo/Eduardo quando a pessoa entra no sistema.
  - → `src/lib/permissions/default-profiles.ts` (teste em `default-profiles.test.ts`)
- **E10.** Importação por planilha (CSV): quem já existe é encontrado pela **matrícula** (ou pelo login); o login e a senha de quem já existe não mudam; célula vazia não apaga e-mail/telefone; ativo = "não" desliga o acesso na hora (ex.: desligado no RH); quem não está na planilha não é tocado. Quem importa só concede o que tem (E4, E6) e não altera o próprio usuário. Novos recebem senha temporária, exibida uma única vez para download. → `modules/acessos/importacao*.ts`

## Solicitações — implementado em `src/modules/solicitacoes` (Diogo, trazido do sistema antigo)

- **S1.** Ciclo de 3 meses (regra do portal do Eduardo, `jt-portal-insumos`). Só **base** (franquia não tem). Depois de pedir, a base não abre pedido novo até o fim do ciclo; quando o pedido é **enviado**, os 3 meses passam a contar do envio. O ciclo cai se o pedido de origem for recusado ou cancelado. **Pode ser tirado** (decisão do Eduardo, 2026-11-13): por base em Solicitações → Ciclos e bloqueios (`solicitacoes.liberar`, liberar ou mudar a data) ou para todas em Administração → Configurações (liga/desliga e nº de meses). → `modules/solicitacoes/limites.ts`, `limites.service.ts`
- **S2.** A base informa o **número de pessoas** em cada pedido (obrigatório, como no portal do Eduardo). É informativo: não limita quantidade. Aparece no pedido.
- **S3.** **Limite por produto** (portal do Eduardo): limite para base e para franquia, num período (padrão 60 dias). Soma o que a base pediu no período (pedidos não recusados/cancelados); passou do limite, o pedido é barrado com a mesma mensagem do sistema antigo. Ao atingir o limite, o produto fica **bloqueado** para a base até o fim do período; recusar/cancelar o pedido desfaz o bloqueio. Liberação manual na mesma tela do S1. Limites pela planilha de produtos (`limite_base`, `limite_franquia`, `dias_bloqueio`) até existir a tela de produtos.
- Quem aprova (`solicitacoes.aprovar`) não entra em S1–S3, como o admin no portal do Eduardo. As regras barram (não só avisam), como lá.
- **S4.** Status (proposta, igual ao sistema antigo + aprovação). → `modules/solicitacoes/rules.ts`

  | De | Para | Quem (permissão + alcance) |
  |---|---|---|
  | — | Aguardando aprovação | `solicitacoes.criar`, para uma base do seu alcance |
  | Aguardando aprovação | Aprovada (reserva o estoque) | `solicitacoes.aprovar`, base no alcance; escolhe o almoxarifado e pode aprovar menos que o pedido |
  | Aguardando aprovação | Recusada (motivo obrigatório) | `solicitacoes.aprovar` |
  | Aguardando aprovação ou Aprovada | Cancelada (devolve a reserva) | quem pediu ou `solicitacoes.aprovar` |
  | Aprovada | Em separação | `expedicao.separar`, almoxarifado no alcance |
  | Aprovada ou Em separação | Separada · na expedição | `expedicao.separar`; pode separar menos que o aprovado (fica "parcial") |
  | Separada | Enviada (baixa o separado e libera o resto) | `expedicao.enviar`, almoxarifado no alcance |
  | Enviada | Recebida | `solicitacoes.criar`, base no alcance |

- **S5.** Número do pedido: `SOL-000123` (sequencial). Toda mudança de status entra na linha do tempo do pedido (`SolicitacaoEvento`) e na auditoria.
- **S6.** Duas pessoas mexendo no mesmo pedido ao mesmo tempo: a segunda recebe "acabou de ser alterada por outra pessoa". O UPDATE confere o status lido.
- **S7.** Avisos (sino do portal + Feishu), igual ao sistema antigo. Quem fez a ação não é avisado; cada pessoa recebe um aviso por evento. → `modules/solicitacoes/notify-rules.ts`
  - **Nova:** quem aprova aquela base (`solicitacoes.aprovar` com alcance sobre ela). Urgente em destaque.
  - **Aprovada:** a base (quem pediu + quem pede por ela) e o almoxarifado que vai separar.
  - **Recusada, em separação, enviada:** a base. **Separada:** a base e a expedição ("pronto para envio").
  - **Cancelada:** pela base → quem aprova; por outra pessoa → a base. Se já estava aprovada, também o almoxarifado ("não separar").
  - **Recebida:** o almoxarifado. **Comentário:** "a outra parte" (base ↔ quem aprova e o almoxarifado).
  - Quem tem só o curinga (Dev) não recebe avisos de rotina.
- **S8.** Lembretes no Feishu, em horário comercial (seg–sex 08–18 h), por horas úteis paradas: aguardando aprovação há 4 h (urgente 1 h) → equipe; aprovada sem separar há 8 h → equipe; separada sem enviar há 4 h → expedição. Não repete o mesmo pedido antes de 4 h. Resumo diário das solicitações em aberto às 08:00 dos dias úteis. → `lib/jobs/select.ts`
- **S9.** SLA por etapa, contado a partir de quando a etapa passa a ser responsabilidade de alguém, em horas úteis: **aprovação** (criada → aprovada, quem aprova), **separação** (aprovada → separada, almoxarifado), **expedição** (separada → enviada). A **entrega** (enviada → recebida) é só informativa, em horas corridas. Prazos iniciais: aprovação 8 h (urgente 2 h), separação 24 h (urgente 4 h, igual ao sistema antigo), expedição 8 h (urgente 2 h). Prazos, horário comercial e feriados são editáveis em Administração → Configurações (`configuracoes.editar`). Relatório do mês em Relatórios (`relatorios.ver`), com exportação. → `modules/relatorios/sla.ts`, `lib/settings.ts`

## Separação e expedição — implementado (Diogo, trazido do sistema antigo)

- **X1.** Fila da separação: aprovadas e em separação dos almoxarifados do alcance, urgentes primeiro. Guia A4 com QR do pedido.
- **X2.** Fila da expedição: separadas dos almoxarifados do alcance, agrupadas por base, urgentes primeiro, e "enviados hoje".
- **X3.** Bipar a guia (leitor físico ou câmera do celular) acha o pedido e diz por que não pode enviar (ainda separando, já enviado, cancelado, outro almoxarifado). Aceita o QR ou o número (`SOL-000123`, `123`).
- **X4.** Envio em lote: vários pedidos na mesma viagem, com **ID da viagem** e **foto** obrigatórios (reduzida no celular, máx. 3 MB), volumes (só com 1 pedido) e observação. Um pedido que falhar não trava os outros.
- **X5.** A foto fica no banco (`ShipmentPhoto`) e só abre para quem pode ver algum pedido daquela viagem. A foto é apagada depois de 180 dias (o pedido continua).

## Estoque (Diogo) — implementado em `src/modules/estoque`

- **K1.** Saldo é por almoxarifado (base do tipo ALMOXARIFADO) × produto. Três números: **físico**, **reservado** e **disponível** (= físico − reservado). → `StockBalance`
- **K2.** Toda mudança de saldo gera uma linha no livro-razão (`StockMovement`) com tipo, quantidade, saldo depois, autor, documento e motivo. Nunca editada nem apagada. A soma das movimentações sempre bate com o saldo (teste de integração).
  - Entrada exige nota fiscal/documento. Saída exige motivo. Inventário exige motivo/referência.
- **K3.** O saldo **físico nunca fica negativo**: saída, transferência, reserva e baixa falham se faltar saldo, e o banco também recusa (CHECK). O **inventário define** o físico para a quantidade contada (≥ 0). Se a contagem ficar abaixo do reservado, o inventário é aceito, o **disponível fica negativo** e o sistema alerta para revisar as solicitações aprovadas. _Decidido na Issue #4 (confirmado pelo Eduardo)._
- **K4.** Solicitações mexem no estoque assim: **aprovação reserva** (disponível cai, físico não) → **envio baixa** o que saiu, podendo ser parcial, e libera o resto → **recusa/cancelamento libera** a reserva. Saída manual não pode usar o que está reservado. _Decidido na Issue #4._ → `src/modules/estoque/api.ts`
- **K5.** Valor dos insumos (decisão do Diogo, 2026-11-13): a entrada de estoque pode informar o **valor unitário da NF**; o saldo guarda o **custo médio ponderado**. Saldo sem custo conhecido não pesa (o custo passa a ser o da NF). Entrada sem valor não muda o custo. Transferência entra pelo custo médio da origem. Saída, transferência enviada e baixa gravam o custo médio no movimento. No envio de uma solicitação o custo de cada item fica gravado (`SolicitacaoItem.unitCost`): é a base do **gasto por base**. Valores só aparecem para quem tem `produtos.precos`. → `estoque/rules.ts` (`applyCost`)
- **K5.** Transferência entre almoxarifados é uma operação só: sai da origem e entra no destino juntos, ou nada acontece. O destino pode estar fora do alcance de quem envia.
- **K6.** Estoque mínimo por almoxarifado × produto. A tela de saldos destaca o que está abaixo do mínimo.
