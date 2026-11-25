/** Avisos de dúvida no navegador (E21): só dúvidas, só não lidas, só do próprio usuário, só as novas. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { novosAvisosDuvida } from "./service";

const tag = `av${Date.now().toString(36)}`;
let a: string;
let b: string;

beforeAll(async () => {
  const p = await db.accessProfile.upsert({ where: { key: "franquia" }, update: {}, create: { key: "franquia", name: "Franquia", scope: "BASE", permissions: [], system: true } });
  a = (await db.user.create({ data: { name: "A", login: `${tag}a`, profileId: p.id } })).id;
  b = (await db.user.create({ data: { name: "B", login: `${tag}b`, profileId: p.id } })).id;
});

afterAll(async () => {
  await db.notification.deleteMany({ where: { userId: { in: [a, b] } } });
  await db.user.deleteMany({ where: { login: { startsWith: tag } } });
  await db.$disconnect();
});

describe("novosAvisosDuvida", () => {
  it("primeira checagem (sem 'desde') só devolve a hora, sem itens", async () => {
    await db.notification.create({ data: { userId: a, title: "Dúvida de X", refType: "duvida" } });
    const r = await novosAvisosDuvida(a, null);
    expect(r.itens).toEqual([]);
    expect(r.agora).toBeInstanceOf(Date);
  });

  it("devolve só dúvidas novas, não lidas e do próprio usuário", async () => {
    const desde = new Date(Date.now() - 60_000);
    const d1 = await db.notification.create({ data: { userId: a, title: "Dúvida de Y", body: "oi", link: "/admin/duvidas?u=1", refType: "duvida" } });
    await db.notification.create({ data: { userId: a, title: "Pedido aprovado", refType: "solicitacao" } }); // não é dúvida
    await db.notification.create({ data: { userId: a, title: "Dúvida lida", refType: "duvida", readAt: new Date() } }); // já lida
    await db.notification.create({ data: { userId: b, title: "Dúvida de outro", refType: "duvida" } }); // de outro usuário
    const { itens } = await novosAvisosDuvida(a, desde);
    expect(itens.map((i) => i.id)).toContain(d1.id);
    expect(itens.every((i) => ["Dúvida de X", "Dúvida de Y"].includes(i.title))).toBe(true);
    expect(itens.find((i) => i.title === "Pedido aprovado")).toBeUndefined();
    expect(itens.find((i) => i.title === "Dúvida lida")).toBeUndefined();
  });

  it("não devolve o que é mais antigo que 'desde' nem o que passou da janela de 10 minutos", async () => {
    const velha = await db.notification.create({ data: { userId: b, title: "Dúvida velha", refType: "duvida", createdAt: new Date(Date.now() - 30 * 60_000) } });
    const { itens } = await novosAvisosDuvida(b, new Date(Date.now() - 3 * 3600_000));
    expect(itens.map((i) => i.id)).not.toContain(velha.id);
    const { itens: depois } = await novosAvisosDuvida(b, new Date());
    expect(depois).toEqual([]);
  });
});
