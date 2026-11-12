/**
 * Integração do estoque contra um PostgreSQL real (npm run test:integration).
 * Cobre as regras K3/K4 de ponta a ponta e, principalmente, CONCORRÊNCIA: com milhares de usuários,
 * várias pessoas mexem no mesmo produto ao mesmo tempo e o saldo não pode errar.
 *
 * Obs.: o banco local do `prisma dev` atende uma conexão por vez; por isso o bloco "concorrência" só roda
 * no CI (Postgres real, pool de 20 conexões) ou com CONCURRENCY_TESTS=1.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/session";
import { ajustarInventario, lancarEntrada, lancarSaida, transferir } from "./service";
import { baixarReserva, liberarReserva, reservar, STOCK_TX } from "./api";

const tag = `T${Date.now().toString(36).toUpperCase()}`;
let mg: { id: string; regionalId: string };
let sp: { id: string; regionalId: string };
let loja: { id: string };
let p1: string;
let p2: string;
let actorMG: CurrentUser;
let actorGlobal: CurrentUser;

const actor = (over: Partial<CurrentUser>): CurrentUser => ({
  id: "",
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

const bal = async (baseId: string, produtoId: string) =>
  (await db.stockBalance.findUnique({ where: { baseId_produtoId: { baseId, produtoId } } })) ?? { quantity: 0, reserved: 0 };

beforeAll(async () => {
  const rMG = await db.regional.create({ data: { code: `${tag}MG`, name: "MG teste" } });
  const rSP = await db.regional.create({ data: { code: `${tag}SP`, name: "SP teste" } });
  mg = await db.base.create({ data: { code: `${tag}-ALM-MG`, name: "Alm MG", type: "ALMOXARIFADO", regionalId: rMG.id } });
  sp = await db.base.create({ data: { code: `${tag}-ALM-SP`, name: "Alm SP", type: "ALMOXARIFADO", regionalId: rSP.id } });
  loja = await db.base.create({ data: { code: `${tag}-BASE`, name: "Base", type: "BASE", regionalId: rMG.id } });
  p1 = (await db.produto.create({ data: { code: `${tag}-P1`, name: "Produto 1" } })).id;
  p2 = (await db.produto.create({ data: { code: `${tag}-P2`, name: "Produto 2" } })).id;
  const profile = await db.accessProfile.create({ data: { key: tag.toLowerCase(), name: "Teste", scope: "GLOBAL", permissions: ["*"] } });
  const user = await db.user.create({ data: { name: "Teste", login: tag.toLowerCase(), profileId: profile.id } });
  actorGlobal = actor({ id: user.id });
  actorMG = actor({ id: user.id, scope: "REGIONAL", regionalIds: [rMG.id], permissions: ["estoque.ver", "estoque.movimentar"] });
});

afterAll(async () => {
  const baseIds = [mg.id, sp.id, loja.id];
  await db.stockMovement.deleteMany({ where: { baseId: { in: baseIds } } });
  await db.stockReservation.deleteMany({ where: { baseId: { in: baseIds } } });
  await db.stockBalance.deleteMany({ where: { baseId: { in: baseIds } } });
  await db.auditLog.deleteMany({ where: { actorId: actorGlobal.id } });
  await db.user.deleteMany({ where: { login: tag.toLowerCase() } });
  await db.accessProfile.deleteMany({ where: { key: tag.toLowerCase() } });
  await db.produto.deleteMany({ where: { code: { startsWith: tag } } });
  await db.base.deleteMany({ where: { id: { in: baseIds } } });
  await db.regional.deleteMany({ where: { code: { startsWith: tag } } });
  await db.$disconnect();
});

describe("lançamentos", () => {
  it("entrada soma e junta linhas repetidas", async () => {
    await lancarEntrada(actorMG, { baseId: mg.id, document: "NF 1", reason: null, itens: [{ produtoId: p1, quantity: 100 }, { produtoId: p2, quantity: 50 }, { produtoId: p1, quantity: 20 }] });
    expect(await bal(mg.id, p1)).toMatchObject({ quantity: 120, reserved: 0 });
  });

  it("respeita o alcance do usuário e o tipo de base", async () => {
    await expect(lancarEntrada(actorMG, { baseId: sp.id, document: "x", reason: null, itens: [{ produtoId: p1, quantity: 1 }] })).rejects.toThrow(/não encontrado/);
    await expect(lancarEntrada(actorGlobal, { baseId: loja.id, document: "x", reason: null, itens: [{ produtoId: p1, quantity: 1 }] })).rejects.toThrow(/não é um almoxarifado/);
  });

  it("saída sem saldo desfaz o lançamento inteiro", async () => {
    await expect(
      lancarSaida(actorMG, { baseId: mg.id, reason: "teste", document: null, itens: [{ produtoId: p1, quantity: 1 }, { produtoId: p2, quantity: 51 }] }),
    ).rejects.toThrow(/insuficiente/);
    expect((await bal(mg.id, p1)).quantity).toBe(120);
    expect((await bal(mg.id, p2)).quantity).toBe(50);
  });
});

describe("solicitações (K4)", () => {
  it("reserva, envio parcial e liberação do resto", async () => {
    await db.$transaction((tx) => reservar(tx, { solicitacaoId: `${tag}-s1`, almoxarifadoId: mg.id, actorId: null, itens: [{ produtoId: p1, quantity: 30 }, { produtoId: p2, quantity: 10 }] }), STOCK_TX);
    expect(await bal(mg.id, p1)).toMatchObject({ quantity: 120, reserved: 30 });
    await expect(lancarSaida(actorMG, { baseId: mg.id, reason: "x", document: null, itens: [{ produtoId: p1, quantity: 91 }] })).rejects.toThrow(/disponível: 90/);
    await expect(db.$transaction((tx) => reservar(tx, { solicitacaoId: `${tag}-s1`, almoxarifadoId: mg.id, actorId: null, itens: [{ produtoId: p1, quantity: 1 }] }))).rejects.toThrow(/já tem reserva/);

    await db.$transaction((tx) => baixarReserva(tx, { solicitacaoId: `${tag}-s1`, actorId: null, enviados: [{ produtoId: p1, quantity: 25 }] }), STOCK_TX);
    expect(await bal(mg.id, p1)).toMatchObject({ quantity: 95, reserved: 0 });
    expect(await bal(mg.id, p2)).toMatchObject({ quantity: 50, reserved: 0 });
  });

  it("só solicitação recusada pode ser reservada de novo; enviada não", async () => {
    await db.$transaction((tx) => reservar(tx, { solicitacaoId: `${tag}-r1`, almoxarifadoId: mg.id, actorId: null, itens: [{ produtoId: p2, quantity: 2 }] }));
    await db.$transaction((tx) => liberarReserva(tx, { solicitacaoId: `${tag}-r1`, actorId: null }));
    await db.$transaction((tx) => reservar(tx, { solicitacaoId: `${tag}-r1`, almoxarifadoId: mg.id, actorId: null, itens: [{ produtoId: p2, quantity: 3 }] }));
    expect((await bal(mg.id, p2)).reserved).toBe(3);
    await db.$transaction((tx) => baixarReserva(tx, { solicitacaoId: `${tag}-r1`, actorId: null }));
    await expect(
      db.$transaction((tx) => reservar(tx, { solicitacaoId: `${tag}-r1`, almoxarifadoId: mg.id, actorId: null, itens: [{ produtoId: p2, quantity: 1 }] })),
    ).rejects.toThrow(/já foi enviada/);
    expect(await bal(mg.id, p2)).toMatchObject({ quantity: 47, reserved: 0 });
  });

  it("recusa libera a reserva", async () => {
    await db.$transaction((tx) => reservar(tx, { solicitacaoId: `${tag}-s2`, almoxarifadoId: mg.id, actorId: null, itens: [{ produtoId: p2, quantity: 20 }] }));
    await db.$transaction((tx) => liberarReserva(tx, { solicitacaoId: `${tag}-s2`, actorId: null }));
    expect((await bal(mg.id, p2)).reserved).toBe(0);
  });
});

describe("inventário (K3)", () => {
  it("contagem abaixo do reservado: aceita, alerta, e o envio falha até revisar", async () => {
    await db.$transaction((tx) => reservar(tx, { solicitacaoId: `${tag}-s3`, almoxarifadoId: mg.id, actorId: null, itens: [{ produtoId: p2, quantity: 40 }] }));
    const r = await ajustarInventario(actorMG, { baseId: mg.id, reason: "Inventário", itens: [{ produtoId: p2, quantity: 30 }, { produtoId: p1, quantity: 95 }] });
    expect(r.changed).toBe(1);
    expect(r.warnings).toHaveLength(1);
    await expect(db.$transaction((tx) => baixarReserva(tx, { solicitacaoId: `${tag}-s3`, actorId: null }))).rejects.toThrow(/físico: 30/);
    await db.$transaction((tx) => liberarReserva(tx, { solicitacaoId: `${tag}-s3`, actorId: null }));
  });
});

// Concorrência de verdade precisa de um Postgres com várias conexões (o CI tem). O `prisma dev` local
// atende uma conexão por vez: as transações ficam em fila e estouram o tempo de espera.
// Para rodar localmente contra um Postgres real: CONCURRENCY_TESTS=1 npm run test:integration
const realConcurrency = !!process.env.CI || process.env.CONCURRENCY_TESTS === "1";

describe.skipIf(!realConcurrency)("concorrência", () => {
  it("40 saídas simultâneas num saldo que só comporta 26: nunca vende além do saldo", async () => {
    await ajustarInventario(actorGlobal, { baseId: mg.id, reason: "preparo", itens: [{ produtoId: p1, quantity: 80 }] });
    const results = await Promise.allSettled(
      Array.from({ length: 40 }, () => lancarSaida(actorGlobal, { baseId: mg.id, reason: "concorrência", document: null, itens: [{ produtoId: p1, quantity: 3 }] })),
    );
    const passed = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    // Toda falha tem que ser por falta de saldo, não por erro de banco.
    for (const f of failed) expect(f.reason.message).toMatch(/insuficiente/);
    expect(passed).toBe(26);
    expect((await bal(mg.id, p1)).quantity).toBe(2);
  });

  it("transferências em sentidos opostos ao mesmo tempo não travam (deadlock)", async () => {
    await lancarEntrada(actorGlobal, { baseId: mg.id, document: "NF", reason: null, itens: [{ produtoId: p1, quantity: 100 }, { produtoId: p2, quantity: 100 }] });
    await lancarEntrada(actorGlobal, { baseId: sp.id, document: "NF", reason: null, itens: [{ produtoId: p1, quantity: 100 }, { produtoId: p2, quantity: 100 }] });
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        transferir(actorGlobal, {
          origemId: i % 2 ? mg.id : sp.id,
          destinoId: i % 2 ? sp.id : mg.id,
          reason: null,
          document: null,
          itens: [{ produtoId: p1, quantity: 1 }, { produtoId: p2, quantity: 1 }],
        }),
      ),
    );
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(failed.map((f) => f.reason.message)).toEqual([]);
    // Transferência só move entre almoxarifados: o total não muda (2 que sobraram + 100 + 100).
    expect((await bal(mg.id, p1)).quantity + (await bal(sp.id, p1)).quantity).toBe(202);
  });

  it("reservas simultâneas não prometem o mesmo item duas vezes", async () => {
    await ajustarInventario(actorGlobal, { baseId: sp.id, reason: "preparo", itens: [{ produtoId: p2, quantity: 10 }] });
    const results = await Promise.allSettled(
      Array.from({ length: 15 }, (_, i) =>
        db.$transaction((tx) => reservar(tx, { solicitacaoId: `${tag}-c${i}`, almoxarifadoId: sp.id, actorId: null, itens: [{ produtoId: p2, quantity: 1 }] }), STOCK_TX),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    expect(await bal(sp.id, p2)).toMatchObject({ quantity: 10, reserved: 10 });
  });
});

describe.skipIf(!realConcurrency)("concorrência na MESMA solicitação (clique duplo, dois aprovadores)", () => {
  it("aprovar 5 vezes ao mesmo tempo reserva uma vez só", async () => {
    await ajustarInventario(actorGlobal, { baseId: sp.id, reason: "preparo", itens: [{ produtoId: p1, quantity: 50 }] });
    const before = (await bal(sp.id, p1)).reserved;
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        db.$transaction((tx) => reservar(tx, { solicitacaoId: `${tag}-dup`, almoxarifadoId: sp.id, actorId: null, itens: [{ produtoId: p1, quantity: 4 }] }), STOCK_TX),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason.message).toMatch(/já tem reserva/);
    expect((await bal(sp.id, p1)).reserved - before).toBe(4);
  });

  it("enviar 5 vezes ao mesmo tempo baixa uma vez só e não consome a reserva de outra solicitação", async () => {
    await db.$transaction((tx) => reservar(tx, { solicitacaoId: `${tag}-outra`, almoxarifadoId: sp.id, actorId: null, itens: [{ produtoId: p1, quantity: 4 }] }));
    const antes = await bal(sp.id, p1);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => db.$transaction((tx) => baixarReserva(tx, { solicitacaoId: `${tag}-dup`, actorId: null }), STOCK_TX)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await bal(sp.id, p1)).toMatchObject({ quantity: antes.quantity - 4, reserved: antes.reserved - 4 });
    const outra = await db.stockReservation.findFirstOrThrow({ where: { refId: `${tag}-outra` } });
    expect(outra).toMatchObject({ status: "ATIVA", quantity: 4 });
    await db.$transaction((tx) => liberarReserva(tx, { solicitacaoId: `${tag}-outra`, actorId: null }));
  });
});

describe("livro-razão", () => {
  it("a soma das movimentações bate com o saldo de cada produto", async () => {
    for (const baseId of [mg.id, sp.id]) {
      for (const produtoId of [p1, p2]) {
        const s = await db.stockMovement.aggregate({ where: { baseId, produtoId }, _sum: { quantity: true, reservedDelta: true } });
        const b = await bal(baseId, produtoId);
        expect([s._sum.quantity ?? 0, s._sum.reservedDelta ?? 0]).toEqual([b.quantity, b.reserved]);
      }
    }
  });
});
