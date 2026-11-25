/**
 * Cartão único por pedido no Feishu, contra um PostgreSQL real e um Feishu simulado: o primeiro aviso cria o cartão,
 * as mudanças de status EDITAM o mesmo cartão (grupo de insumos), a expedição recebe o dela só quando o pedido chega lá,
 * e quem já tem cartão e não é avisado do evento (insumos, depois do "pronto para envio") vê o status novo em silêncio.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/session";
import { processOutbox } from "@/lib/feishu/outbox";
import { _resetTenantCache } from "@/lib/feishu/client";
import { lancarEntrada } from "@/modules/estoque/service";
import { aprovar, criar, separar } from "./service";

const tag = `C${Date.now().toString(36).toUpperCase()}`;
const INS = `oc_${tag.toLowerCase()}_ins`;
const EXP = `oc_${tag.toLowerCase()}_exp`;
let userId = "";
let regional = "";
let almox = "";
let base = "";
let produto = "";

const actor = (): CurrentUser => ({
  id: userId, name: "Tester", login: "t", email: null, mustChangePassword: false, profile: { id: "", key: "t", name: "T" },
  permissions: ["*"], scope: "GLOBAL", bases: [], baseIds: [], regionalIds: [],
});

type Chamada = { metodo: string; url: string; body: Record<string, unknown> };
const chamadas: Chamada[] = [];
let n = 0;
const feishuSimulado = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (String(url).includes("tenant_access_token")) return new Response(JSON.stringify({ code: 0, tenant_access_token: "t", expire: 7200 }));
      chamadas.push({ metodo: init?.method ?? "GET", url: String(url), body });
      return new Response(JSON.stringify({ code: 0, data: { message_id: `om_${++n}` } }));
    }),
  );
const envios = () => chamadas.filter((c) => c.metodo === "POST");
const edicoes = () => chamadas.filter((c) => c.metodo === "PATCH");
const titulo = (c: Chamada) => JSON.parse(String(c.body.content)).header.title.content as string;

beforeAll(async () => {
  process.env.FEISHU_BOT_APP_ID = "cli_bot_teste";
  process.env.FEISHU_BOT_APP_SECRET = "segredo";
  _resetTenantCache();
  regional = (await db.regional.create({ data: { code: `${tag}R`, name: "R", feishuStaffChatId: INS, feishuShippingChatId: EXP } })).id;
  almox = (await db.base.create({ data: { code: `${tag}-A`, name: "Almox", type: "ALMOXARIFADO", regionalId: regional } })).id;
  base = (await db.base.create({ data: { code: `${tag}-B`, name: "Base", regionalId: regional } })).id;
  produto = (await db.produto.create({ data: { code: `${tag}-P`, name: "Fita adesiva" } })).id;
  const profile = await db.accessProfile.create({ data: { key: tag.toLowerCase(), name: "T", scope: "GLOBAL", permissions: ["*"] } });
  userId = (await db.user.create({ data: { name: "Tester", login: tag.toLowerCase(), profileId: profile.id } })).id;
  await lancarEntrada(actor(), { baseId: almox, document: "NF", reason: null, itens: [{ produtoId: produto, quantity: 100 }] });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  delete process.env.FEISHU_BOT_APP_ID;
  delete process.env.FEISHU_BOT_APP_SECRET;
  _resetTenantCache();
  const sol = await db.solicitacao.findMany({ where: { baseId: base }, select: { id: true } });
  const ids = sol.map((s) => s.id);
  await db.notification.deleteMany({ where: { refId: { in: ids } } });
  await db.feishuOutbox.deleteMany({ where: { refId: { in: ids } } });
  await db.solicitacao.deleteMany({ where: { baseId: base } }); // apaga os FeishuCartao junto (cascade)
  await db.stockMovement.deleteMany({ where: { baseId: almox } });
  await db.stockReservation.deleteMany({ where: { baseId: almox } });
  await db.stockBalance.deleteMany({ where: { baseId: almox } });
  await db.auditLog.deleteMany({ where: { actorId: userId } });
  await db.user.deleteMany({ where: { login: tag.toLowerCase() } });
  await db.accessProfile.deleteMany({ where: { key: tag.toLowerCase() } });
  await db.produto.deleteMany({ where: { code: { startsWith: tag } } });
  await db.base.deleteMany({ where: { id: { in: [almox, base] } } });
  await db.regional.deleteMany({ where: { code: { startsWith: tag } } });
  await db.$disconnect();
});

describe("um cartão por pedido, atualizado a cada status", () => {
  it("cria no grupo de insumos, edita o mesmo cartão e a expedição recebe o dela só no fim", async () => {
    feishuSimulado();
    const s = await criar(actor(), { baseId: base, priority: "NORMAL", notes: null, itens: [{ produtoId: produto, quantity: 7 }] });
    await processOutbox();
    expect(envios().map((c) => c.body.receive_id)).toEqual([INS]);
    expect(titulo(envios()[0])).toMatch(/Aguardando aprovação/);
    expect(JSON.stringify(envios()[0].body)).toContain("Fita adesiva"); // o que foi pedido
    expect(JSON.stringify(envios()[0].body)).toContain("**7 un**"); // a quantidade
    const cartao = await db.feishuCartao.findFirstOrThrow({ where: { solicitacaoId: s.id, target: INS } });
    expect(cartao.messageId).toBe("om_1");

    await aprovar(actor(), { id: s.id, almoxarifadoId: almox, quantidades: {}, note: null });
    await processOutbox();
    // Aprovada: o grupo de insumos recebe o aviso "Nova para separar" no MESMO cartão (edição, não mensagem nova).
    expect(envios()).toHaveLength(1);
    expect(edicoes().map((c) => c.url)).toEqual([expect.stringContaining("/im/v1/messages/om_1")]);
    expect(titulo(edicoes()[0])).toMatch(/Aprovada/);

    await separar(actor(), { id: s.id, quantidades: {} });
    await processOutbox();
    // Separada: a expedição recebe o cartão dela (novo, no grupo de expedição) e o de insumos é editado em silêncio.
    expect(envios().map((c) => c.body.receive_id)).toEqual([INS, EXP]);
    expect(titulo(envios()[1])).toMatch(/Separada/);
    const edicoesInsumos = edicoes().filter((c) => c.url.includes("om_1"));
    expect(edicoesInsumos).toHaveLength(2);
    expect(titulo(edicoesInsumos[1])).toMatch(/Separada/);
    expect(await db.feishuCartao.count({ where: { solicitacaoId: s.id } })).toBe(2);
    expect(await db.feishuOutbox.count({ where: { refId: s.id, status: { not: "SENT" } } })).toBe(0);
  });
});
