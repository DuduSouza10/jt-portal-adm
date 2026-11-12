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

## Solicitações (a definir — Eduardo)

- **S1.** Ciclo de troca de 3 meses para bases (franquia não tem ciclo). _Detalhar: conta a partir de quê? aprovação ou envio?_
- **S2.** Base informa o número de pessoas a cada pedido. _Isso limita quantidades?_
- **S3.** Limites por produto. _Por pedido? Por pessoa? Por ciclo?_
- **S4.** Status: _listar e definir quem muda de qual para qual._

## Expedição (a definir — Eduardo)

- _…_

## Estoque (a definir — Diogo)

- **K1.** Saldo é por almoxarifado (base do tipo ALMOXARIFADO) e produto.
- **K2.** Toda mudança de saldo gera uma movimentação (entrada, saída, ajuste, transferência) com autor e motivo.
- **K3.** Saldo nunca fica negativo. _Confirmar._
- **K4.** Aprovar solicitação reserva/baixa estoque? _Definir com Eduardo: na aprovação ou no envio?_
