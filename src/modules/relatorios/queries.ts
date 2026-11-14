import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { baseScopeWhere, type Actor } from "@/lib/permissions/check";
import { almoxarifadosWhere } from "@/modules/estoque/queries";
import type { SlaOrder, SpendLine } from "./sla";

/** Leituras dos relatórios. Sempre dentro do alcance de quem vê (bases da regional, etc.) e dos filtros da tela. */

/** Filtros da tela de relatórios (todos opcionais). */
export type Filtro = { regionalId?: string; baseId?: string; almoxId?: string };

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
  partial: true,
  base: { select: { id: true, code: true, name: true, regional: { select: { id: true, code: true, name: true } } } },
  almoxarifado: { select: { id: true, code: true, name: true } },
} as const satisfies Prisma.SolicitacaoSelect;

type Ref = { id: string; code: string; name: string };
export type ReportOrder = SlaOrder & { partial: boolean; base: Ref & { regional: Ref } };

/** Alcance do usuário + filtros escolhidos. */
function where(actor: Actor, f: Filtro = {}): Prisma.SolicitacaoWhereInput {
  const s = baseScopeWhere(actor);
  const base: Prisma.BaseWhereInput[] = [...(s ? [s] : []), ...(f.regionalId ? [{ regionalId: f.regionalId }] : []), ...(f.baseId ? [{ id: f.baseId }] : [])];
  return { ...(base.length && { base: { AND: base } }), ...(f.almoxId && { almoxarifadoId: f.almoxId }) };
}

type DateField = "createdAt" | "separatedAt" | "shippedAt";

/** Solicitações com a data escolhida dentro do período (criadas, separadas ou enviadas no mês). */
export function ordersInPeriod(actor: Actor, start: Date, end: Date, f: Filtro = {}, field: DateField = "createdAt"): Promise<ReportOrder[]> {
  return db.solicitacao.findMany({ where: { ...where(actor, f), [field]: { gte: start, lt: end } }, select: orderSelect, orderBy: { [field]: "asc" } });
}

/** Solicitações em andamento agora (qualquer data), para "atrasadas agora" e as filas. */
export function openOrders(actor: Actor, f: Filtro = {}): Promise<ReportOrder[]> {
  return db.solicitacao.findMany({
    where: { ...where(actor, f), status: { in: ["PENDENTE", "APROVADA", "EM_SEPARACAO", "SEPARADA"] } },
    select: orderSelect,
    take: 2000,
  });
}

/** Itens enviados no período, com o custo gravado no envio (gasto por base). */
export async function spendLines(actor: Actor, start: Date, end: Date, f: Filtro = {}): Promise<SpendLine[]> {
  const items = await db.solicitacaoItem.findMany({
    where: { separated: { gt: 0 }, solicitacao: { ...where(actor, f), shippedAt: { gte: start, lt: end } } },
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

/** Valor do estoque agora, por almoxarifado do alcance (e da regional/almoxarifado filtrados): Σ físico × custo médio. */
export async function stockValue(actor: Actor, f: Filtro = {}) {
  const rows = await db.stockBalance.findMany({
    where: {
      quantity: { gt: 0 },
      base: { AND: [almoxarifadosWhere(actor), ...(f.regionalId ? [{ regionalId: f.regionalId }] : []), ...(f.almoxId ? [{ id: f.almoxId }] : [])] },
    },
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

/** Quantas solicitações tiveram a data no período (para comparar com o mês anterior). */
export function countInPeriod(actor: Actor, start: Date, end: Date, f: Filtro = {}, field: DateField = "createdAt") {
  return db.solicitacao.count({ where: { ...where(actor, f), [field]: { gte: start, lt: end } } });
}

/** Enviadas no período: quantas e o prazo médio do pedido até o envio (dias corridos). */
export async function shippedStats(actor: Actor, start: Date, end: Date, f: Filtro = {}) {
  const rows = await db.solicitacao.findMany({ where: { ...where(actor, f), shippedAt: { gte: start, lt: end } }, select: { createdAt: true, shippedAt: true } });
  const days = rows.map((r) => (r.shippedAt!.getTime() - r.createdAt.getTime()) / 86_400_000);
  return { count: rows.length, avgDays: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null };
}

/** Opções dos filtros: só o que está no alcance de quem vê. */
export async function filtroOptions(actor: Actor) {
  const s = baseScopeWhere(actor);
  const [bases, almox] = await Promise.all([
    db.base.findMany({
      where: { type: { not: "ALMOXARIFADO" }, ...(s && { AND: [s] }) },
      select: { id: true, code: true, name: true, regional: { select: { id: true, code: true, name: true } } },
      orderBy: { code: "asc" },
    }),
    db.base.findMany({ where: almoxarifadosWhere(actor), select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
  ]);
  const regionais = [...new Map(bases.map((b) => [b.regional.id, b.regional])).values()].sort((a, b) => a.code.localeCompare(b.code));
  return { regionais, bases: bases.map(({ regional, ...b }) => ({ ...b, regionalId: regional.id })), almoxarifados: almox };
}
