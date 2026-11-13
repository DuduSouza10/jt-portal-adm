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
- **E10.** Importação por planilha (CSV): quem já existe é encontrado pela **matrícula** (ou pelo login); o login e a senha de quem já existe não mudam; célula vazia não apaga e-mail/telefone; ativo = "não" desliga o acesso na hora (ex.: desligado no RH); quem não está na planilha não é tocado. Quem importa só concede o que tem (E4, E6) e não altera o próprio usuário. Novos recebem senha temporária, exibida uma única vez para download. → `modules/acessos/importacao*.ts`

## Solicitações (a definir — Eduardo)

- **S1.** Ciclo de troca de 3 meses para bases (franquia não tem ciclo). _Detalhar: conta a partir de quê? aprovação ou envio?_
- **S2.** Base informa o número de pessoas a cada pedido. _Isso limita quantidades?_
- **S3.** Limites por produto. _Por pedido? Por pessoa? Por ciclo?_
- **S4.** Status: _listar e definir quem muda de qual para qual._

## Expedição (a definir — Eduardo)

- _…_

## Estoque (Diogo) — implementado em `src/modules/estoque`

- **K1.** Saldo é por almoxarifado (base do tipo ALMOXARIFADO) × produto. Três números: **físico**, **reservado** e **disponível** (= físico − reservado). → `StockBalance`
- **K2.** Toda mudança de saldo gera uma linha no livro-razão (`StockMovement`) com tipo, quantidade, saldo depois, autor, documento e motivo. Nunca editada nem apagada. A soma das movimentações sempre bate com o saldo (teste de integração).
  - Entrada exige nota fiscal/documento. Saída exige motivo. Inventário exige motivo/referência.
- **K3.** O saldo **físico nunca fica negativo**: saída, transferência, reserva e baixa falham se faltar saldo, e o banco também recusa (CHECK). O **inventário define** o físico para a quantidade contada (≥ 0). Se a contagem ficar abaixo do reservado, o inventário é aceito, o **disponível fica negativo** e o sistema alerta para revisar as solicitações aprovadas. _Decidido na Issue #4 (confirmado pelo Eduardo)._
- **K4.** Solicitações mexem no estoque assim: **aprovação reserva** (disponível cai, físico não) → **envio baixa** o que saiu, podendo ser parcial, e libera o resto → **recusa/cancelamento libera** a reserva. Saída manual não pode usar o que está reservado. _Decidido na Issue #4._ → `src/modules/estoque/api.ts`
- **K5.** Transferência entre almoxarifados é uma operação só: sai da origem e entra no destino juntos, ou nada acontece. O destino pode estar fora do alcance de quem envia.
- **K6.** Estoque mínimo por almoxarifado × produto. A tela de saldos destaca o que está abaixo do mínimo.
