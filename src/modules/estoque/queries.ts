import "server-only";
import type { Prisma, StockMovementType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { baseScopeWhere, type Actor } from "@/lib/permissions/check";

/** Consultas de leitura do estoque (telas e relatórios). Sempre paginadas e dentro do alcance do usuário. */

export const PAGE_SIZE = 50;

export function almoxarifadosWhere(actor: Actor): Prisma.BaseWhereInput {
  const scope = baseScopeWhere(actor);
  return { type: "ALMOXARIFADO", ...(scope && { AND: [scope] }) };
}

export function listAlmoxarifados(actor: Actor, { includeInactive = false } = {}) {
  return db.base.findMany({
    where: { ...almoxarifadosWhere(actor), ...(!includeInactive && { active: true }) },
    select: { id: true, code: true, name: true, regionalId: true, active: true },
    orderBy: { code: "asc" },
  });
}

/** Todos os almoxarifados ativos (destino de transferência pode estar fora do alcance). */
export function listAllAlmoxarifados() {
  return db.base.findMany({
    where: { type: "ALMOXARIFADO", active: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
}

export function listProdutosAtivos() {
  return db.produto.findMany({
    where: { active: true },
    select: { id: true, code: true, name: true, unit: true },
    orderBy: { code: "asc" },
  });
}

export type SaldoFilter = { baseIds: string[]; q?: string; abaixoMinimo?: boolean; page: number };

export async function listSaldos(f: SaldoFilter) {
  const where: Prisma.StockBalanceWhereInput = {
    baseId: { in: f.baseIds },
    ...(f.q && {
      produto: {
        OR: [{ code: { contains: f.q.toUpperCase() } }, { name: { contains: f.q, mode: "insensitive" } }],
      },
    }),
  };
  if (f.abaixoMinimo) {
    // Comparação entre colunas: o Prisma não faz "quantity - reserved < minimum" no where.
    // Filtra os candidatos (minimum > 0) e calcula aqui; o número de linhas com mínimo definido é pequeno.
    const rows = await db.stockBalance.findMany({
      where: { ...where, minimum: { gt: 0 } },
      include: { produto: true, base: { select: { code: true } } },
      orderBy: [{ base: { code: "asc" } }, { produto: { code: "asc" } }],
    });
    const below = rows.filter((r) => r.quantity - r.reserved < r.minimum);
    return { rows: below.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE), total: below.length };
  }
  const [rows, total] = await Promise.all([
    db.stockBalance.findMany({
      where,
      include: { produto: true, base: { select: { code: true } } },
      orderBy: [{ base: { code: "asc" } }, { produto: { code: "asc" } }],
      skip: (f.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.stockBalance.count({ where }),
  ]);
  return { rows, total };
}

export type MovFilter = { baseIds: string[]; type?: StockMovementType; q?: string; batchId?: string; page: number };

export async function listMovimentos(f: MovFilter) {
  const where: Prisma.StockMovementWhereInput = {
    baseId: { in: f.baseIds },
    ...(f.type && { type: f.type }),
    ...(f.batchId && { batchId: f.batchId }),
    ...(f.q && {
      OR: [
        { produto: { code: { contains: f.q.toUpperCase() } } },
        { produto: { name: { contains: f.q, mode: "insensitive" } } },
        { document: { contains: f.q, mode: "insensitive" } },
      ],
    }),
  };
  const [rows, total] = await Promise.all([
    db.stockMovement.findMany({
      where,
      include: { produto: { select: { code: true, name: true, unit: true } }, base: { select: { code: true } }, actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (f.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.stockMovement.count({ where }),
  ]);
  return { rows, total };
}
