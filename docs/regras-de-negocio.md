# Regras de negócio

Documento do **Eduardo** (dono da operação). Registre aqui cada regra antes de implementar,
para os dois (e a IA) terem a mesma referência.

Formato sugerido: regra numerada, exemplo concreto, e onde está no código.

## Estrutura e acesso (núcleo — já implementado)

- **E1.** Toda base pertence a exatamente uma regional. → `Base.regionalId`
- **E2.** Tipos de base: Base, Franquia, Almoxarifado. → `BaseType`
- **E3.** Perfil com alcance BASE precisa de ao menos uma base; REGIONAL, de ao menos uma regional. → `modules/acessos/rules.ts`
- **E4.** Ninguém concede permissão que não tem. → `isSubsetOf`
- **E5.** Senha criada ou redefinida pelo admin é temporária: troca obrigatória no primeiro acesso.

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
- **K3.** O saldo **físico nunca fica negativo**: saída, transferência, reserva e baixa falham se faltar saldo, e o banco também recusa (CHECK). O **inventário define** o físico para a quantidade contada (≥ 0). Se a contagem ficar abaixo do reservado, o inventário é aceito, o **disponível fica negativo** e o sistema alerta para revisar as solicitações aprovadas. _Decidido na Issue #4 (aguardando o ok final do Eduardo)._
- **K4.** Solicitações mexem no estoque assim: **aprovação reserva** (disponível cai, físico não) → **envio baixa** o que saiu, podendo ser parcial, e libera o resto → **recusa/cancelamento libera** a reserva. Saída manual não pode usar o que está reservado. _Decidido na Issue #4._ → `src/modules/estoque/api.ts`
- **K5.** Transferência entre almoxarifados é uma operação só: sai da origem e entra no destino juntos, ou nada acontece. O destino pode estar fora do alcance de quem envia.
- **K6.** Estoque mínimo por almoxarifado × produto. A tela de saldos destaca o que está abaixo do mínimo.
