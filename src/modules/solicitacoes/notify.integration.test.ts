/**
 * Avisos (sino + fila do Feishu) contra o banco (npm run test:integration).
 * Usuários com os perfis padrão, cada um com o seu alcance: confere quem recebe cada aviso e quem NÃO recebe.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/session";
import { lancarEntrada } from "@/modules/estoque/service";
import { aprovar, comentar, criar, iniciarSeparacao, separar } from "./service";

const tag = `N${Date.now().toString(36).toUpperCase()}`;
const t = tag.toLowerCase();
const started = new Date();
let regional: string;
let outraRegional: string;
let almox: string;
let base: string;
let produto: string;
const u: Record<string, CurrentUser> = {};

async function usuario(nome: string, scope: "GLOBAL" | "REGIONAL" | "BASE", permissions: string[], links: { base?: string; regional?: string }) {
  const profile = await db.accessProfile.create({ data: { key: `${t}-${nome}`, name: `${nome} ${tag}`, scope, permissions } });
  const row = await db.user.create({
    data: {
      name: nome,
      login: `${t}.${nome}`,
      profileId: profile.id,
      feishuOpenId: `ou_${t}${nome}`,
      ...(links.base && { bases: { create: { baseId: links.base } } }),
      ...(links.regional && { regionals: { create: { regionalId: links.regional } } }),
    },
  });
  u[nome] = {
    id: row.id,
    name: nome,
    login: row.login,
    email: null,
    mustChangePassword: false,
    profile: { id: profile.id, key: profile.key, name: profile.name },
    permissions,
    scope,
    bases: [],
    baseIds: links.base ? [links.base] : [],
    regionalIds: links.regional ? [links.regional] : [],
  };
}

const notifs = async (nome: string) =>
  (await db.notification.findMany({ where: { userId: u[nome].id }, orderBy: { createdAt: "asc" } })).map((n) => n.title);

beforeAll(async () => {
  process.env.FEISHU_WEBHOOK_URL = "https://exemplo.invalid/webhook-equipe";
  process.env.FEISHU_SHIPPING_WEBHOOK_URL = "https://exemplo.invalid/webhook-expedicao";
  regional = (await db.regional.create({ data: { code: `${tag}R1`, name: "R1" } })).id;
  outraRegional = (await db.regional.create({ data: { code: `${tag}R2`, name: "R2" } })).id;
  almox = (await db.base.create({ data: { code: `${tag}-ALM`, name: "Almox", type: "ALMOXARIFADO", regionalId: regional } })).id;
  base = (await db.base.create({ data: { code: `${tag}-B1`, name: "Base 1", regionalId: regional } })).id;
  produto = (await db.produto.create({ data: { code: `${tag}-P`, name: "Produto" } })).id;

  await usuario("base", "BASE", ["produtos.ver", "solicitacoes.criar", "solicitacoes.ver"], { base });
  await usuario("colega", "BASE", ["produtos.ver", "solicitacoes.criar", "solicitacoes.ver"], { base });
  await usuario("gestor", "REGIONAL", ["solicitacoes.ver", "solicitacoes.aprovar"], { regional });
  await usuario("gestorfora", "REGIONAL", ["solicitacoes.ver", "solicitacoes.aprovar"], { regional: outraRegional });
  await usuario("almox", "REGIONAL", ["solicitacoes.ver", "expedicao.separar", "estoque.ver", "estoque.movimentar"], { regional });
  await usuario("expedicao", "REGIONAL", ["expedicao.enviar"], { regional });
  await usuario("dev", "GLOBAL", ["*"], {});

  await lancarEntrada(u.dev, { baseId: almox, document: "NF", reason: null, itens: [{ produtoId: produto, quantity: 50 }] });
});

// O ciclo de 3 meses (S1) barraria o segundo pedido da mesma base: cada teste começa sem ciclo.
beforeEach(async () => {
  await db.cicloBase.deleteMany({ where: { base: { code: { startsWith: tag } } } });
});

afterAll(async () => {
  delete process.env.FEISHU_WEBHOOK_URL;
  delete process.env.FEISHU_SHIPPING_WEBHOOK_URL;
  const ids = Object.values(u).map((x) => x.id);
  await db.feishuOutbox.deleteMany({ where: { createdAt: { gte: started } } });
  // Avisos dos pedidos de teste também chegam a usuários de verdade do banco (ex.: um admin global).
  const solicitacoes = await db.solicitacao.findMany({ where: { baseId: base }, select: { id: true } });
  await db.notification.deleteMany({ where: { refType: "solicitacao", refId: { in: solicitacoes.map((x) => x.id) } } });
  await db.solicitacao.deleteMany({ where: { baseId: base } });
  await db.stockMovement.deleteMany({ where: { baseId: almox } });
  await db.stockReservation.deleteMany({ where: { baseId: almox } });
  await db.stockBalance.deleteMany({ where: { baseId: almox } });
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.accessProfile.deleteMany({ where: { key: { startsWith: t } } });
  await db.produto.deleteMany({ where: { code: { startsWith: tag } } });
  await db.base.deleteMany({ where: { id: { in: [almox, base] } } });
  await db.regional.deleteMany({ where: { code: { startsWith: tag } } });
  await db.$disconnect();
});

describe("avisos das solicitações", () => {
  let id = "";

  it("nova: só quem aprova aquela base (não o de outra regional, nem o Dev, nem quem pediu)", async () => {
    id = (await criar(u.base, { baseId: base, priority: "URGENTE", peopleCount: 5, notes: null, itens: [{ produtoId: produto, quantity: 5 }] })).id;
    expect(await notifs("gestor")).toEqual([expect.stringMatching(/URGENTE · Nova solicitação SOL-/)]);
    for (const nome of ["gestorfora", "dev", "base", "almox", "expedicao"]) expect(await notifs(nome), nome).toEqual([]);
    const fila = await db.feishuOutbox.findMany({ where: { createdAt: { gte: started }, event: { startsWith: "solicitacao.criada" } } });
    expect(fila.map((f) => [f.channel, f.target])).toEqual([["webhook", null]]); // grupo da equipe
  });

  it("aprovada: a base (quem pediu e o colega) e o almoxarifado", async () => {
    await aprovar(u.gestor, { id, almoxarifadoId: almox, quantidades: {}, note: null });
    expect(await notifs("base")).toEqual([expect.stringMatching(/: Aprovada$/)]);
    expect(await notifs("colega")).toEqual([expect.stringMatching(/: Aprovada$/)]);
    expect(await notifs("almox")).toEqual([expect.stringMatching(/^Nova para separar/)]);
    expect(await notifs("expedicao")).toEqual([]);
  });

  it("separada: a base e a expedição (pelo webhook da expedição)", async () => {
    await iniciarSeparacao(u.almox, id);
    await separar(u.almox, { id, quantidades: {} });
    expect(await notifs("expedicao")).toEqual([expect.stringMatching(/^Pronto para envio/)]);
    expect((await notifs("base")).at(-1)).toMatch(/Separada/);
    const fila = await db.feishuOutbox.findFirstOrThrow({ where: { createdAt: { gte: started }, event: { startsWith: "solicitacao.separada.expedicao" } } });
    expect([fila.channel, fila.target]).toEqual(["webhook", "expedicao"]);
  });

  it("comentário de quem é da base vai para quem aprova e para o almoxarifado", async () => {
    const antes = (await notifs("gestor")).length;
    await comentar(u.base, id, "Pode mandar hoje?");
    expect((await notifs("gestor")).length).toBe(antes + 1);
    expect((await notifs("almox")).at(-1)).toMatch(/Novo comentário/);
    // Mesmo grupo (equipe) para os dois públicos: um cartão só.
    expect(await db.feishuOutbox.count({ where: { createdAt: { gte: started }, event: { startsWith: "solicitacao.comentario" } } })).toBe(1);
  });

  it("a página da notificação aponta para a solicitação", async () => {
    const n = await db.notification.findFirstOrThrow({ where: { userId: u.gestor.id } });
    expect(n.link).toBe(`/solicitacoes/${id}`);
  });
});
