import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { DomainError } from "@/lib/errors";
import { loadProdutos, move, newBatchId, produtoLabel } from "./engine";
import { normalizeItems, planShipment, type ItemInput } from "./rules";

/**
 * API do estoque para o módulo de SOLICITAÇÕES (Eduardo). Regra K4 em docs/regras-de-negocio.md.
 *
 *   aprovar  → reservar()        o disponível cai, o físico não
 *   recusar/cancelar → liberarReserva()
 *   enviar   → baixarReserva()   baixa o enviado (pode ser parcial) e libera o resto
 *
 * Todas recebem o `tx` da transação do chamador: a mudança de status da solicitação e o estoque
 * entram ou falham juntos. Falta de saldo → DomainError com o código do produto na mensagem.
 * A permissão (ex.: solicitacoes.aprovar) é checada pelo chamador; aqui não há checagem de usuário.
 *
 * Exemplo (no service de solicitações):
 *   await db.$transaction(async (tx) => {
 *     await tx.solicitacao.update({ where: { id }, data: { status: "APROVADA" } });
 *     await reservar(tx, { solicitacaoId: id, almoxarifadoId, actorId: user.id, itens });
 *     await audit({...}, tx);
 *   }, STOCK_TX);
 */

type Tx = Prisma.TransactionClient;
const REF = "solicitacao";

export { STOCK_TX } from "./engine";

export async function reservar(
  tx: Tx,
  p: { solicitacaoId: string; almoxarifadoId: string; actorId: string | null; itens: ItemInput[] },
) {
  const itens = normalizeItems(p.itens);
  const base = await tx.base.findUnique({ where: { id: p.almoxarifadoId } });
  if (!base || base.type !== "ALMOXARIFADO" || !base.active) throw new DomainError("Almoxarifado inválido.");
  const ativa = await tx.stockReservation.count({ where: { refType: REF, refId: p.solicitacaoId, status: "ATIVA" } });
  if (ativa) throw new DomainError("Esta solicitação já tem reserva ativa.");

  const produtos = await loadProdutos(tx, itens.map((i) => i.produtoId));
  const batchId = newBatchId();
  for (const it of itens) {
    await move(tx, {
      baseId: base.id,
      produtoId: it.produtoId,
      label: produtoLabel(produtos.get(it.produtoId)!),
      op: { type: "RESERVA", quantity: it.quantity },
      batchId,
      actorId: p.actorId,
      refType: REF,
      refId: p.solicitacaoId,
    });
    // upsert: uma solicitação aprovada de novo depois de recusada reaproveita a linha.
    await tx.stockReservation.upsert({
      where: {
        refType_refId_baseId_produtoId: { refType: REF, refId: p.solicitacaoId, baseId: base.id, produtoId: it.produtoId },
      },
      update: { quantity: it.quantity, shipped: 0, status: "ATIVA" },
      create: { refType: REF, refId: p.solicitacaoId, baseId: base.id, produtoId: it.produtoId, quantity: it.quantity },
    });
  }
}

async function activeReservations(tx: Tx, solicitacaoId: string) {
  // Ordenado por produto: mesma ordem de travamento das outras operações.
  return tx.stockReservation.findMany({
    where: { refType: REF, refId: solicitacaoId, status: "ATIVA" },
    include: { produto: true },
    orderBy: { produtoId: "asc" },
  });
}

/** Recusa ou cancelamento: devolve tudo o que estava reservado. Sem reserva ativa = não faz nada. */
export async function liberarReserva(tx: Tx, p: { solicitacaoId: string; actorId: string | null }) {
  const reservas = await activeReservations(tx, p.solicitacaoId);
  const batchId = newBatchId();
  for (const r of reservas) {
    await move(tx, {
      baseId: r.baseId,
      produtoId: r.produtoId,
      label: produtoLabel(r.produto),
      op: { type: "LIBERACAO", quantity: r.quantity },
      batchId,
      actorId: p.actorId,
      refType: REF,
      refId: p.solicitacaoId,
    });
    await tx.stockReservation.update({ where: { id: r.id }, data: { status: "LIBERADA" } });
  }
}

/**
 * Envio: baixa o que saiu e libera o resto.
 * `enviados` ausente = enviou tudo o que estava reservado. Produto reservado que não aparece em
 * `enviados` conta como 0 enviado (tudo liberado).
 */
export async function baixarReserva(
  tx: Tx,
  p: { solicitacaoId: string; actorId: string | null; enviados?: ItemInput[] },
) {
  const reservas = await activeReservations(tx, p.solicitacaoId);
  if (!reservas.length) throw new DomainError("Esta solicitação não tem reserva ativa para enviar.");
  const enviados = p.enviados ? new Map(normalizeItems(p.enviados, { allowZero: true }).map((i) => [i.produtoId, i.quantity])) : null;
  if (enviados) {
    const reservados = new Set(reservas.map((r) => r.produtoId));
    for (const id of enviados.keys()) if (!reservados.has(id)) throw new DomainError("Produto enviado sem reserva nesta solicitação.");
  }

  const batchId = newBatchId();
  for (const r of reservas) {
    const label = produtoLabel(r.produto);
    let plan;
    try {
      plan = planShipment(r.quantity, enviados ? (enviados.get(r.produtoId) ?? 0) : undefined);
    } catch (e) {
      if (e instanceof DomainError) throw new DomainError(`${label}: ${e.message}`);
      throw e;
    }
    const common = { baseId: r.baseId, produtoId: r.produtoId, label, batchId, actorId: p.actorId, refType: REF, refId: p.solicitacaoId };
    if (plan.baixa) await move(tx, { ...common, op: { type: "BAIXA", quantity: plan.baixa } });
    if (plan.liberacao) await move(tx, { ...common, op: { type: "LIBERACAO", quantity: plan.liberacao } });
    await tx.stockReservation.update({ where: { id: r.id }, data: { status: "BAIXADA", shipped: plan.baixa } });
  }
}
