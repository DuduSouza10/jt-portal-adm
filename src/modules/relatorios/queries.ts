import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { baseScopeWhere, type Actor } from "@/lib/permissions/check";
import { almoxarifadosWhere } from "@/modules/estoque/queries";
import type { SlaOrder, SpendLine } from "./sla";

/** Leituras dos relatórios. Sempre dentro do alcance de quem vê (bases da regional, etc.). */

const orderSelect = {
  id: true,
  number: true,
  status: true,
  priority: true,
  createdAt: true,
  approvedAt: true,
  separatedAt: true,
  shippedAt: true,
  receivedAt: true,
  base: { select: { id: true, code: true, name: true } },
  almoxarifado: { select: { id: true, code: true, name: true } },
} as const satisfies Prisma.SolicitacaoSelect;

function scope(actor: Actor): Prisma.SolicitacaoWhereInput {
  const s = baseScopeWhere(actor);
  return s ? { base: s } : {};
}

/** Solicitações criadas no período (base do relatório do mês). */
export function ordersInPeriod(actor: Actor, start: Date, end: Date): Promise<SlaOrder[]> {
  return db.solicitacao.findMany({ where: { ...scope(actor), createdAt: { gte: start, lt: end } }, select: orderSelect, orderBy: { createdAt: "asc" } });
}

/** Solicitações em andamento agora (qualquer data), para "atrasadas agora". */
export function openOrders(actor: Actor): Promise<SlaOrder[]> {
  return db.solicitacao.findMany({
    where: { ...scope(actor), status: { in: ["PENDENTE", "APROVADA", "EM_SEPARACAO", "SEPARADA"] } },
    select: orderSelect,
    take: 2000,
  });
}

/** Itens enviados no período, com o custo gravado no envio (gasto por base). */
export async function spendLines(actor: Actor, start: Date, end: Date): Promise<SpendLine[]> {
  const items = await db.solicitacaoItem.findMany({
    where: { separated: { gt: 0 }, solicitacao: { ...scope(actor), shippedAt: { gte: start, lt: end } } },
    select: {
      separated: true,
      unitCost: true,
      produto: { select: { id: true, code: true, name: true } },
      solicitacao: { select: { shippedAt: true, base: { select: { id: true, code: true, name: true, regional: { select: { id: true, code: true, name: true } } } } } },
    },
  });
  return items.map((i) => {
    const { regional, ...base } = i.solicitacao.base;
    return { base, regional, produto: i.produto, quantity: i.separated!, unitCost: i.unitCost == null ? null : Number(i.unitCost), shippedAt: i.solicitacao.shippedAt! };
  });
}

/** Valor do estoque agora, por almoxarifado do alcance: Σ físico × custo médio. */
export async function stockValue(actor: Actor) {
  const rows = await db.stockBalance.findMany({
    where: { quantity: { gt: 0 }, base: almoxarifadosWhere(actor) },
    select: { quantity: true, avgCost: true, base: { select: { id: true, code: true, name: true } } },
  });
  const by = new Map<string, { id: string; code: string; name: string; value: number; semCusto: number }>();
  for (const r of rows) {
    const g = by.get(r.base.id) ?? { ...r.base, value: 0, semCusto: 0 };
    const c = Number(r.avgCost);
    if (c > 0) g.value += r.quantity * c;
    else g.semCusto += 1;
    by.set(r.base.id, g);
  }
  const list = [...by.values()].sort((a, b) => b.value - a.value || a.code.localeCompare(b.code));
  return { total: list.reduce((s, g) => s + g.value, 0), semCusto: list.reduce((s, g) => s + g.semCusto, 0), byAlmox: list };
}

/** Solicitações criadas num período (para comparar com o mês anterior). */
export function countCreated(actor: Actor, start: Date, end: Date) {
  return db.solicitacao.count({ where: { ...scope(actor), createdAt: { gte: start, lt: end } } });
}

/** Enviadas no período: quantas e o prazo médio do pedido até o envio (dias corridos). */
export async function shippedStats(actor: Actor, start: Date, end: Date) {
  const rows = await db.solicitacao.findMany({ where: { ...scope(actor), shippedAt: { gte: start, lt: end } }, select: { createdAt: true, shippedAt: true } });
  const days = rows.map((r) => (r.shippedAt!.getTime() - r.createdAt.getTime()) / 86_400_000);
  return { count: rows.length, avgDays: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null };
}
