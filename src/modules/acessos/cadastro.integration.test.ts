/** Criar conta da franquia (E20): perfil fixo "franquia", só franquia ativa da regional escolhida, limite por IP. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { criarContaFranquia, opcoesCadastro } from "./cadastro.service";

const tag = `cd${Date.now().toString(36)}`;
let r1: string;
let r2: string;
let fr1: string;
let fr2: string;
let baseComum: string;
let franquiaInativa: string;

const dados = (over: Record<string, string> = {}) => ({
  name: "Maria da Silva",
  regionalId: r1,
  baseId: fr1,
  login: `${tag}maria`,
  password: "senha1234",
  confirm: "senha1234",
  ...over,
});

beforeAll(async () => {
  await db.accessProfile.upsert({ where: { key: "franquia" }, update: {}, create: { key: "franquia", name: "Franquia", scope: "BASE", permissions: ["solicitacoes.criar"], system: true } });
  r1 = (await db.regional.create({ data: { code: `${tag}A`, name: `Regional A ${tag}` } })).id;
  r2 = (await db.regional.create({ data: { code: `${tag}B`, name: `Regional B ${tag}` } })).id;
  fr1 = (await db.base.create({ data: { code: `${tag}-F1`, name: "Franquia 1", type: "FRANQUIA", regionalId: r1 } })).id;
  fr2 = (await db.base.create({ data: { code: `${tag}-F2`, name: "Franquia 2", type: "FRANQUIA", regionalId: r2 } })).id;
  baseComum = (await db.base.create({ data: { code: `${tag}-B1`, name: "Base", type: "BASE", regionalId: r1 } })).id;
  franquiaInativa = (await db.base.create({ data: { code: `${tag}-F3`, name: "Franquia inativa", type: "FRANQUIA", regionalId: r1, active: false } })).id;
});

afterAll(async () => {
  const ids = (await db.user.findMany({ where: { login: { startsWith: tag } }, select: { id: true } })).map((u) => u.id);
  await db.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await db.user.deleteMany({ where: { login: { startsWith: tag } } });
  await db.loginAttempt.deleteMany({ where: { login: "#cadastro", ip: { startsWith: tag } } });
  await db.base.deleteMany({ where: { code: { startsWith: tag } } });
  await db.regional.deleteMany({ where: { code: { startsWith: tag } } });
  await db.$disconnect();
});

describe("criar conta da franquia", () => {
  it("lista só regionais com franquia e só franquias ativas", async () => {
    const o = await opcoesCadastro();
    expect(o.regionais.map((r) => r.id)).toEqual(expect.arrayContaining([r1, r2]));
    const ids = o.franquias.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining([fr1, fr2]));
    expect(ids).not.toContain(baseComum);
    expect(ids).not.toContain(franquiaInativa);
  });

  it("cria o usuário com o tipo de acesso franquia, ligado à franquia, com senha, e audita", async () => {
    const u = await criarContaFranquia(dados(), `${tag}ip1`);
    const row = await db.user.findUniqueOrThrow({ where: { id: u.id }, include: { profile: true, bases: true } });
    expect(row.profile.key).toBe("franquia");
    expect(row.active).toBe(true);
    expect(row.mustChangePassword).toBe(false);
    expect(row.bases.map((b) => b.baseId)).toEqual([fr1]);
    expect(await verifyPassword("senha1234", row.passwordHash!)).toBe(true);
    const log = await db.auditLog.findFirstOrThrow({ where: { entityId: u.id, action: "usuario.cadastro" } });
    expect(log.actorId).toBeNull();
  });

  it("recusa franquia de outra regional, base comum e franquia inativa", async () => {
    await expect(criarContaFranquia(dados({ login: `${tag}x1`, baseId: fr2 }), `${tag}ip2`)).rejects.toThrow("Franquia não encontrada nessa regional.");
    await expect(criarContaFranquia(dados({ login: `${tag}x2`, baseId: baseComum }), `${tag}ip2`)).rejects.toThrow("Franquia não encontrada");
    await expect(criarContaFranquia(dados({ login: `${tag}x3`, baseId: franquiaInativa }), `${tag}ip2`)).rejects.toThrow("Franquia não encontrada");
    expect(await db.user.count({ where: { login: { in: [`${tag}x1`, `${tag}x2`, `${tag}x3`] } } })).toBe(0);
  });

  it("login repetido não cria outra conta", async () => {
    await expect(criarContaFranquia(dados(), `${tag}ip3`)).rejects.toThrow();
    expect(await db.user.count({ where: { login: `${tag}maria` } })).toBe(1);
  });

  it("limita por IP: a 11ª tentativa na hora é barrada", async () => {
    const ip = `${tag}ip4`;
    for (let i = 0; i < 10; i++) await criarContaFranquia(dados({ login: `${tag}l${i}`, baseId: fr1 }), ip);
    await expect(criarContaFranquia(dados({ login: `${tag}l99` }), ip)).rejects.toThrow("Muitas tentativas");
    // outro IP não é afetado
    await criarContaFranquia(dados({ login: `${tag}outro` }), `${tag}ip5`);
  });
});
