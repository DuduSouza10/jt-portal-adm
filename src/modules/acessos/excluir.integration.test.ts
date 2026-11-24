/** Desativar e excluir usuário (E12) contra um PostgreSQL real. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { deleteUser, setUserActive } from "./service";

const tag = `ex${Date.now().toString(36)}`;
let actor: never;
let profileId: string;
let baseId: string;

const novo = async (sufixo: string) =>
  db.user.create({ data: { name: `Pessoa ${sufixo}`, login: `${tag}${sufixo}`, profileId, bases: { create: [{ baseId }] } } });

beforeAll(async () => {
  const r = await db.regional.create({ data: { code: `${tag}R`, name: `R ${tag}` } });
  baseId = (await db.base.create({ data: { code: `${tag}-B`, name: `B ${tag}`, regionalId: r.id } })).id;
  profileId = (await db.accessProfile.create({ data: { key: `${tag}-b`, name: "Base teste", scope: "BASE", permissions: [] } })).id;
  const adm = await db.accessProfile.create({ data: { key: `${tag}-adm`, name: "Admin teste", scope: "GLOBAL", permissions: ["*"] } });
  const u = await db.user.create({ data: { name: "Admin", login: `${tag}adm`, profileId: adm.id } });
  actor = { id: u.id, name: "Admin", login: u.login, email: null, mustChangePassword: false, profile: { id: adm.id, key: adm.key, name: adm.name }, permissions: ["*"], scope: "GLOBAL", bases: [], baseIds: [], regionalIds: [] } as never;
});

afterAll(async () => {
  await db.solicitacao.deleteMany({ where: { base: { code: `${tag}-B` } } });
  await db.auditLog.deleteMany({ where: { entityId: { in: (await db.user.findMany({ where: { login: { startsWith: tag } }, select: { id: true } })).map((u) => u.id) } } });
  await db.user.deleteMany({ where: { login: { startsWith: tag } } });
  await db.accessProfile.deleteMany({ where: { key: { startsWith: tag } } });
  await db.base.deleteMany({ where: { code: `${tag}-B` } });
  await db.regional.deleteMany({ where: { code: `${tag}R` } });
  await db.$disconnect();
});

describe("desativar e excluir", () => {
  it("desativar encerra as sessões; reativar volta", async () => {
    const u = await novo("d");
    await db.session.create({ data: { id: `${tag}tok`, userId: u.id, expiresAt: new Date(Date.now() + 3600e3) } });
    await setUserActive(actor, u.id, false);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).active).toBe(false);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
    await setUserActive(actor, u.id, true);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).active).toBe(true);
  });

  it("sem histórico: exclui de vez", async () => {
    const u = await novo("x");
    await deleteUser(actor, u.id);
    expect(await db.user.findUnique({ where: { id: u.id } })).toBeNull();
  });

  it("com pedido no histórico: não exclui, pede para desativar", async () => {
    const u = await novo("p");
    await db.solicitacao.create({ data: { baseId, createdById: u.id } });
    await expect(deleteUser(actor, u.id)).rejects.toThrow("Desative em vez de excluir");
    expect(await db.user.findUnique({ where: { id: u.id } })).not.toBeNull();
  });

  it("com alteração de preço no histórico: não exclui, pede para desativar (a chave estrangeira do PrecoHistorico bloquearia)", async () => {
    const u = await novo("h");
    const prod = await db.produto.create({ data: { code: `${tag}-P`, name: `Produto ${tag}`, unit: "UN" } });
    await db.precoHistorico.create({ data: { produtoId: prod.id, valorNovo: 10, actorId: u.id } });
    const err = await deleteUser(actor, u.id).then(() => null, (e) => e as Error);
    expect(err).toBeInstanceOf(DomainError); // não um erro cru de chave estrangeira do Prisma
    expect(await db.user.findUnique({ where: { id: u.id } })).not.toBeNull();
    await db.produto.delete({ where: { id: prod.id } }); // o histórico sai junto (cascade)
  });

  it("não exclui nem desativa a si mesmo", async () => {
    const me = (actor as { id: string }).id;
    await expect(deleteUser(actor, me)).rejects.toThrow("próprio usuário");
    await expect(setUserActive(actor, me, false)).rejects.toThrow("próprio usuário");
  });
});
