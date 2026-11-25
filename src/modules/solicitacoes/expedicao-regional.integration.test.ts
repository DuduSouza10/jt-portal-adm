/**
 * Expedição é da regional (E22), contra um PostgreSQL real: quem só tem a base própria vinculada vê, recebe aviso e
 * envia os pedidos dos almoxarifados da regional dela, e de nenhuma outra.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/session";
import { lancarEntrada } from "@/modules/estoque/service";
import { aprovar, criar, lookupParaEnvio, separar } from "./service";
import { contadores, filaExpedicao } from "./queries";

const tag = `X${Date.now().toString(36).toUpperCase()}`;
const ids: Record<string, { regional: string; almox: string; base: string; pedido?: string }> = {};
let adminId = "";
let expedicaoId = "";
let expedicaoUser: CurrentUser;
let produto = "";

const actor = (over: Partial<CurrentUser>): CurrentUser => ({
  id: adminId, name: "T", login: "t", email: null, mustChangePassword: false, profile: { id: "", key: "t", name: "T" },
  permissions: ["*"], scope: "GLOBAL", bases: [], baseIds: [], regionalIds: [], ...over,
});

beforeAll(async () => {
  for (const k of ["MG", "SP"] as const) {
    const r = await db.regional.create({ data: { code: `${tag}${k}`, name: k } });
    const almox = await db.base.create({ data: { code: `${tag}-A-${k}`, name: `Almox ${k}`, type: "ALMOXARIFADO", regionalId: r.id } });
    const base = await db.base.create({ data: { code: `${tag}-B-${k}`, name: `Base ${k}`, regionalId: r.id } });
    ids[k] = { regional: r.id, almox: almox.id, base: base.id };
  }
  produto = (await db.produto.create({ data: { code: `${tag}-P`, name: "Produto" } })).id;
  const adm = await db.accessProfile.create({ data: { key: `${tag}a`.toLowerCase(), name: "A", scope: "GLOBAL", permissions: ["*"] } });
  adminId = (await db.user.create({ data: { name: "A", login: `${tag}a`.toLowerCase(), profileId: adm.id } })).id;
  // Perfil de expedição com alcance "só as bases vinculadas": o usuário tem só a base de MG, nenhuma regional marcada.
  const perfil = await db.accessProfile.create({ data: { key: `${tag}e`.toLowerCase(), name: "E", scope: "BASE", permissions: ["expedicao.enviar"] } });
  expedicaoId = (await db.user.create({ data: { name: "E", login: `${tag}e`.toLowerCase(), profileId: perfil.id, bases: { create: [{ baseId: ids.MG!.base }] } } })).id;
  expedicaoUser = actor({
    id: expedicaoId, permissions: ["expedicao.enviar"], scope: "BASE", baseIds: [ids.MG!.base], regionalIds: [], baseRegionalIds: [ids.MG!.regional],
  });
  for (const k of ["MG", "SP"]) await lancarEntrada(actor({}), { baseId: ids[k]!.almox, document: "NF", reason: null, itens: [{ produtoId: produto, quantity: 100 }] });
  for (const k of ["MG", "SP"]) {
    const s = await criar(actor({}), { baseId: ids[k]!.base, priority: "NORMAL", notes: null, itens: [{ produtoId: produto, quantity: 1 }] });
    await aprovar(actor({}), { id: s.id, almoxarifadoId: ids[k]!.almox, quantidades: {}, note: null });
    await separar(actor({}), { id: s.id, quantidades: {} });
    ids[k]!.pedido = s.id;
  }
});

afterAll(async () => {
  const bases = Object.values(ids).flatMap((i) => [i.almox, i.base]);
  const sol = await db.solicitacao.findMany({ where: { baseId: { in: bases } }, select: { id: true } });
  await db.notification.deleteMany({ where: { refId: { in: sol.map((s) => s.id) } } });
  await db.feishuOutbox.deleteMany({ where: { refId: { in: sol.map((s) => s.id) } } });
  await db.solicitacao.deleteMany({ where: { baseId: { in: bases } } });
  await db.stockMovement.deleteMany({ where: { baseId: { in: bases } } });
  await db.stockReservation.deleteMany({ where: { baseId: { in: bases } } });
  await db.stockBalance.deleteMany({ where: { baseId: { in: bases } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: [adminId, expedicaoId] } } });
  await db.user.deleteMany({ where: { login: { in: [`${tag}a`.toLowerCase(), `${tag}e`.toLowerCase()] } } });
  await db.accessProfile.deleteMany({ where: { key: { in: [`${tag}a`.toLowerCase(), `${tag}e`.toLowerCase()] } } });
  await db.base.deleteMany({ where: { id: { in: bases } } });
  await db.regional.deleteMany({ where: { code: { startsWith: tag } } });
  await db.$disconnect();
});

describe("expedição da regional da base vinculada", () => {
  it("a fila e o contador mostram só os pedidos da regional da base dela", async () => {
    const { ready } = await filaExpedicao(expedicaoUser);
    expect(ready.map((o) => o.id)).toEqual([ids.MG!.pedido]);
    expect((await contadores(expedicaoUser)).enviar).toBe(1);
  });

  it("recebe o aviso do pedido pronto da regional (e não o de outra)", async () => {
    const avisos = await db.notification.findMany({ where: { userId: expedicaoId }, select: { refId: true } });
    expect(avisos.map((a) => a.refId)).toContain(ids.MG!.pedido);
    expect(avisos.map((a) => a.refId)).not.toContain(ids.SP!.pedido);
  });

  it("bipa a guia do pedido da regional, mas não a de outra regional", async () => {
    expect(await lookupParaEnvio(expedicaoUser, { id: ids.MG!.pedido! })).toBe(ids.MG!.pedido);
    await expect(lookupParaEnvio(expedicaoUser, { id: ids.SP!.pedido! })).rejects.toThrow();
  });
});
