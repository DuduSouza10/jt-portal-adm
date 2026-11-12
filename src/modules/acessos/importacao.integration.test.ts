/**
 * Importação de usuários contra o banco (npm run test:integration).
 * Cria os próprios dados com códigos únicos e apaga no fim; não depende do seed.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { normalizeRows, parseCsv, type ImportRow } from "./importacao";
import { aplicarLote, APPLY_BATCH, validarLote } from "./importacao.service";

const tag = `I${Date.now().toString(36).toUpperCase()}`;
const t = tag.toLowerCase();
let actorGlobal: CurrentUser;
let actorRegional: CurrentUser;
let pBase: { id: string; key: string };
let pAdmin: { id: string; key: string };

const actor = (over: Partial<CurrentUser>): CurrentUser => ({
  id: "",
  name: "Importador",
  login: "importador",
  email: null,
  mustChangePassword: false,
  profile: { id: "", key: "x", name: "x" },
  permissions: ["*"],
  scope: "GLOBAL",
  bases: [],
  baseIds: [],
  regionalIds: [],
  ...over,
});

/** CSV → linhas, como a tela faz no navegador. */
const rows = (csv: string): ImportRow[] => {
  const r = normalizeRows(parseCsv(csv));
  expect(r.errors).toEqual([]);
  return r.rows;
};

beforeAll(async () => {
  const mg = await db.regional.create({ data: { code: `${tag}MG`, name: "MG" } });
  const sp = await db.regional.create({ data: { code: `${tag}SP`, name: "SP" } });
  await db.base.createMany({
    data: [
      { code: `${tag}-BH`, name: "BH", regionalId: mg.id },
      { code: `${tag}-CTG`, name: "Contagem", regionalId: mg.id },
      { code: `${tag}-GRU`, name: "Guarulhos", regionalId: sp.id },
    ],
  });
  pBase = await db.accessProfile.create({ data: { key: `${t}-base`, name: `Base ${tag}`, scope: "BASE", permissions: ["solicitacoes.criar"] } });
  pAdmin = await db.accessProfile.create({ data: { key: `${t}-admin`, name: `Admin ${tag}`, scope: "GLOBAL", permissions: ["usuarios.editar"] } });
  const pReg = await db.accessProfile.create({
    data: { key: `${t}-adminreg`, name: `Admin regional ${tag}`, scope: "REGIONAL", permissions: ["usuarios.editar", "solicitacoes.criar"] },
  });
  const u1 = await db.user.create({ data: { name: "Importador", login: `${t}.global`, profileId: pAdmin.id } });
  const u2 = await db.user.create({ data: { name: "Importador MG", login: `${t}.mg`, profileId: pReg.id, regionals: { create: { regionalId: mg.id } } } });
  actorGlobal = actor({ id: u1.id, login: u1.login });
  actorRegional = actor({ id: u2.id, login: u2.login, scope: "REGIONAL", regionalIds: [mg.id], permissions: pReg.permissions });
});

afterAll(async () => {
  const users = await db.user.findMany({ where: { login: { startsWith: t } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.accessProfile.deleteMany({ where: { key: { startsWith: t } } });
  await db.base.deleteMany({ where: { code: { startsWith: tag } } });
  await db.regional.deleteMany({ where: { code: { startsWith: tag } } });
  await db.$disconnect();
});

describe("importação de usuários", () => {
  it("prévia: novos, base inexistente e tipo de acesso inexistente", async () => {
    const r = await validarLote(
      actorGlobal,
      rows(
        `nome;login;tipo_de_acesso;bases\n` +
          `Ana Teste;${t}.ana;${t}-base;${tag}-BH\n` +
          `Bia Teste;${t}.bia;${t}-base;${tag}-XYZ\n` +
          `Caio Teste;${t}.caio;nao-existe;${tag}-BH\n` +
          `Duda Teste;${t}.duda;${t}-base;`,
      ),
      null,
    );
    expect(r.map((x) => x.action)).toEqual(["criar", "erro", "erro", "erro"]);
    expect(r[1].message).toMatch(/inexistente/);
    expect(r[2].message).toMatch(/não existe/);
    expect(r[3].message).toMatch(/exige ao menos uma base/);
    expect(await db.user.count({ where: { login: { in: [`${t}.ana`] } } })).toBe(0); // prévia não grava
  });

  it("grava, gera senha temporária, e importar de novo não muda nada", async () => {
    const csv = `nome;matricula;login;email;tipo_de_acesso;bases\nAna Teste;${tag}01;${t}.ana;${t}.ana@x.com;${t}-base;${tag}-BH,${tag}-CTG`;
    const [r] = await aplicarLote(actorGlobal, rows(csv), null);
    expect(r.action).toBe("criar");
    const u = await db.user.findUniqueOrThrow({ where: { login: `${t}.ana` }, include: { bases: true } });
    expect(u).toMatchObject({ registration: `${tag}01`, email: `${t}.ana@x.com`, mustChangePassword: true, profileId: pBase.id });
    expect(u.bases).toHaveLength(2);
    expect(await verifyPassword(r.tempPassword!, u.passwordHash!)).toBe(true);
    expect(await db.auditLog.count({ where: { entityId: u.id, action: "usuario.importar" } })).toBe(1);

    const [again] = await aplicarLote(actorGlobal, rows(csv), null);
    expect(again.action).toBe("igual");
  });

  it("atualiza pela matrícula (login não muda, desligado perde as sessões)", async () => {
    const u = await db.user.findUniqueOrThrow({ where: { login: `${t}.ana` } });
    await db.session.create({ data: { id: `${t}-sess`, userId: u.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    const csv = `nome;matricula;login;tipo_de_acesso;bases;ativo\nAna Atualizada;${tag}01;${t}.outro;${t}-base;${tag}-BH;não`;
    const [r] = await aplicarLote(actorGlobal, rows(csv), null);
    expect(r).toMatchObject({ action: "atualizar", login: `${t}.ana` });
    const after = await db.user.findUniqueOrThrow({ where: { id: u.id }, include: { bases: true } });
    expect(after).toMatchObject({ name: "Ana Atualizada", login: `${t}.ana`, active: false, email: `${t}.ana@x.com` });
    expect(after.bases).toHaveLength(1);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
  });

  it("conflitos: login de outra pessoa, e-mail de outra pessoa, o próprio usuário", async () => {
    const r = await validarLote(
      actorGlobal,
      rows(
        `nome;matricula;login;email;tipo_de_acesso;bases\n` +
          `Outra Pessoa;${tag}99;${t}.ana;;${t}-base;${tag}-BH\n` +
          `Edu Teste;${tag}02;${t}.edu;${t}.ana@x.com;${t}-base;${tag}-BH\n` +
          `Eu Mesmo;;${t}.global;;${t}-admin;`,
      ),
      null,
    );
    expect(r.map((x) => x.action)).toEqual(["erro", "erro", "erro"]);
    expect(r[0].message).toMatch(/outra matrícula/);
    expect(r[1].message).toMatch(/e-mail .* já é de outra pessoa/);
    expect(r[2].message).toMatch(/próprio usuário/);
  });

  it("admin regional: só concede o que tem e só dentro da sua regional", async () => {
    const r = await validarLote(
      actorRegional,
      rows(
        `nome;login;tipo_de_acesso;bases\n` +
          `Fê Teste;${t}.fe;${t}-base;${tag}-CTG\n` +
          `Gil Teste;${t}.gil;${t}-base;${tag}-GRU\n` +
          `Hugo Teste;${t}.hugo;${t}-admin;`,
      ),
      null,
    );
    expect(r.map((x) => x.action)).toEqual(["criar", "erro", "erro"]);
    expect(r[1].message).toMatch(/alcance/);
    expect(r[2].message).toMatch(/alcance maior/);
  });

  it("tipo de acesso padrão quando a planilha não tem a coluna", async () => {
    const r = await validarLote(actorGlobal, rows(`nome;login;bases\nIvo Teste;${t}.ivo;${tag}-BH`), pBase.id);
    expect(r[0].action).toBe("criar");
  });

  it(`um lote de ${APPLY_BATCH} usuários grava em menos de 8 s (limite padrão de uma requisição no Netlify: 10 s)`, async () => {
    const csv = ["nome;matricula;tipo_de_acesso;bases", ...Array.from({ length: APPLY_BATCH }, (_, i) => `Pessoa ${i};${t}l${i};${t}-base;${tag}-BH`)].join("\n");
    const started = Date.now();
    const r = await aplicarLote(actorGlobal, rows(csv).map((x) => ({ ...x, login: `${t}.l${x.registration!.slice(t.length + 1)}` })), null);
    const ms = Date.now() - started;
    console.log(`lote de ${APPLY_BATCH}: ${ms} ms`);
    expect(r.filter((x) => x.action === "criar")).toHaveLength(APPLY_BATCH);
    expect(ms).toBeLessThan(8_000);
  });
});
