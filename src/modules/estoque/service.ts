import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/auth/session";
import { canAccessBase } from "@/lib/permissions/check";
import { loadProdutos, move, newBatchId, produtoLabel, STOCK_TX } from "./engine";
import { normalizeItems } from "./rules";
import type { EntradaInput, InventarioInput, MinimoInput, SaidaInput, TransferenciaInput } from "./schemas";

type Tx = Prisma.TransactionClient;

/** Almoxarifado ativo e dentro do alcance do usuário. */
async function loadAlmoxarifado(tx: Tx, actor: CurrentUser, baseId: string) {
  const base = await tx.base.findUnique({ where: { id: baseId } });
  if (!base || !canAccessBase(actor, base)) throw new DomainError("Almoxarifado não encontrado.");
  if (base.type !== "ALMOXARIFADO") throw new DomainError(`${base.code} não é um almoxarifado.`);
  if (!base.active) throw new DomainError(`O almoxarifado ${base.code} está inativo.`);
  return base;
}

export async function lancarEntrada(actor: CurrentUser, input: EntradaInput) {
  const itens = normalizeItems(input.itens);
  return db.$transaction(async (tx) => {
    const base = await loadAlmoxarifado(tx, actor, input.baseId);
    const produtos = await loadProdutos(tx, itens.map((i) => i.produtoId), { requireActive: true });
    const batchId = newBatchId();
    for (const it of itens) {
      await move(tx, {
        baseId: base.id,
        produtoId: it.produtoId,
        label: produtoLabel(produtos.get(it.produtoId)!),
        op: { type: "ENTRADA", quantity: it.quantity },
        batchId,
        actorId: actor.id,
        document: input.document,
        reason: input.reason,
      });
    }
    await audit(
      {
        actorId: actor.id,
        action: "estoque.entrada",
        entity: "StockBatch",
        entityId: batchId,
        summary: `Entrada em ${base.code}: ${itens.length} produto(s), doc. ${input.document}`,
      },
      tx,
    );
    return batchId;
  }, STOCK_TX);
}

export async function lancarSaida(actor: CurrentUser, input: SaidaInput) {
  const itens = normalizeItems(input.itens);
  return db.$transaction(async (tx) => {
    const base = await loadAlmoxarifado(tx, actor, input.baseId);
    const produtos = await loadProdutos(tx, itens.map((i) => i.produtoId));
    const batchId = newBatchId();
    for (const it of itens) {
      await move(tx, {
        baseId: base.id,
        produtoId: it.produtoId,
        label: produtoLabel(produtos.get(it.produtoId)!),
        op: { type: "SAIDA", quantity: it.quantity },
        batchId,
        actorId: actor.id,
        document: input.document,
        reason: input.reason,
      });
    }
    await audit(
      {
        actorId: actor.id,
        action: "estoque.saida",
        entity: "StockBatch",
        entityId: batchId,
        summary: `Saída em ${base.code}: ${itens.length} produto(s). Motivo: ${input.reason}`,
      },
      tx,
    );
    return batchId;
  }, STOCK_TX);
}

export async function transferir(actor: CurrentUser, input: TransferenciaInput) {
  if (input.origemId === input.destinoId) throw new DomainError("Origem e destino precisam ser diferentes.");
  const itens = normalizeItems(input.itens);
  return db.$transaction(async (tx) => {
    const origem = await loadAlmoxarifado(tx, actor, input.origemId);
    const destino = await tx.base.findUnique({ where: { id: input.destinoId } });
    // O destino pode estar fora do alcance de quem envia (ex.: outra regional), mas precisa ser almoxarifado ativo.
    if (!destino || destino.type !== "ALMOXARIFADO" || !destino.active)
      throw new DomainError("Almoxarifado de destino inválido.");
    const produtos = await loadProdutos(tx, itens.map((i) => i.produtoId));
    const batchId = newBatchId();
    const common = { batchId, actorId: actor.id, document: input.document, reason: input.reason };
    // Ordem fixa de travamento: primeiro a base de menor id, para duas transferências opostas não travarem.
    const [first, second] =
      origem.id < destino.id
        ? [{ id: origem.id, type: "TRANSFERENCIA_SAIDA" as const }, { id: destino.id, type: "TRANSFERENCIA_ENTRADA" as const }]
        : [{ id: destino.id, type: "TRANSFERENCIA_ENTRADA" as const }, { id: origem.id, type: "TRANSFERENCIA_SAIDA" as const }];
    for (const side of [first, second]) {
      for (const it of itens) {
        await move(tx, {
          ...common,
          baseId: side.id,
          produtoId: it.produtoId,
          label: produtoLabel(produtos.get(it.produtoId)!),
          op: { type: side.type, quantity: it.quantity },
          refType: "transferencia",
          refId: side.type === "TRANSFERENCIA_SAIDA" ? destino.id : origem.id,
        });
      }
    }
    await audit(
      {
        actorId: actor.id,
        action: "estoque.transferencia",
        entity: "StockBatch",
        entityId: batchId,
        summary: `Transferência ${origem.code} → ${destino.code}: ${itens.length} produto(s)`,
      },
      tx,
    );
    return batchId;
  }, STOCK_TX);
}

export type InventoryWarning = { produto: string; contado: number; reservado: number };

/** Inventário (K3): define o físico para a quantidade contada. Devolve os produtos com disponível negativo. */
export async function ajustarInventario(actor: CurrentUser, input: InventarioInput) {
  const itens = normalizeItems(input.itens, { allowZero: true });
  return db.$transaction(async (tx) => {
    const base = await loadAlmoxarifado(tx, actor, input.baseId);
    const produtos = await loadProdutos(tx, itens.map((i) => i.produtoId));
    const batchId = newBatchId();
    const warnings: InventoryWarning[] = [];
    let changed = 0;
    for (const it of itens) {
      const p = produtos.get(it.produtoId)!;
      const r = await move(tx, {
        baseId: base.id,
        produtoId: it.produtoId,
        label: produtoLabel(p),
        op: { type: "INVENTARIO", counted: it.quantity },
        batchId,
        actorId: actor.id,
        reason: input.reason,
      });
      if (r.delta !== 0) changed++;
      if (r.warning) warnings.push({ produto: produtoLabel(p), contado: r.quantity, reservado: r.reserved });
    }
    await audit(
      {
        actorId: actor.id,
        action: "estoque.inventario",
        entity: "StockBatch",
        entityId: batchId,
        summary: `Inventário em ${base.code}: ${itens.length} contado(s), ${changed} com diferença`,
        data: warnings.length ? { disponivelNegativo: warnings } : undefined,
      },
      tx,
    );
    return { batchId, changed, warnings };
  }, STOCK_TX);
}

export async function definirMinimo(actor: CurrentUser, input: MinimoInput) {
  return db.$transaction(async (tx) => {
    const base = await loadAlmoxarifado(tx, actor, input.baseId);
    const produtos = await loadProdutos(tx, [input.produtoId]);
    const before = await tx.stockBalance.findUnique({
      where: { baseId_produtoId: { baseId: base.id, produtoId: input.produtoId } },
    });
    await tx.stockBalance.upsert({
      where: { baseId_produtoId: { baseId: base.id, produtoId: input.produtoId } },
      update: { minimum: input.minimum },
      create: { baseId: base.id, produtoId: input.produtoId, minimum: input.minimum },
    });
    await audit(
      {
        actorId: actor.id,
        action: "estoque.minimo",
        entity: "StockBalance",
        entityId: `${base.id}:${input.produtoId}`,
        summary: `Mínimo de ${produtos.get(input.produtoId)!.code} em ${base.code}: ${before?.minimum ?? 0} → ${input.minimum}`,
      },
      tx,
    );
  });
}
