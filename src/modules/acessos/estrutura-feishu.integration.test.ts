/**
 * Importação das regionais e bases do organograma do Feishu (E11) contra um PostgreSQL real:
 * a prévia não grava nada, a importação grava, a segunda rodada não duplica, e uma base cadastrada à mão
 * com o mesmo nome é ligada (não duplicada).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/session";
import { estruturaDoOrganograma } from "./feishu-rules";
import { importarEstruturaFeishu } from "./estrutura-feishu.service";

// Sufixo de 2 letras minúsculas: nomes únicos por execução sem mudar a sigla da regional.
const t = Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 2).padEnd(2, "q");
const tag = `ef${Date.now().toString(36)}`;
const id = (x: string) => `od-${tag}-${x}`;
const dep = (x: string, name: string, parent?: string) => ({ id: id(x), name, parentId: parent ? id(parent) : undefined });
const org = [
  dep("mn", "Subsidiária MN"),
  dep("spn", `Subsidiária São Paulo Norte ${t}`, "mn"),
  dep("gr1", "Gestão Regional", "spn"),
  dep("sjp", `SJP ${t}`, "gr1"),
  dep("bau", `BAU ${t}`, "gr1"),
  dep("mg", `Subsidiária Minas Gerais ${t}`, "mn"),
  dep("gr2", "Gestão Regional", "mg"),
  dep("dc", `DC MNH ${t}`, "gr2"),
  dep("cd", `CD CTG ${t}`, "dc"),
];
let actor: CurrentUser;

beforeAll(async () => {
  const profile = await db.accessProfile.create({ data: { key: `${tag}-adm`, name: "Admin teste", scope: "GLOBAL", permissions: ["*"] } });
  const u = await db.user.create({ data: { name: "Admin", login: `${tag}adm`, profileId: profile.id } });
  actor = { id: u.id, name: "Admin", login: u.login, email: null, mustChangePassword: false, profile: { id: profile.id, key: profile.key, name: "Admin" }, permissions: ["*"], scope: "GLOBAL", bases: [], baseIds: [], regionalIds: [] } as CurrentUser;
});

afterAll(async () => {
  await db.auditLog.deleteMany({ where: { actorId: actor.id } });
  await db.base.deleteMany({ where: { OR: [{ feishuDepartmentId: { startsWith: `od-${tag}` } }, { name: `BAU ${t}` }] } });
  await db.regional.deleteMany({ where: { feishuDepartmentId: { startsWith: `od-${tag}` } } });
  await db.user.deleteMany({ where: { id: actor.id } });
  await db.accessProfile.deleteMany({ where: { key: { startsWith: tag } } });
  await db.$disconnect();
});

describe("importação da estrutura do Feishu", () => {
  it("prévia mostra o que aconteceria e não grava nada", async () => {
    const r = await importarEstruturaFeishu(actor, estruturaDoOrganograma(org), false);
    expect(r.basesCriadas).toBe(3);
    expect(r.regionaisCriadas).toBe(2);
    expect(r.linhas.map((l) => l.base.name).sort()).toEqual([`BAU ${t}`, `CD CTG ${t}`, `SJP ${t}`]);
    expect(await db.base.count({ where: { feishuDepartmentId: { startsWith: `od-${tag}` } } })).toBe(0);
    expect(await db.regional.count({ where: { feishuDepartmentId: { startsWith: `od-${tag}` } } })).toBe(0);
  });

  it("importa: cria o que falta e liga a base cadastrada à mão com o mesmo nome", async () => {
    // Uma base BAU já cadastrada à mão (sem Feishu), numa regional qualquer.
    const reg = await db.regional.create({ data: { code: `${tag.toUpperCase()}`.slice(0, 20), name: "Manual", feishuDepartmentId: id("manual") } });
    const manual = await db.base.create({ data: { code: `MAN-${tag}`.toUpperCase().slice(0, 20), name: `BAU ${t}`, regionalId: reg.id } });

    const r = await importarEstruturaFeishu(actor, estruturaDoOrganograma(org), true);
    expect(r.basesCriadas).toBe(2);
    expect(r.basesLigadas).toBe(1);
    expect((await db.base.findUniqueOrThrow({ where: { id: manual.id } })).feishuDepartmentId).toBe(id("bau"));

    const cd = await db.base.findUniqueOrThrow({ where: { feishuDepartmentId: id("cd") }, include: { regional: true } });
    expect(cd.regional.name).toBe(`Minas Gerais ${t}`);
    expect(cd.autoCreated).toBe(false);
    expect(await db.base.count({ where: { feishuDepartmentId: id("dc") } })).toBe(0);

    const log = await db.auditLog.findFirst({ where: { actorId: actor.id, action: "estrutura.importar-feishu" } });
    expect(log?.summary).toContain("2 base(s) criadas, 1 ligada(s)");
  });

  it("segunda rodada não duplica nada", async () => {
    const r = await importarEstruturaFeishu(actor, estruturaDoOrganograma(org), true);
    expect([r.basesCriadas, r.basesLigadas, r.basesExistentes, r.regionaisCriadas]).toEqual([0, 0, 3, 0]);
  });
});
