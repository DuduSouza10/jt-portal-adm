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
let cola: string;

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

/** Fecha os pedidos em andamento da base, para os testes de ciclo/limite pedirem de novo (S16). */
const fechar = (baseId: string) => db.solicitacao.updateMany({ where: { baseId, status: { in: ["PENDENTE", "APROVADA", "EM_SEPARACAO", "SEPARADA", "ENVIADA"] } }, data: { status: "RECEBIDA" } });

beforeAll(async () => {
  const r = await db.regional.create({ data: { code: `${tag}R`, name: "R" } });
  almox = (await db.base.create({ data: { code: `${tag}-A`, name: "A", type: "ALMOXARIFADO", regionalId: r.id } })).id;
  base = (await db.base.create({ data: { code: `${tag}-B`, name: "Base", regionalId: r.id } })).id;
  franquia = (await db.base.create({ data: { code: `${tag}-F`, name: "Franquia", type: "FRANQUIA", regionalId: r.id } })).id;
  luva = (await db.produto.create({ data: { code: `${tag}-LUVA`, name: "Luva", unit: "cx", limitBase: 10, limitFranquia: 4, limitBlockDays: 60, lacre: true } })).id;
  // S13: franquia só pede lacre; os produtos destes testes são lacres para a franquia poder pedir.
  fita = (await db.produto.create({ data: { code: `${tag}-FITA`, name: "Fita", lacre: true } })).id;
  // S19: lacre é só da franquia; a base pede insumo comum (cola, com limite de 10 cx).
  cola = (await db.produto.create({ data: { code: `${tag}-COLA`, name: "Cola", unit: "cx", limitBase: 10, limitFranquia: 4, limitBlockDays: 60 } })).id;
  const profile = await db.accessProfile.create({ data: { key: tag.toLowerCase(), name: "T", scope: "GLOBAL", permissions: ["*"] } });
  userId = (await db.user.create({ data: { name: "T", login: tag.toLowerCase(), profileId: profile.id } })).id;
  await lancarEntrada(admin(), { baseId: almox, document: "NF", reason: null, itens: [{ produtoId: luva, quantity: 500 }, { produtoId: fita, quantity: 500 }, { produtoId: cola, quantity: 500 }] });
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
    await expect(pedir(base, cola, 1, null)).rejects.toThrow(/número de pessoas/);

    const s1 = await pedir(base, cola, 2);
    expect(s1.peopleCount).toBe(8);
    await expect(pedir(base, cola, 1)).rejects.toThrow(/ciclo de 3 meses/);

    // Recusado: o ciclo cai e a base pode pedir de novo.
    await recusar(admin(), s1.id, "teste");
    const s2 = await pedir(base, cola, 2);

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
    await criar(admin(), { baseId: base, priority: "NORMAL", notes: null, itens: [{ produtoId: cola, quantity: 1 }] });
    await pedir(franquia, fita, 1, null);
    await fechar(franquia);
    await pedir(franquia, fita, 1, null);
    await fechar(franquia);
  });
});

describe("S16: um pedido por vez", () => {
  it("base e franquia não abrem outro enquanto o anterior está em andamento; liberam ao receber, recusar ou cancelar; quem aprova não entra", async () => {
    await fechar(base);
    await fechar(franquia);
    await db.cicloBase.deleteMany({ where: { baseId: base } });
    await db.setting.upsert({ where: { key: "pedidos" }, update: { value: { cicloAtivo: false, cicloMeses: 3 } }, create: { key: "pedidos", value: { cicloAtivo: false, cicloMeses: 3 } } });
    try {
      // Franquia (sem ciclo) e base com o ciclo desligado: o segundo pedido é barrado na hora.
      const f1 = await pedir(franquia, fita, 1, null);
      await expect(pedir(franquia, fita, 1, null)).rejects.toThrow(/ainda está em andamento/);
      const b1 = await pedir(base, cola, 1);
      await expect(pedir(base, cola, 1)).rejects.toThrow(/ainda está em andamento/);
      expect(await db.solicitacao.count({ where: { baseId: { in: [base, franquia] }, status: "PENDENTE" } })).toBe(2);

      // Uma base não trava a outra, e quem aprova pode abrir pedido mesmo assim.
      await criar(admin(), { baseId: franquia, priority: "NORMAL", notes: null, itens: [{ produtoId: fita, quantity: 1 }] });

      // Recusado ou cancelado libera.
      await recusar(admin(), f1.id, "teste");
      await db.solicitacao.updateMany({ where: { baseId: franquia, status: "PENDENTE" }, data: { status: "CANCELADA" } });
      await pedir(franquia, fita, 1, null);

      // Ainda em andamento depois de aprovado.
      await aprovar(admin(), { id: b1.id, almoxarifadoId: almox, quantidades: {}, note: null });
      await expect(pedir(base, cola, 1)).rejects.toThrow(/ainda está em andamento/);
      await db.solicitacao.update({ where: { id: b1.id }, data: { status: "RECEBIDA" } });
      await pedir(base, cola, 1);
    } finally {
      await db.setting.deleteMany({ where: { key: "pedidos" } });
      await fechar(base);
      await fechar(franquia);
      await db.cicloBase.deleteMany({ where: { baseId: base } });
    }
  });
});

describe("S3: limite por produto", () => {
  it("S19: base não pede lacre (nem pelo nome), só a franquia", async () => {
    await expect(pedir(base, fita, 1)).rejects.toThrow("Lacre é só para franquias");
    const porNome = (await db.produto.create({ data: { code: `${tag}-LNOME`, name: "Lacre azul 30cm" } })).id;
    await expect(criar(admin(), { baseId: base, priority: "NORMAL", notes: null, peopleCount: 3, itens: [{ produtoId: porNome, quantity: 1 }] })).rejects.toThrow("Lacre é só para franquias");
    await db.produto.delete({ where: { id: porNome } });
  });

  it("S13: franquia não pede insumo que não é lacre", async () => {
    const papel = (await db.produto.create({ data: { code: `${tag}-PAPEL`, name: "Papel" } })).id;
    await expect(criar(admin(), { baseId: franquia, priority: "NORMAL", notes: null, itens: [{ produtoId: papel, quantity: 1 }] })).rejects.toThrow("Franquia só pode pedir lacres");
    await db.produto.delete({ where: { id: papel } });
  });

  it("franquia: limite de 4 no período, bloqueio automático ao atingir e recusa desfaz", async () => {
    await expect(pedir(franquia, luva, 5, null)).rejects.toThrow("Limite permitido: 4 cx");
    await fechar(franquia);
    const a = await pedir(franquia, luva, 3, null);
    await fechar(franquia);
    await expect(pedir(franquia, luva, 2, null)).rejects.toThrow("Restam 1 cx no período de bloqueio");
    const b = await pedir(franquia, luva, 1, null);
    await fechar(franquia);
    const bloqueio = await db.bloqueioProduto.findUniqueOrThrow({ where: { baseId_produtoId: { baseId: franquia, produtoId: luva } } });
    expect(bloqueio.sourceSolicitacaoId).toBe(b.id);
    await expect(pedir(franquia, luva, 1, null)).rejects.toThrow(/bloqueado para nova solicitação/);

    // Recusar o pedido que atingiu o limite desfaz o bloqueio e devolve o saldo do período.
    await db.solicitacao.update({ where: { id: b.id }, data: { status: "PENDENTE" } });
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
      await fechar(base);
      await pedir(base, cola, 1);
      await fechar(base);
      await pedir(base, cola, 1);
      expect(await db.cicloBase.count({ where: { baseId: base } })).toBe(0);
      await fechar(base);
      await expect(pedir(base, cola, 11)).rejects.toThrow("Limite permitido: 10 cx");
    } finally {
      await db.setting.deleteMany({ where: { key: "pedidos" } });
    }
  });
});

describe("S3 desligado em Configurações", () => {
  it("com os limites desligados ninguém é barrado nem bloqueado; religando, volta a valer", async () => {
    await db.bloqueioProduto.deleteMany({ where: { baseId: franquia } });
    await db.setting.upsert({ where: { key: "pedidos" }, update: { value: { cicloAtivo: true, cicloMeses: 3, limitesAtivos: false } }, create: { key: "pedidos", value: { cicloAtivo: true, cicloMeses: 3, limitesAtivos: false } } });
    try {
      await fechar(franquia);
      await pedir(franquia, luva, 50, null);
      await fechar(franquia);
      expect(await db.bloqueioProduto.count({ where: { baseId: franquia } })).toBe(0);
    } finally {
      await db.setting.deleteMany({ where: { key: "pedidos" } });
    }
    await expect(pedir(franquia, luva, 1, null)).rejects.toThrow(/limite/);
  });
});
