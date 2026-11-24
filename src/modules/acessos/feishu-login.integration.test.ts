/**
 * Login pelo Feishu contra um PostgreSQL real (E11), com os dois casos da revisão do #26:
 * A. regionais com a mesma sigla (Minas Gerais e Mato Grosso = "MG") não se misturam;
 * B. e-mail/matrícula não ligam o Feishu a conta da equipe, e só o e-mail corporativo liga.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { FeishuDept, FeishuProfile } from "@/lib/feishu/client";
import { resolveFeishuLogin } from "./feishu-login";
import { aprovarAcesso } from "./service";

// Sufixo de 2 letras minúsculas: deixa os nomes únicos por execução sem mudar a sigla ("Minas Gerais xy" → "MG").
const t = Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 2).padEnd(2, "q");
const tag = `fl${Date.now().toString(36)}`;
const dept = (id: string, name: string): FeishuDept => ({ id: `od-${tag}-${id}`, name });
const MN = dept("mn", "Subsidiária MN");
const chainMG = (base: string) => [dept(`b-${base}`, `${base} ${t}`), dept("gr-mg", "Gestão Regional"), dept("mg", `Subsidiária Minas Gerais ${t}`), MN];
const chainMT = (base: string) => [dept(`b-${base}`, `${base} ${t}`), dept("gr-mt", "Gestão Regional"), dept("mt", `Subsidiária Mato Grosso ${t}`), MN];
const perfil = (id: string, over: Partial<FeishuProfile> = {}): FeishuProfile => ({ openId: `ou_${tag}${id}`, name: `Pessoa ${id}`, ...over });
const login = (p: FeishuProfile, chains: FeishuDept[][] = []) => resolveFeishuLogin(p, { getChains: async () => chains });

let staffProfileId: string;

beforeAll(async () => {
  for (const [key, name] of [
    ["aguardando", "Aguardando liberação"],
    ["base", "Base"],
    ["franquia", "Franquia"],
  ] as const) {
    await db.accessProfile.upsert({ where: { key }, update: {}, create: { key, name, scope: "BASE", permissions: [] } });
  }
  staffProfileId = (await db.accessProfile.create({ data: { key: `${tag}-adm`, name: "Admin teste", scope: "GLOBAL", permissions: ["*"] } })).id;
});

afterAll(async () => {
  await db.user.deleteMany({ where: { OR: [{ feishuOpenId: { startsWith: `ou_${tag}` } }, { login: { startsWith: tag } }] } });
  await db.accessProfile.deleteMany({ where: { key: { startsWith: tag } } });
  await db.base.deleteMany({ where: { feishuDepartmentId: { startsWith: `od-${tag}` } } });
  await db.regional.deleteMany({ where: { feishuDepartmentId: { startsWith: `od-${tag}` } } });
  await db.$disconnect();
});

describe("A. sigla repetida", () => {
  it("Minas Gerais e Mato Grosso (as duas 'MG') ficam em regionais diferentes", async () => {
    const sab = await login(perfil("sab"), [chainMG("SAB")]);
    const cui = await login(perfil("cui"), [chainMT("CUI")]);
    expect(sab.kind).toBe("ok");
    expect(cui.kind).toBe("ok");
    const base = (code: string) => db.base.findFirstOrThrow({ where: { feishuDepartmentId: `od-${tag}-b-${code}` }, include: { regional: true } });
    const bSab = await base("SAB");
    const bCui = await base("CUI");
    expect(bSab.regional.name).toBe(`Minas Gerais ${t}`);
    expect(bCui.regional.name).toBe(`Mato Grosso ${t}`);
    expect(bSab.regionalId).not.toBe(bCui.regionalId);
    expect(bSab.regional.code).not.toBe(bCui.regional.code);
    expect([bSab.regional.code, bCui.regional.code].every((c) => /^MG(-\d+)?$/.test(c))).toBe(true);
  });

  it("segunda pessoa da mesma unidade reaproveita base e regional", async () => {
    const r = await login(perfil("sab2"), [chainMG("SAB")]);
    expect(r).toMatchObject({ kind: "ok", created: true });
    expect(await db.base.count({ where: { feishuDepartmentId: `od-${tag}-b-SAB` } })).toBe(1);
    expect(await db.regional.count({ where: { feishuDepartmentId: `od-${tag}-mg` } })).toBe(1);
  });

  it("base cadastrada à mão com a mesma sigla, mas já ligada a outro departamento, não é reaproveitada", async () => {
    const reg = await db.regional.findFirstOrThrow({ where: { feishuDepartmentId: `od-${tag}-mg` } });
    await db.base.create({ data: { code: `BHZ-${t.toUpperCase()}`, name: "Outra BHZ", regionalId: reg.id, feishuDepartmentId: `od-${tag}-outro` } });
    await login(perfil("bhz"), [chainMG("BHZ")]);
    const nova = await db.base.findFirstOrThrow({ where: { feishuDepartmentId: `od-${tag}-b-BHZ` } });
    expect(nova.code).toBe(`BHZ-${t.toUpperCase()}-2`);
  });
});

describe("B. vínculo seguro", () => {
  it("e-mail corporativo de um admin não entra na conta do admin", async () => {
    const adm = await db.user.create({ data: { name: "Admin", login: `${tag}adm`, email: `${tag}adm@jt.test`, profileId: staffProfileId } });
    const r = await login(perfil("x1", { email: `${tag}adm@jt.test`, enterpriseEmail: `${tag}adm@jt.test` }));
    expect(r).toEqual({ kind: "staff" });
    expect((await db.user.findUniqueOrThrow({ where: { id: adm.id } })).feishuOpenId).toBeNull();
  });

  it("matrícula de um admin também não liga", async () => {
    await db.user.create({ data: { name: "Admin 2", login: `${tag}adm2`, registration: `${tag}-777`, profileId: staffProfileId } });
    expect(await login(perfil("x2", { employeeNo: `${tag}-777` }))).toEqual({ kind: "staff" });
  });

  it("admin já ligado pelo open_id entra normalmente", async () => {
    const adm = await db.user.create({ data: { name: "Admin 3", login: `${tag}adm3`, feishuOpenId: `ou_${tag}x3`, profileId: staffProfileId } });
    expect(await login(perfil("x3"))).toMatchObject({ kind: "ok", userId: adm.id, created: false });
  });

  it("e-mail pessoal não liga nem a conta de base: cria outra", async () => {
    const baseProfile = await db.accessProfile.findUniqueOrThrow({ where: { key: "base" } });
    const u = await db.user.create({ data: { name: "Base", login: `${tag}base`, email: `${tag}base@jt.test`, profileId: baseProfile.id } });
    const r = await login(perfil("x4", { email: `${tag}base@jt.test` }));
    expect(r).toMatchObject({ kind: "ok", created: true });
    expect(r.kind === "ok" && r.userId).not.toBe(u.id);
  });

  it("e-mail corporativo liga conta de base e cancela a senha provisória (registrado na auditoria)", async () => {
    const baseProfile = await db.accessProfile.findUniqueOrThrow({ where: { key: "base" } });
    const u = await db.user.create({
      data: { name: "Base 2", login: `${tag}segunda`, email: `${tag}base2@jt.test`, profileId: baseProfile.id, passwordHash: "x", mustChangePassword: true },
    });
    const r = await login(perfil("x5", { email: `${tag}base2@jt.test`, enterpriseEmail: `${tag}base2@jt.test` }));
    expect(r).toMatchObject({ kind: "ok", userId: u.id, created: false });
    const depois = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(depois).toMatchObject({ feishuOpenId: `ou_${tag}x5`, mustChangePassword: false, passwordHash: null });
    const log = await db.auditLog.findFirst({ where: { entityId: u.id, action: "usuario.feishu.vincular" } });
    expect(log?.summary).toContain("senha provisória cancelada");
  });

  it("matrícula já usada por outra conta não é copiada", async () => {
    const baseProfile = await db.accessProfile.findUniqueOrThrow({ where: { key: "base" } });
    await db.user.create({ data: { name: "Dono", login: `${tag}dono`, registration: `${tag}-555`, profileId: baseProfile.id, feishuOpenId: `ou_${tag}dono` } });
    const u = await db.user.create({ data: { name: "Base 3", login: `${tag}terceira`, profileId: baseProfile.id, feishuOpenId: `ou_${tag}x6` } });
    const r = await login(perfil("x6", { employeeNo: `${tag}-555` }));
    expect(r).toMatchObject({ kind: "ok", userId: u.id });
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).registration).toBeNull();
  });

  it("dois primeiros logins ao mesmo tempo dão no mesmo usuário", async () => {
    const p = perfil("dup");
    const [a, b] = await Promise.all([login(p, [chainMG("DUP")]), login(p, [chainMG("DUP")])]);
    expect(a.kind === "ok" && b.kind === "ok" && a.userId === b.userId).toBe(true);
    expect(await db.user.count({ where: { feishuOpenId: p.openId } })).toBe(1);
  });

describe("um por base: o primeiro entra direto, o resto aguarda", () => {
  it("primeiro da base entra direto como Base, sem aviso aos admins", async () => {
    const r = await login(perfil("apr0"), [chainMG("APR")]);
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r).toMatchObject({ created: true, pending: false });
    const u = await db.user.findUniqueOrThrow({ where: { id: r.userId }, include: { profile: true } });
    expect(u.profile.key).toBe("base");
  });

  it("segundo da mesma base entra aguardando; o admin aprova e ele vira Base, com aviso no sino", async () => {
    const r = await login(perfil("apr"), [chainMG("APR")]);
    if (r.kind !== "ok") throw new Error(r.kind);
    expect(r).toMatchObject({ created: true, pending: true });
    const antes = await db.user.findUniqueOrThrow({ where: { id: r.userId }, include: { profile: true, bases: { include: { base: true } } } });
    expect(antes.profile.key).toBe("aguardando");
    expect(antes.bases.map((b) => b.base.feishuDepartmentId)).toEqual([`od-${tag}-b-APR`]);

    const profile = await db.accessProfile.findUniqueOrThrow({ where: { key: `${tag}-adm` } });
    const adm = await db.user.create({ data: { name: "Aprovador", login: `${tag}aprovador`, profileId: profile.id } });
    const actor = { id: adm.id, name: "Aprovador", login: adm.login, email: null, mustChangePassword: false, profile: { id: profile.id, key: profile.key, name: "Admin teste" }, permissions: ["*"], scope: "GLOBAL", bases: [], baseIds: [], regionalIds: [] } as never;
    const x = await aprovarAcesso(actor, r.userId);
    expect(x.perfil).toBe("Base");
    const depois = await db.user.findUniqueOrThrow({ where: { id: r.userId }, include: { profile: true, bases: true } });
    expect(depois.profile.key).toBe("base");
    expect(depois.bases).toHaveLength(1);
    expect(await db.notification.count({ where: { userId: r.userId, title: "Seu acesso foi liberado" } })).toBe(1);
    await expect(aprovarAcesso(actor, r.userId)).rejects.toThrow("não está aguardando");
    await db.auditLog.deleteMany({ where: { actorId: adm.id } });
  });

  it("franquia: o primeiro e o aprovado entram como Base, sem ver preços", async () => {
    const a = await login(perfil("fr1"), [chainMG("F ORL")]);
    const b = await login(perfil("fr2"), [chainMG("F ORL")]);
    if (a.kind !== "ok" || b.kind !== "ok") throw new Error("login");
    expect((await db.user.findUniqueOrThrow({ where: { id: a.userId }, include: { profile: true } })).profile.key).toBe("base");
    expect(b.pending).toBe(true);
    const profile = await db.accessProfile.findUniqueOrThrow({ where: { key: `${tag}-adm` } });
    const adm = await db.user.findFirstOrThrow({ where: { login: `${tag}aprovador` } });
    const actor = { id: adm.id, name: "Aprovador", login: adm.login, email: null, mustChangePassword: false, profile: { id: profile.id, key: profile.key, name: "Admin teste" }, permissions: ["*"], scope: "GLOBAL", bases: [], baseIds: [], regionalIds: [] } as never;
    await aprovarAcesso(actor, b.userId);
    expect((await db.user.findUniqueOrThrow({ where: { id: b.userId }, include: { profile: true } })).profile.key).toBe("base");
  });

  it("sem base (fora de unidade) não aprova direto: o admin escolhe no cadastro", async () => {
    const r = await login(perfil("gi"), [[dept("gi", "Gestão Integrada"), MN]]);
    if (r.kind !== "ok") throw new Error(r.kind);
    const profile = await db.accessProfile.findUniqueOrThrow({ where: { key: `${tag}-adm` } });
    const adm = await db.user.findFirstOrThrow({ where: { login: `${tag}aprovador` } });
    const actor = { id: adm.id, name: "Aprovador", login: adm.login, email: null, mustChangePassword: false, profile: { id: profile.id, key: profile.key, name: "Admin teste" }, permissions: ["*"], scope: "GLOBAL", bases: [], baseIds: [], regionalIds: [] } as never;
    await expect(aprovarAcesso(actor, r.userId)).rejects.toThrow("Sem base vinculada");
  });
});
});
