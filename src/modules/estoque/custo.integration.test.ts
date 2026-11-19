/**
 * Custo dos insumos (K5) contra um PostgreSQL real: custo médio ponderado pelas NFs, transferência ao custo
 * da origem, saída gravando o custo médio e o envio de uma solicitação gravando o custo em cada item.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/session";
import { lancarEntrada, lancarSaida, transferir } from "./service";
import { aprovar, criar, enviarLote, separar } from "@/modules/solicitacoes/service";

const tag = `C${Date.now().toString(36).toUpperCase()}`;
let userId: string;
let almA: string;
let almB: string;
let base: string;
let p1: string;

const actor = (over: Partial<CurrentUser> = {}): CurrentUser => ({
  id: userId,
  name: "Teste",
  login: "teste",
  email: null,
  mustChangePassword: false,
  profile: { id: "", key: "teste", name: "Teste" },
  permissions: ["*"],
  scope: "GLOBAL",
  bases: [],
  baseIds: [],
  regionalIds: [],
  ...over,
});
const bal = (baseId: string) => db.stockBalance.findUniqueOrThrow({ where: { baseId_produtoId: { baseId, produtoId: p1 } } });

beforeAll(async () => {
  const r = await db.regional.create({ data: { code: `${tag}R`, name: "R" } });
  almA = (await db.base.create({ data: { code: `${tag}-A`, name: "A", type: "ALMOXARIFADO", regionalId: r.id } })).id;
  almB = (await db.base.create({ data: { code: `${tag}-B`, name: "B", type: "ALMOXARIFADO", regionalId: r.id } })).id;
  base = (await db.base.create({ data: { code: `${tag}-L`, name: "Loja", regionalId: r.id } })).id;
  p1 = (await db.produto.create({ data: { code: `${tag}-P1`, name: "Produto" } })).id;
  const profile = await db.accessProfile.create({ data: { key: tag.toLowerCase(), name: "T", scope: "GLOBAL", permissions: ["*"] } });
  userId = (await db.user.create({ data: { name: "T", login: tag.toLowerCase(), profileId: profile.id } })).id;
});

afterAll(async () => {
  const ids = [almA, almB, base];
  await db.solicitacao.deleteMany({ where: { baseId: base } });
  await db.shipmentPhoto.deleteMany({ where: { solicitacoes: { none: {} } } });
  await db.stockMovement.deleteMany({ where: { baseId: { in: ids } } });
  await db.stockReservation.deleteMany({ where: { baseId: { in: ids } } });
  await db.stockBalance.deleteMany({ where: { baseId: { in: ids } } });
  await db.auditLog.deleteMany({ where: { actorId: userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.accessProfile.deleteMany({ where: { key: tag.toLowerCase() } });
  await db.produto.deleteMany({ where: { id: p1 } });
  await db.base.deleteMany({ where: { id: { in: ids } } });
  await db.regional.deleteMany({ where: { code: `${tag}R` } });
  await db.$disconnect();
});

describe("custo médio (K5)", () => {
  it("pondera as NFs, transfere ao custo da origem e grava o custo nas saídas e no envio", async () => {
    await lancarEntrada(actor(), { baseId: almA, document: "NF 1", reason: null, itens: [{ produtoId: p1, quantity: 10, unitCost: 10 }] });
    await lancarEntrada(actor(), { baseId: almA, document: "NF 2", reason: null, itens: [{ produtoId: p1, quantity: 30, unitCost: 14 }] });
    // (10×10 + 30×14) / 40 = 13
    expect(Number((await bal(almA)).avgCost)).toBe(13);

    // Entrada sem valor não mexe no custo médio.
    await lancarEntrada(actor(), { baseId: almA, document: "NF 3", reason: null, itens: [{ produtoId: p1, quantity: 10 }] });
    expect(Number((await bal(almA)).avgCost)).toBe(13);

    await lancarSaida(actor(), { baseId: almA, reason: "avaria", document: null, itens: [{ produtoId: p1, quantity: 5 }] });
    const saida = await db.stockMovement.findFirstOrThrow({ where: { baseId: almA, type: "SAIDA" } });
    expect(Number(saida.unitCost)).toBe(13);

    await transferir(actor(), { origemId: almA, destinoId: almB, reason: null, document: null, itens: [{ produtoId: p1, quantity: 5 }] });
    expect(Number((await bal(almB)).avgCost)).toBe(13);

    const s = await criar(actor(), { baseId: base, priority: "NORMAL", notes: null, itens: [{ produtoId: p1, quantity: 4 }] });
    await aprovar(actor(), { id: s.id, almoxarifadoId: almA, quantidades: {}, note: null });
    await separar(actor(), { id: s.id, quantidades: {} });
    await enviarLote(actor(), { ids: [s.id], tripId: "VG-1", shippingNotes: null }, { mime: "image/png", data: new Uint8Array([1, 2, 3]) });
    const item = await db.solicitacaoItem.findFirstOrThrow({ where: { solicitacaoId: s.id } });
    expect(Number(item.unitCost)).toBe(13);
  });
});
