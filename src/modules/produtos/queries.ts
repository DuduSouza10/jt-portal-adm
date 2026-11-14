import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export const PRODUTOS_PAGE_SIZE = 50;

export type ProdutoFiltro = { q: string; status: "" | "ativos" | "inativos"; page: number };

export const produtosWhere = ({ q, status }: Pick<ProdutoFiltro, "q" | "status">): Prisma.ProdutoWhereInput => ({
  ...(q && { OR: [{ code: { contains: q.toUpperCase() } }, { name: { contains: q, mode: "insensitive" } }] }),
  ...(status && { active: status === "ativos" }),
});

/**
 * Lista do catálogo. `comCusto` (permissão produtos.precos) acrescenta o custo médio em estoque:
 * média do custo dos saldos com custo conhecido, ponderada pela quantidade física (K5).
 */
export async function listProdutos(filtro: ProdutoFiltro, comCusto: boolean) {
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
  return { produtos, total, custos };
}
