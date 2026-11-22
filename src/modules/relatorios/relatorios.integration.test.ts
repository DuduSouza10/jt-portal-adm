/**
 * Filtros dos relatórios contra um PostgreSQL real: regional, base e almoxarifado restringem os números,
 * e o filtro nunca abre dado fora do alcance de quem vê.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/session";
import { countInPeriod, filtroOptions, ordersInPeriod } from "./queries";

const tag = `Q${Date.now().toString(36).toUpperCase()}`;
let rA: string;
let rB: string;
let bA: string;
let bB: string;
let alm: string;
let userId: string;
const start = new Date("2026-11-01T03:00:00Z");
const end = new Date("2026-12-01T03:00:00Z");

const actor = (over: Partial<CurrentUser> = {}): CurrentUser => ({
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

beforeAll(async () => {
  rA = (await db.regional.create({ data: { code: `${tag}A`, name: "A" } })).id;
  rB = (await db.regional.create({ data: { code: `${tag}B`, name: "B" } })).id;
  bA = (await db.base.create({ data: { code: `${tag}-BA`, name: "Base A", regionalId: rA } })).id;
  bB = (await db.base.create({ data: { code: `${tag}-BB`, name: "Base B", regionalId: rB } })).id;
  alm = (await db.base.create({ data: { code: `${tag}-AL`, name: "Almox", type: "ALMOXARIFADO", regionalId: rA } })).id;
  const profile = await db.accessProfile.create({ data: { key: tag.toLowerCase(), name: "T", scope: "GLOBAL", permissions: ["*"] } });
  userId = (await db.user.create({ data: { name: "T", login: tag.toLowerCase(), profileId: profile.id } })).id;
  const mk = (baseId: string, almoxarifadoId: string | null, day: number) =>
    db.solicitacao.create({ data: { baseId, almoxarifadoId, createdById: userId, createdAt: new Date(Date.UTC(2026, 10, day, 15)) } });
  await mk(bA, alm, 3);
  await mk(bA, null, 4);
  await mk(bB, alm, 5);
});

afterAll(async () => {
  await db.solicitacao.deleteMany({ where: { createdById: userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.accessProfile.deleteMany({ where: { key: tag.toLowerCase() } });
  await db.base.deleteMany({ where: { code: { startsWith: tag } } });
  await db.regional.deleteMany({ where: { code: { startsWith: tag } } });
  await db.$disconnect();
});

describe("filtros dos relatórios", () => {
  it("regional, base e almoxarifado restringem", async () => {
    const mine = (o: { base: { code: string } }) => o.base.code.startsWith(tag);
    expect((await ordersInPeriod(actor(), start, end)).filter(mine)).toHaveLength(3);
    expect(await ordersInPeriod(actor(), start, end, { regionalId: rA })).toHaveLength(2);
    expect(await ordersInPeriod(actor(), start, end, { baseId: bB })).toHaveLength(1);
    expect(await ordersInPeriod(actor(), start, end, { almoxId: alm })).toHaveLength(2);
    expect(await countInPeriod(actor(), start, end, { regionalId: rA, almoxId: alm })).toBe(1);
  });

  it("filtro não abre dado fora do alcance", async () => {
    const gestorA = actor({ scope: "REGIONAL", regionalIds: [rA], permissions: ["relatorios.ver"] });
    expect(await ordersInPeriod(gestorA, start, end, { baseId: bB })).toHaveLength(0);
    const opts = await filtroOptions(gestorA);
    expect(opts.regionais.map((r) => r.id)).toEqual([rA]);
    expect(opts.bases.map((b) => b.id)).toEqual([bA]);
  });
});
