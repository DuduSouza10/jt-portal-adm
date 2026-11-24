/** Estoque da franquia (K7) contra um PostgreSQL real: recebimento entra, uso sai. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { entradaFranquia } from "./api";
import { registrarUsoFranquia } from "./service";

const tag = `fq${Date.now().toString(36)}`;
let almox: string, franquia: string, base: string, produto: string, actor: never, solId: string;

beforeAll(async () => {
  const r = await db.regional.create({ data: { code: `${tag}R`, name: `R ${tag}` } });
  almox = (await db.base.create({ data: { code: `${tag}-A`, name: "A", type: "ALMOXARIFADO", regionalId: r.id } })).id;
  franquia = (await db.base.create({ data: { code: `${tag}-F`, name: "F", type: "FRANQUIA", regionalId: r.id } })).id;
  base = (await db.base.create({ data: { code: `${tag}-B`, name: "B", regionalId: r.id } })).id;
  produto = (await db.produto.create({ data: { code: `${tag}-LACRE`, name: "Lacre", lacre: true } })).id;
  const p = await db.accessProfile.create({ data: { key: `${tag}-adm`, name: "Adm", scope: "GLOBAL", permissions: ["*"] } });
  const u = await db.user.create({ data: { name: "Adm", login: `${tag}adm`, profileId: p.id } });
  actor = { id: u.id, permissions: ["*"], scope: "GLOBAL", baseIds: [], regionalIds: [] } as never;
  await db.stockBalance.create({ data: { baseId: almox, produtoId: produto, quantity: 0, avgCost: 2.5 } });
  solId = (await db.solicitacao.create({ data: { baseId: franquia, createdById: u.id, almoxarifadoId: almox, status: "ENVIADA" } })).id;
  await db.stockReservation.create({ data: { refType: "solicitacao", refId: solId, baseId: almox, produtoId: produto, quantity: 10, shipped: 8, status: "BAIXADA" } });
});

afterAll(async () => {
  await db.stockMovement.deleteMany({ where: { produtoId: produto } });
  await db.stockReservation.deleteMany({ where: { produtoId: produto } });
  await db.stockBalance.deleteMany({ where: { produtoId: produto } });
  await db.solicitacao.deleteMany({ where: { id: solId } });
  await db.auditLog.deleteMany({ where: { summary: { contains: tag } } });
  await db.produto.deleteMany({ where: { id: produto } });
  await db.base.deleteMany({ where: { code: { startsWith: tag } } });
  await db.user.deleteMany({ where: { login: { startsWith: tag } } });
  await db.accessProfile.deleteMany({ where: { key: { startsWith: tag } } });
  await db.regional.deleteMany({ where: { code: `${tag}R` } });
  await db.$disconnect();
});

const saldo = async () => (await db.stockBalance.findUnique({ where: { baseId_produtoId: { baseId: franquia, produtoId: produto } } }))?.quantity ?? 0;

describe("estoque da franquia", () => {
  it("recebimento: o enviado entra, uma vez só, com o custo do almoxarifado", async () => {
    await db.$transaction((tx) => entradaFranquia(tx, { solicitacaoId: solId, franquiaId: franquia, actorId: null }));
    await db.$transaction((tx) => entradaFranquia(tx, { solicitacaoId: solId, franquiaId: franquia, actorId: null }));
    expect(await saldo()).toBe(8);
    const b = await db.stockBalance.findUniqueOrThrow({ where: { baseId_produtoId: { baseId: franquia, produtoId: produto } } });
    expect(Number(b.avgCost)).toBe(2.5);
  });

  it("uso: sai do estoque; não deixa negativo; só em franquia", async () => {
    await registrarUsoFranquia(actor, { baseId: franquia, produtoId: produto, quantity: 3, reason: null });
    expect(await saldo()).toBe(5);
    await expect(registrarUsoFranquia(actor, { baseId: franquia, produtoId: produto, quantity: 99, reason: null })).rejects.toThrow();
    await expect(registrarUsoFranquia(actor, { baseId: base, produtoId: produto, quantity: 1, reason: null })).rejects.toThrow("Franquia não encontrada");
  });
});
