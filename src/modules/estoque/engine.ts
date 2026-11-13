import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { dbSchema } from "@/lib/db-schema";
import { DomainError } from "@/lib/errors";
import { applyCost, applyMovement, type MovementResult, type Operation } from "./rules";

/**
 * Motor do estoque: a ÚNICA função que altera StockBalance (fora do seed).
 * Uso interno do módulo — telas usam service.ts e o módulo de solicitações usa api.ts.
 *
 * Concorrência: trava a linha do saldo com SELECT … FOR UPDATE dentro da transação do chamador.
 * Duas transações no mesmo (almoxarifado, produto) esperam uma pela outra; produtos diferentes
 * seguem em paralelo. Chame sempre com os itens ordenados por produtoId (normalizeItems faz isso)
 * para todas as transações travarem na mesma ordem e não haver deadlock.
 */

type Tx = Prisma.TransactionClient;

export type MoveInput = {
  baseId: string;
  produtoId: string;
  /** Rótulo do produto para mensagens de erro (ex.: "LUVA-M Luva de látex M"). */
  label: string;
  op: Operation;
  batchId: string;
  actorId: string | null;
  document?: string | null;
  reason?: string | null;
  refType?: string | null;
  refId?: string | null;
  /** Valor unitário (R$): da NF na entrada; custo da origem na transferência recebida. Ver applyCost (K5). */
  unitCost?: number | null;
};

// Nome da tabela qualificado pelo schema (DATABASE_SCHEMA). O schema é validado em dbSchema().
const balanceTable = () => Prisma.raw(`"${dbSchema()}"."StockBalance"`);

export async function move(tx: Tx, m: MoveInput): Promise<MovementResult> {
  const table = balanceTable();
  // Garante que a linha existe (produto que nunca teve saldo neste almoxarifado).
  await tx.$executeRaw`
    INSERT INTO ${table} ("baseId", "produtoId", "updatedAt")
    VALUES (${m.baseId}, ${m.produtoId}, now())
    ON CONFLICT ("baseId", "produtoId") DO NOTHING`;
  const rows = await tx.$queryRaw<{ quantity: number; reserved: number; avgCost: unknown }[]>`
    SELECT "quantity", "reserved", "avgCost" FROM ${table}
    WHERE "baseId" = ${m.baseId} AND "produtoId" = ${m.produtoId}
    FOR UPDATE`;
  const current = { quantity: rows[0].quantity, reserved: rows[0].reserved };
  const avgBefore = Number(rows[0].avgCost ?? 0);

  let result: MovementResult;
  try {
    result = applyMovement(current, m.op);
  } catch (e) {
    if (e instanceof DomainError) throw new DomainError(`${m.label}: ${e.message}`);
    throw e;
  }

  const cost = applyCost({ quantity: current.quantity, avgCost: avgBefore }, m.op, result.delta, m.unitCost);
  await tx.stockBalance.update({
    where: { baseId_produtoId: { baseId: m.baseId, produtoId: m.produtoId } },
    data: { quantity: result.quantity, reserved: result.reserved, avgCost: cost.avgCost },
  });
  await tx.stockMovement.create({
    data: {
      type: m.op.type,
      baseId: m.baseId,
      produtoId: m.produtoId,
      quantity: result.delta,
      reservedDelta: result.reservedDelta,
      balanceAfter: result.quantity,
      unitCost: cost.unitCost,
      reservedAfter: result.reserved,
      document: m.document ?? null,
      reason: m.reason ?? null,
      batchId: m.batchId,
      refType: m.refType ?? null,
      refId: m.refId ?? null,
      actorId: m.actorId,
    },
  });
  return result;
}

/** Opções de transação para operações de estoque (inventário grande pode passar de 5s). */
export const STOCK_TX = { timeout: 30_000, maxWait: 10_000 } as const;

export const newBatchId = () => crypto.randomUUID();

/** Carrega e valida os produtos de uma lista. */
export async function loadProdutos(tx: Tx, ids: string[], { requireActive = false } = {}) {
  const produtos = await tx.produto.findMany({ where: { id: { in: ids } } });
  const map = new Map(produtos.map((p) => [p.id, p]));
  for (const id of ids) {
    const p = map.get(id);
    if (!p) throw new DomainError("Produto não encontrado.");
    if (requireActive && !p.active) throw new DomainError(`${p.code}: produto inativo.`);
  }
  return map;
}

export const produtoLabel = (p: { code: string; name: string }) => `${p.code} ${p.name}`;
