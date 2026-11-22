import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/auth/session";
import { erroPreco, resumoPreco, round4 } from "./preco";

/**
 * Precificação (P6): altera o preço de um produto. O preço novo vira o custo médio do produto em TODOS os
 * almoxarifados (cria o saldo zerado onde ainda não existe, para o preço já valer quando chegar estoque).
 * Vale na hora para o valor do estoque e para os próximos envios; envios antigos não mudam.
 * Cada alteração fica no histórico (antes → depois, quem, quando, motivo) e na auditoria.
 */
export async function alterarPreco(actor: CurrentUser, produtoId: string, valor: number | null, motivo?: string | null) {
  const erro = erroPreco(valor);
  if (erro) throw new DomainError(erro);
  const novo = round4(valor!);
  return db.$transaction(async (tx) => {
    const produto = await tx.produto.findUnique({ where: { id: produtoId }, select: { id: true, code: true } });
    if (!produto) throw new DomainError("Produto não encontrado.");
    const saldos = await tx.stockBalance.findMany({ where: { produtoId }, select: { avgCost: true } });
    const anterior = resumoPreco(saldos.map((s) => Number(s.avgCost)));
    if (anterior.valor === novo && !anterior.varia) return { mudou: false as const };

    const almox = await tx.base.findMany({ where: { type: "ALMOXARIFADO", active: true }, select: { id: true } });
    if (!almox.length && !saldos.length) throw new DomainError("Cadastre um almoxarifado antes de definir preços.");
    await tx.stockBalance.updateMany({ where: { produtoId }, data: { avgCost: novo } });
    for (const a of almox) {
      await tx.stockBalance.upsert({
        where: { baseId_produtoId: { baseId: a.id, produtoId } },
        update: {},
        create: { baseId: a.id, produtoId, avgCost: novo },
      });
    }
    const texto = (motivo ?? "").trim().slice(0, 200) || null;
    await tx.precoHistorico.create({ data: { produtoId, valorAnterior: anterior.valor, valorNovo: novo, motivo: texto, actorId: actor.id } });
    const brl = (v: number | null) => (v == null ? "sem preço" : `R$ ${v.toFixed(2).replace(".", ",")}`);
    await audit(
      {
        actorId: actor.id,
        action: "produto.preco",
        entity: "Produto",
        entityId: produtoId,
        summary: `Preço de ${produto.code}: ${brl(anterior.valor)} → ${brl(novo)}${texto ? ` (${texto})` : ""}`,
        data: { anterior: anterior.valor, novo },
      },
      tx,
    );
    return { mudou: true as const, anterior: anterior.valor, novo };
  });
}

/** Lista da tela de precificação: produtos ativos com o preço atual e a última alteração manual. */
export async function listaPrecificacao(busca?: string, soSemPreco = false) {
  const q = busca?.trim();
  const produtos = await db.produto.findMany({
    where: {
      active: true,
      ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      stockBalances: { select: { avgCost: true } },
      precos: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, actor: { select: { name: true } } } },
    },
  });
  const linhas = produtos.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    unit: p.unit,
    preco: resumoPreco(p.stockBalances.map((s) => Number(s.avgCost))),
    ultima: p.precos[0] ? { quando: p.precos[0].createdAt, quem: p.precos[0].actor.name } : null,
  }));
  return soSemPreco ? linhas.filter((l) => l.preco.valor == null) : linhas;
}

/** Últimas alterações de preço (para o quadro de histórico). */
export function ultimasAlteracoes(take = 30, produtoId?: string) {
  return db.precoHistorico.findMany({
    where: produtoId ? { produtoId } : {},
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      valorAnterior: true,
      valorNovo: true,
      motivo: true,
      createdAt: true,
      actor: { select: { name: true } },
      produto: { select: { code: true, name: true } },
    },
  });
}
