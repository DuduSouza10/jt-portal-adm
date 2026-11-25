/**
 * Avisos do Feishu por regional contra um PostgreSQL real: cada regional recebe só os pedidos dela, no grupo de insumos
 * (aprovação e separação) e no de expedição (pronto para envio), sem misturar MG com SPN.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/session";
import { lancarEntrada } from "@/modules/estoque/service";
import { aprovar, criar, separar } from "./service";

const tag = `N${Date.now().toString(36).toUpperCase()}`;
const hook = (n: string) => `https://open.feishu.cn/open-apis/bot/v2/hook/${tag.toLowerCase()}-${n}-0000000000`;
const R = { MG: { ins: hook("mg-ins"), exp: hook("mg-exp") }, SPN: { ins: hook("spn-ins"), exp: hook("spn-exp") } } as const;
let userId = "";
const ids: Record<string, { regional: string; almox: string; base: string }> = {};
let produto = "";

const actor = (over: Partial<CurrentUser>): CurrentUser => ({
  id: userId, name: "T", login: "t", email: null, mustChangePassword: false, profile: { id: "", key: "t", name: "T" },
  permissions: ["*"], scope: "GLOBAL", bases: [], baseIds: [], regionalIds: [], ...over,
});
const targets = async (like: string) =>
  (await db.feishuOutbox.findMany({ where: { event: { contains: like }, target: { contains: tag.toLowerCase() } }, select: { target: true } })).map((r) => r.target);

beforeAll(async () => {
  for (const k of ["MG", "SPN"] as const) {
    const r = await db.regional.create({ data: { code: `${tag}${k}`, name: k, feishuStaffChatId: R[k].ins, feishuShippingChatId: R[k].exp } });
    const almox = await db.base.create({ data: { code: `${tag}-A-${k}`, name: `Almox ${k}`, type: "ALMOXARIFADO", regionalId: r.id } });
    const base = await db.base.create({ data: { code: `${tag}-B-${k}`, name: `Base ${k}`, regionalId: r.id } });
    ids[k] = { regional: r.id, almox: almox.id, base: base.id };
  }
  produto = (await db.produto.create({ data: { code: `${tag}-P`, name: "Produto" } })).id;
  const profile = await db.accessProfile.create({ data: { key: tag.toLowerCase(), name: "T", scope: "GLOBAL", permissions: ["*"] } });
  userId = (await db.user.create({ data: { name: "T", login: tag.toLowerCase(), profileId: profile.id } })).id;
  for (const k of ["MG", "SPN"]) await lancarEntrada(actor({}), { baseId: ids[k].almox, document: "NF", reason: null, itens: [{ produtoId: produto, quantity: 100 }] });
});

afterAll(async () => {
  const bases = Object.values(ids).flatMap((i) => [i.almox, i.base]);
  const sol = await db.solicitacao.findMany({ where: { baseId: { in: bases } }, select: { id: true } });
  await db.notification.deleteMany({ where: { refId: { in: sol.map((s) => s.id) } } });
  await db.feishuOutbox.deleteMany({ where: { target: { contains: tag.toLowerCase() } } });
  await db.solicitacao.deleteMany({ where: { baseId: { in: bases } } });
  await db.stockMovement.deleteMany({ where: { baseId: { in: bases } } });
  await db.stockReservation.deleteMany({ where: { baseId: { in: bases } } });
  await db.stockBalance.deleteMany({ where: { baseId: { in: bases } } });
  await db.auditLog.deleteMany({ where: { actorId: userId } });
  await db.user.deleteMany({ where: { login: tag.toLowerCase() } });
  await db.accessProfile.deleteMany({ where: { key: tag.toLowerCase() } });
  await db.base.deleteMany({ where: { id: { in: bases } } });
  await db.regional.deleteMany({ where: { code: { startsWith: tag } } });
  await db.$disconnect();
});

describe("avisos do Feishu por regional", () => {
  it("cada regional recebe só os pedidos dela, nos grupos de insumos e de expedição", async () => {
    for (const k of ["MG", "SPN"] as const) {
      const s = await criar(actor({}), { baseId: ids[k].base, priority: "NORMAL", notes: null, itens: [{ produtoId: produto, quantity: 1 }] });
      await aprovar(actor({}), { id: s.id, almoxarifadoId: ids[k].almox, quantidades: {}, note: null });
      await separar(actor({}), { id: s.id, quantidades: {} });
    }
    const todos = await db.feishuOutbox.findMany({ where: { target: { contains: tag.toLowerCase() } }, select: { event: true, target: true, payload: true } });
    const doGrupo = (t: string) => todos.filter((x) => x.target === t);
    // Aprovação e separação (insumos): só o pedido da própria regional em cada grupo.
    for (const [k, outra] of [["MG", "SPN"], ["SPN", "MG"]] as const) {
      const ins = doGrupo(R[k].ins).map((x) => JSON.stringify(x.payload));
      expect(ins.length).toBeGreaterThan(0);
      expect(ins.every((p) => p.includes(`${tag}-B-${k}`) && !p.includes(`${tag}-B-${outra}`))).toBe(true);
      const exp = doGrupo(R[k].exp).map((x) => JSON.stringify(x.payload));
      expect(exp).toHaveLength(1); // "Pronto para envio"
      expect(exp[0]).toContain(`${tag}-B-${k}`);
    }
    expect(await targets("separada.expedicao")).toHaveLength(2);
  });
});
