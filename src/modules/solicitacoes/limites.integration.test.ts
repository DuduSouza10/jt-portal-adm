/**
 * S1–S3 (regras do portal do Eduardo) contra um PostgreSQL real: ciclo de 3 meses da base, número de
 * pessoas obrigatório e limite por produto com bloqueio automático; recusa desfaz; quem aprova não entra.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/session";
import { lancarEntrada } from "@/modules/estoque/service";
import { aprovar, criar, enviarLote, recusar, separar } from "./service";

const tag = `L${Date.now().toString(36).toUpperCase()}`;
let userId: string;
let almox: string;
let base: string;
let franquia: string;
let luva: string;
let fita: string;

const actor = (over: Partial<CurrentUser>): CurrentUser => ({
  id: userId,
  name: "T",
  login: "t",
  email: null,
  mustChangePassword: false,
  profile: { id: "", key: "t", name: "T" },
  permissions: ["*"],
  scope: "GLOBAL",
  bases: [],
  baseIds: [],
  regionalIds: [],
  ...over,
});
const basePerfil = () => actor({ scope: "BASE", baseIds: [base, franquia], permissions: ["solicitacoes.criar", "solicitacoes.ver"] });
const admin = () => actor({});
const pedir = (baseId: string, produtoId: string, quantity: number, peopleCount: number | null = 8) =>
  criar(basePerfil(), { baseId, priority: "NORMAL", notes: null, peopleCount: peopleCount ?? undefined, itens: [{ produtoId, quantity }] });

beforeAll(async () => {
  const r = await db.regional.create({ data: { code: `${tag}R`, name: "R" } });
  almox = (await db.base.create({ data: { code: `${tag}-A`, name: "A", type: "ALMOXARIFADO", regionalId: r.id } })).id;
  base = (await db.base.create({ data: { code: `${tag}-B`, name: "Base", regionalId: r.id } })).id;
  franquia = (await db.base.create({ data: { code: `${tag}-F`, name: "Franquia", type: "FRANQUIA", regionalId: r.id } })).id;
  luva = (await db.produto.create({ data: { code: `${tag}-LUVA`, name: "Luva", unit: "cx", limitBase: 10, limitFranquia: 4, limitBlockDays: 60 } })).id;
  fita = (await db.produto.create({ data: { code: `${tag}-FITA`, name: "Fita" } })).id;
  const profile = await db.accessProfile.create({ data: { key: tag.toLowerCase(), name: "T", scope: "GLOBAL", permissions: ["*"] } });
  userId = (await db.user.create({ data: { name: "T", login: tag.toLowerCase(), profileId: profile.id } })).id;
  await lancarEntrada(admin(), { baseId: almox, document: "NF", reason: null, itens: [{ produtoId: luva, quantity: 500 }, { produtoId: fita, quantity: 500 }] });
});

afterAll(async () => {
  const ids = [almox, base, franquia];
  await db.solicitacao.deleteMany({ where: { baseId: { in: ids } } });
  await db.shipmentPhoto.deleteMany({ where: { solicitacoes: { none: {} } } });
  await db.stockMovement.deleteMany({ where: { baseId: { in: ids } } });
  await db.stockReservation.deleteMany({ where: { baseId: { in: ids } } });
  await db.stockBalance.deleteMany({ where: { baseId: { in: ids } } });
  await db.auditLog.deleteMany({ where: { actorId: userId } });
  await db.notification.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.accessProfile.deleteMany({ where: { key: tag.toLowerCase() } });
  await db.base.deleteMany({ where: { id: { in: ids } } });
  await db.produto.deleteMany({ where: { code: { startsWith: tag } } });
  await db.regional.deleteMany({ where: { code: `${tag}R` } });
  await db.$disconnect();
});

describe("S1 e S2: ciclo de 3 meses e número de pessoas", () => {
  it("base informa pessoas; depois de pedir entra no ciclo; recusa derruba o ciclo; envio conta do envio", async () => {
    await expect(pedir(base, fita, 1, null)).rejects.toThrow(/número de pessoas/);

    const s1 = await pedir(base, fita, 2);
    expect(s1.peopleCount).toBe(8);
    await expect(pedir(base, fita, 1)).rejects.toThrow(/ciclo de 3 meses/);

    // Recusado: o ciclo cai e a base pode pedir de novo.
    await recusar(admin(), s1.id, "teste");
    const s2 = await pedir(base, fita, 2);

    // Enviado: o ciclo passa a contar 3 meses a partir do envio.
    await aprovar(admin(), { id: s2.id, almoxarifadoId: almox, quantidades: {}, note: null });
    await separar(admin(), { id: s2.id, quantidades: {} });
    await enviarLote(admin(), { ids: [s2.id], tripId: "VG", shippingNotes: null }, { mime: "image/png", data: new Uint8Array([1]) });
    const ciclo = await db.cicloBase.findUniqueOrThrow({ where: { baseId: base } });
    const enviada = await db.solicitacao.findUniqueOrThrow({ where: { id: s2.id } });
    expect(ciclo.sourceSolicitacaoId).toBe(s2.id);
    expect(ciclo.blockedUntil.getUTCMonth()).toBe((enviada.shippedAt!.getUTCMonth() + 3) % 12);
    expect(ciclo.reason).toMatch(/envio/);

    // Quem aprova não entra no ciclo; franquia não tem ciclo e não precisa informar pessoas.
    await criar(admin(), { baseId: base, priority: "NORMAL", notes: null, itens: [{ produtoId: fita, quantity: 1 }] });
    await pedir(franquia, fita, 1, null);
    await pedir(franquia, fita, 1, null);
  });
});

describe("S3: limite por produto", () => {
  it("franquia: limite de 4 no período, bloqueio automático ao atingir e recusa desfaz", async () => {
    await expect(pedir(franquia, luva, 5, null)).rejects.toThrow("Limite permitido: 4 cx");
    const a = await pedir(franquia, luva, 3, null);
    await expect(pedir(franquia, luva, 2, null)).rejects.toThrow("Restam 1 cx no período de bloqueio");
    const b = await pedir(franquia, luva, 1, null);
    const bloqueio = await db.bloqueioProduto.findUniqueOrThrow({ where: { baseId_produtoId: { baseId: franquia, produtoId: luva } } });
    expect(bloqueio.sourceSolicitacaoId).toBe(b.id);
    await expect(pedir(franquia, luva, 1, null)).rejects.toThrow(/bloqueado para nova solicitação/);

    // Recusar o pedido que atingiu o limite desfaz o bloqueio e devolve o saldo do período.
    await recusar(admin(), b.id, "teste");
    expect((await db.bloqueioProduto.findUniqueOrThrow({ where: { id: bloqueio.id } })).revokedAt).not.toBeNull();
    await pedir(franquia, luva, 1, null);
    expect(a.id).toBeTruthy();
  });
});

describe("S1 desligado em Configurações", () => {
  it("com o ciclo desligado a base pede de novo; limites continuam valendo", async () => {
    await db.cicloBase.deleteMany({ where: { baseId: base } });
    await db.setting.upsert({ where: { key: "pedidos" }, update: { value: { cicloAtivo: false, cicloMeses: 3 } }, create: { key: "pedidos", value: { cicloAtivo: false, cicloMeses: 3 } } });
    try {
      await pedir(base, fita, 1);
      await pedir(base, fita, 1);
      expect(await db.cicloBase.count({ where: { baseId: base } })).toBe(0);
      await expect(pedir(base, luva, 11)).rejects.toThrow("Limite permitido: 10 cx");
    } finally {
      await db.setting.deleteMany({ where: { key: "pedidos" } });
    }
  });
});
