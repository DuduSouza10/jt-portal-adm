import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/lib/permissions/check";
import { almoxarifadosWhere } from "@/modules/estoque/queries";

export const PRODUTOS_PAGE_SIZE = 50;

export type ProdutoFiltro = { q: string; status: "" | "ativos" | "inativos"; almox?: string; page: number };

export const produtosWhere = ({ q, status, almox }: Pick<ProdutoFiltro, "q" | "status" | "almox">): Prisma.ProdutoWhereInput => ({
  ...(q && { OR: [{ code: { contains: q.toUpperCase() } }, { name: { contains: q, mode: "insensitive" } }] }),
  ...(status && { active: status === "ativos" }),
  ...(almox && { stockBalances: { some: { base: { type: "ALMOXARIFADO", code: almox } } } }),
});

/** Em quais almoxarifados cada produto está (tem saldo cadastrado), no alcance do usuário. `comSaldo`: tem quantidade agora. */
export async function almoxarifadosDosProdutos(actor: Actor, produtoIds: string[]) {
  const out = new Map<string, { code: string; comSaldo: boolean }[]>();
  if (produtoIds.length === 0) return out;
  const rows = await db.stockBalance.findMany({
    where: { produtoId: { in: produtoIds }, base: { ...almoxarifadosWhere(actor), active: true } },
    select: { produtoId: true, quantity: true, base: { select: { code: true } } },
    orderBy: { base: { code: "asc" } },
  });
  for (const r of rows) {
    const list = out.get(r.produtoId) ?? [];
    list.push({ code: r.base.code, comSaldo: r.quantity > 0 });
    out.set(r.produtoId, list);
  }
  return out;
}

/**
 * Lista do catálogo. `comCusto` (permissão produtos.precos) acrescenta o custo médio em estoque:
 * média do custo dos saldos com custo conhecido, ponderada pela quantidade física (K5).
 */
export async function listProdutos(filtro: ProdutoFiltro, comCusto: boolean, actor: Actor) {
  const where = produtosWhere(filtro);
  const [produtos, total] = await Promise.all([
    db.produto.findMany({
      where,
      orderBy: [{ active: "desc" }, { name: "asc" }],
      skip: (filtro.page - 1) * PRODUTOS_PAGE_SIZE,
      take: PRODUTOS_PAGE_SIZE,
    }),
    db.produto.count({ where }),
  ]);
  const almoxes = await almoxarifadosDosProdutos(actor, produtos.map((p) => p.id));
  const custos = new Map<string, number>();
  if (comCusto && produtos.length) {
    const saldos = await db.stockBalance.findMany({
      where: { produtoId: { in: produtos.map((p) => p.id) }, avgCost: { gt: 0 }, quantity: { gt: 0 } },
      select: { produtoId: true, quantity: true, avgCost: true },
    });
    const acc = new Map<string, { valor: number; qtd: number }>();
    for (const s of saldos) {
      const a = acc.get(s.produtoId) ?? { valor: 0, qtd: 0 };
      a.valor += s.quantity * Number(s.avgCost);
      a.qtd += s.quantity;
      acc.set(s.produtoId, a);
    }
    for (const [id, a] of acc) custos.set(id, a.valor / a.qtd);
  }
  return { produtos, total, custos, almoxes };
}
