/** Minhas bases (E17/E19): supervisor não pega a base de outro supervisor; RM vê e pega todas. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { SUPERVISOR_KEY } from "@/lib/permissions/default-profiles";
import { basesDeOutrosSupervisores, escolherMinhasBases, supervisoresComBases } from "./service";

const tag = `mb${Date.now().toString(36)}`;
const PERMS = ["bases.escolher"];
let baseA: string;
let baseB: string;
let sup1: never;
let sup2: never;
let rm: never;

const ator = (u: { id: string; login: string }, p: { id: string; key: string }) =>
  ({ id: u.id, name: u.login, login: u.login, email: null, mustChangePassword: false, profile: { id: p.id, key: p.key, name: p.key }, permissions: PERMS, scope: "BASE", bases: [], baseIds: [], regionalIds: [] }) as never;

beforeAll(async () => {
  const r = await db.regional.create({ data: { code: `${tag}R`, name: `R ${tag}` } });
  baseA = (await db.base.create({ data: { code: `${tag}-A`, name: "A", regionalId: r.id } })).id;
  baseB = (await db.base.create({ data: { code: `${tag}-B`, name: "B", regionalId: r.id } })).id;
  const mk = (key: string) => db.accessProfile.upsert({ where: { key }, update: {}, create: { key, name: key, scope: "BASE", permissions: PERMS, system: true } });
  const [pSup, pRm] = await Promise.all([mk(SUPERVISOR_KEY), mk("rm")]);
  const u = (s: string, profileId: string) => db.user.create({ data: { name: s, login: `${tag}${s}`, profileId } });
  const [s1, s2, r1] = await Promise.all([u("s1", pSup.id), u("s2", pSup.id), u("r1", pRm.id)]);
  sup1 = ator(s1, pSup);
  sup2 = ator(s2, pSup);
  rm = ator(r1, pRm);
});

afterAll(async () => {
  const ids = (await db.user.findMany({ where: { login: { startsWith: tag } }, select: { id: true } })).map((u) => u.id);
  await db.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await db.user.deleteMany({ where: { login: { startsWith: tag } } });
  await db.base.deleteMany({ where: { code: { startsWith: tag } } });
  await db.regional.deleteMany({ where: { code: `${tag}R` } });
  await db.$disconnect();
});

describe("minhas bases do supervisor e do RM", () => {
  it("a base salva por um supervisor some para os outros supervisores e ele não consegue pegá-la", async () => {
    await escolherMinhasBases(sup1, [baseA]);
    const ocupadas = await basesDeOutrosSupervisores((sup2 as { id: string }).id);
    expect(ocupadas.has(baseA)).toBe(true);
    expect(ocupadas.has(baseB)).toBe(false);
    await expect(escolherMinhasBases(sup2, [baseA, baseB])).rejects.toThrow(/outro supervisor/);
    await escolherMinhasBases(sup2, [baseB]); // a outra está livre
  });

  it("quem salvou continua vendo as próprias bases e pode trocá-las", async () => {
    expect((await basesDeOutrosSupervisores((sup1 as { id: string }).id)).has(baseA)).toBe(false);
    await escolherMinhasBases(sup1, [baseA]); // salvar de novo a mesma
  });

  it("o RM vê todas e pega até as de supervisor, sem tirar de ninguém", async () => {
    expect((await basesDeOutrosSupervisores((rm as { id: string }).id)).size).toBeGreaterThan(0); // (a tela do RM ignora isso)
    await escolherMinhasBases(rm, [baseA, baseB]);
    expect((await basesDeOutrosSupervisores((sup2 as { id: string }).id)).has(baseA)).toBe(true); // continua só do sup1
    const quem = await db.userBase.count({ where: { baseId: baseA } });
    expect(quem).toBe(2); // sup1 + RM
  });

  it("RM não é contado como supervisor: a base dele não fica ocupada para supervisor", async () => {
    await db.userBase.deleteMany({ where: { baseId: baseA, userId: (sup1 as { id: string }).id } });
    expect((await basesDeOutrosSupervisores((sup2 as { id: string }).id)).has(baseA)).toBe(false);
  });

  it("liberar: salvar sem nenhuma base solta as do supervisor para os outros (E23)", async () => {
    await escolherMinhasBases(sup1, [baseA]);
    expect((await basesDeOutrosSupervisores((sup2 as { id: string }).id)).has(baseA)).toBe(true);
    await escolherMinhasBases(sup1, []);
    expect((await basesDeOutrosSupervisores((sup2 as { id: string }).id)).has(baseA)).toBe(false);
    expect(await db.userBase.count({ where: { userId: (sup1 as { id: string }).id } })).toBe(0);
    await escolherMinhasBases(sup2, [baseA, baseB]); // agora o outro pode pegar
  });

  it("supervisoresComBases lista só supervisores (não o RM), com as bases de cada um", async () => {
    const id = (a: unknown) => (a as { id: string }).id;
    const meus = [id(sup1), id(sup2), id(rm)];
    const lista = (await supervisoresComBases()).filter((s) => meus.includes(s.id));
    expect(lista.map((s) => s.id).sort()).toEqual([id(sup1), id(sup2)].sort()); // o RM não entra
    expect(lista.find((s) => s.id === id(sup1))?.bases).toEqual([]);
    expect(lista.find((s) => s.id === id(sup2))?.bases.map((b) => b.id).sort()).toEqual([baseA, baseB].sort());
  });
});
