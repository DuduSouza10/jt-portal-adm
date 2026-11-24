/** Excluir base (E13) contra um PostgreSQL real. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { deleteBase } from "./service";

const tag = `xb${Date.now().toString(36)}`;
let actor: never;
let regionalId: string;

beforeAll(async () => {
  regionalId = (await db.regional.create({ data: { code: `${tag}R`, name: `R ${tag}` } })).id;
  const p = await db.accessProfile.create({ data: { key: `${tag}-adm`, name: "Admin teste", scope: "GLOBAL", permissions: ["*"] } });
  const u = await db.user.create({ data: { name: "Admin", login: `${tag}adm`, profileId: p.id } });
  actor = { id: u.id, permissions: ["*"], scope: "GLOBAL", baseIds: [], regionalIds: [] } as never;
});

afterAll(async () => {
  await db.solicitacao.deleteMany({ where: { base: { code: { startsWith: tag } } } });
  await db.auditLog.deleteMany({ where: { action: "base.excluir", summary: { contains: tag } } });
  await db.base.deleteMany({ where: { code: { startsWith: tag } } });
  await db.user.deleteMany({ where: { login: { startsWith: tag } } });
  await db.accessProfile.deleteMany({ where: { key: { startsWith: tag } } });
  await db.regional.deleteMany({ where: { id: regionalId } });
  await db.$disconnect();
});

describe("excluir base", () => {
  it("sem histórico: exclui e tira o vínculo dos usuários", async () => {
    const b = await db.base.create({ data: { code: `${tag}-A`, name: "A", regionalId } });
    const adm = (actor as { id: string }).id;
    await db.userBase.create({ data: { userId: adm, baseId: b.id } });
    await deleteBase(actor, b.id);
    expect(await db.base.findUnique({ where: { id: b.id } })).toBeNull();
    expect(await db.userBase.count({ where: { baseId: b.id } })).toBe(0);
  });

  it("com pedido: não exclui, pede para desativar", async () => {
    const b = await db.base.create({ data: { code: `${tag}-B`, name: "B", regionalId } });
    await db.solicitacao.create({ data: { baseId: b.id, createdById: (actor as { id: string }).id } });
    await expect(deleteBase(actor, b.id)).rejects.toThrow("Desative em vez de excluir");
  });
});
