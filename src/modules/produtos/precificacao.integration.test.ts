/**
 * Precificação (P6) contra um PostgreSQL real: o preço novo vale em todos os almoxarifados (cria o saldo
 * zerado onde ainda não existe), fica no histórico e na auditoria, e os pedidos em andamento passam a
 * valer o preço novo no "valor por base". Envio antigo não muda.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/session";
import { openOrderLines } from "@/modules/relatorios/queries";
import { alterarPreco, listaPrecificacao } from "./precificacao.service";

const tag = `pc${Date.now().toString(36)}`.toUpperCase();
let actor: CurrentUser;
let produtoId: string;
let alm1: string;
let alm2: string;
let baseId: string;
let itemEnviado: string;

beforeAll(async () => {
  const reg = await db.regional.create({ data: { code: `${tag}R`, name: "Reg" } });
  alm1 = (await db.base.create({ data: { code: `${tag}-A1`, name: "Alm 1", type: "ALMOXARIFADO", regionalId: reg.id } })).id;
  alm2 = (await db.base.create({ data: { code: `${tag}-A2`, name: "Alm 2", type: "ALMOXARIFADO", regionalId: reg.id } })).id;
  baseId = (await db.base.create({ data: { code: `${tag}-B`, name: "Base", regionalId: reg.id } })).id;
  produtoId = (await db.produto.create({ data: { code: `${tag}-P`, name: `Luva ${tag}` } })).id;
  await db.stockBalance.create({ data: { baseId: alm1, produtoId, quantity: 10, avgCost: 2 } });
  const profile = await db.accessProfile.create({ data: { key: tag.toLowerCase(), name: "Admin", scope: "GLOBAL", permissions: ["*"] } });
  const u = await db.user.create({ data: { name: "Admin", login: tag.toLowerCase(), profileId: profile.id } });
  actor = { id: u.id, name: "Admin", login: u.login, email: null, mustChangePassword: false, profile: { id: profile.id, key: profile.key, name: "Admin" }, permissions: ["*"], scope: "GLOBAL", bases: [], baseIds: [], regionalIds: [] } as CurrentUser;
  // Um pedido já enviado (preço da época = 2) e um aprovado, ainda sem custo gravado.
  const enviado = await db.solicitacao.create({ data: { baseId, almoxarifadoId: alm1, createdById: u.id, status: "ENVIADA", shippedAt: new Date() } });
  itemEnviado = (await db.solicitacaoItem.create({ data: { solicitacaoId: enviado.id, produtoId, requested: 3, approved: 3, separated: 3, unitCost: 2 } })).id;
  const aprovado = await db.solicitacao.create({ data: { baseId, almoxarifadoId: alm1, createdById: u.id, status: "APROVADA" } });
  await db.solicitacaoItem.create({ data: { solicitacaoId: aprovado.id, produtoId, requested: 5, approved: 4 } });
});

afterAll(async () => {
  await db.solicitacao.deleteMany({ where: { createdById: actor.id } });
  await db.auditLog.deleteMany({ where: { actorId: actor.id } });
  await db.precoHistorico.deleteMany({ where: { produtoId } });
  await db.stockBalance.deleteMany({ where: { produtoId } });
  await db.produto.deleteMany({ where: { id: produtoId } });
  await db.user.deleteMany({ where: { id: actor.id } });
  await db.accessProfile.deleteMany({ where: { key: tag.toLowerCase() } });
  await db.base.deleteMany({ where: { code: { startsWith: tag } } });
  await db.regional.deleteMany({ where: { code: { startsWith: tag } } });
  await db.$disconnect();
});

describe("precificação", () => {
  it("o preço novo vale em todos os almoxarifados e fica no histórico e na auditoria", async () => {
    const r = await alterarPreco(actor, produtoId, 2.75, "reajuste do fornecedor");
    expect(r).toMatchObject({ mudou: true, anterior: 2, novo: 2.75 });
    const saldos = await db.stockBalance.findMany({ where: { produtoId }, orderBy: { baseId: "asc" } });
    expect(saldos.map((s) => [s.baseId === alm1 ? "A1" : s.baseId === alm2 ? "A2" : "?", s.quantity, Number(s.avgCost)]).sort()).toEqual([
      ["A1", 10, 2.75],
      ["A2", 0, 2.75],
    ]);
    const h = await db.precoHistorico.findMany({ where: { produtoId } });
    expect(h.map((x) => [Number(x.valorAnterior), Number(x.valorNovo), x.motivo])).toEqual([[2, 2.75, "reajuste do fornecedor"]]);
    const log = await db.auditLog.findFirst({ where: { actorId: actor.id, action: "produto.preco" } });
    expect(log?.summary).toContain("R$ 2,00 → R$ 2,75");
  });

  it("mesmo preço de novo não grava nada; preço inválido é recusado", async () => {
    expect(await alterarPreco(actor, produtoId, 2.75)).toEqual({ mudou: false });
    expect(await db.precoHistorico.count({ where: { produtoId } })).toBe(1);
    await expect(alterarPreco(actor, produtoId, 0)).rejects.toThrow("maior que zero");
    await expect(alterarPreco(actor, produtoId, null)).rejects.toThrow("Informe o preço");
  });

  it("envio antigo fica com o preço da época; pedido em andamento vale o preço novo", async () => {
    expect(Number((await db.solicitacaoItem.findUniqueOrThrow({ where: { id: itemEnviado } })).unitCost)).toBe(2);
    const abertos = (await openOrderLines(actor)).filter((l) => l.base.id === baseId);
    expect(abertos).toEqual([expect.objectContaining({ quantity: 4, unitCost: 2.75 })]);
  });

  it("a lista da precificação mostra o preço atual e quem alterou", async () => {
    const l = (await listaPrecificacao(tag)).find((x) => x.id === produtoId)!;
    expect(l.preco).toMatchObject({ valor: 2.75, varia: false });
    expect(l.ultima?.quem).toBe("Admin");
  });
});
