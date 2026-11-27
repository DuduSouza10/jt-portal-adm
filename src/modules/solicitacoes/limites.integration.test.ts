/**
 * S1–S3 (regras do portal do Eduardo) contra um PostgreSQL real: ciclo da base (1 mês) e das franquias (insumos + lacres), número de
 * pessoas obrigatório e limite por produto com bloqueio automático; recusa desfaz; quem aprova não entra.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/session";
import { lancarEntrada } from "@/modules/estoque/service";
import { aprovar, criar, enviarLote, recusar, separar } from "./service";
import { produtosParaPedir } from "./queries";

const tag = `L${Date.now().toString(36).toUpperCase()}`;
let userId: string;
let almox: string;
let base: string;
let franquia: string;
let luva: string;
let fita: string;

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
const fechar = async (baseId: string) => {
  await db.solicitacao.updateMany({ where: { baseId, status: { in: ["PENDENTE", "APROVADA", "EM_SEPARACAO", "SEPARADA", "ENVIADA"] } }, data: { status: "RECEBIDA" } });
  // S20: a franquia tem duas vagas por ciclo (insumos e lacres); estes testes pedem várias vezes o mesmo tipo.
  if (baseId === franquia) await db.cicloBase.deleteMany({ where: { baseId } });
};

beforeAll(async () => {
  const r = await db.regional.create({ data: { code: `${tag}R`, name: "R" } });
  almox = (await db.base.create({ data: { code: `${tag}-A`, name: "A", type: "ALMOXARIFADO", regionalId: r.id } })).id;
  base = (await db.base.create({ data: { code: `${tag}-B`, name: "Base", regionalId: r.id } })).id;
  franquia = (await db.base.create({ data: { code: `${tag}-F`, name: "Franquia", type: "FRANQUIA", regionalId: r.id } })).id;
  luva = (await db.produto.create({ data: { code: `${tag}-LUVA`, name: "Luva", unit: "cx", limitBase: 10, limitFranquia: 4, limitBlockDays: 60, lacre: true } })).id;
  // S13: franquia só pede lacre; os produtos destes testes são lacres para a franquia poder pedir.
  fita = (await db.produto.create({ data: { code: `${tag}-FITA`, name: "Fita", lacre: true } })).id;
  const profile = await db.accessProfile.create({ data: { key: tag.toLowerCase(), name: "T", scope: "GLOBAL", permissions: ["*"] } });
  userId = (await db.user.create({ data: { name: "T", login: tag.toLowerCase(), profileId: profile.id } })).id;
  await lancarEntrada(admin(), { baseId: almox, document: "NF", reason: null, itens: [{ produtoId: luva, quantity: 500 }, { produtoId: fita, quantity: 500 }] });
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

describe("S1 e S2: ciclo e número de pessoas", () => {
  it("base informa pessoas; depois de pedir entra no ciclo; recusa derruba o ciclo; envio conta do envio", async () => {
    await expect(pedir(base, fita, 1, null)).rejects.toThrow(/número de pessoas/);

    const s1 = await pedir(base, fita, 2);
    expect(s1.peopleCount).toBe(8);
    await expect(pedir(base, fita, 1)).rejects.toThrow(/está no ciclo/);

    // Recusado: o ciclo cai e a base pode pedir de novo.
    await recusar(admin(), s1.id, "teste");
    const s2 = await pedir(base, fita, 2);

    // Enviado: o ciclo passa a contar 1 mês (padrão) a partir do envio.
    await aprovar(admin(), { id: s2.id, almoxarifadoId: almox, quantidades: {}, note: null });
    await separar(admin(), { id: s2.id, quantidades: {} });
    await enviarLote(admin(), { ids: [s2.id], tripId: "VG", shippingNotes: null }, { mime: "image/png", data: new Uint8Array([1]) });
    const ciclo = await db.cicloBase.findUniqueOrThrow({ where: { baseId: base } });
    const enviada = await db.solicitacao.findUniqueOrThrow({ where: { id: s2.id } });
    expect(ciclo.sourceSolicitacaoId).toBe(s2.id);
    expect(ciclo.blockedUntil.getUTCMonth()).toBe((enviada.shippedAt!.getUTCMonth() + 1) % 12);
    expect(ciclo.reason).toMatch(/envio/);

    // Quem aprova não entra no ciclo; franquia não precisa informar pessoas (S20 tem o ciclo dela, testado abaixo).
    await criar(admin(), { baseId: base, priority: "NORMAL", notes: null, itens: [{ produtoId: fita, quantity: 1 }] });
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
      const b1 = await pedir(base, fita, 1);
      await expect(pedir(base, fita, 1)).rejects.toThrow(/ainda está em andamento/);
      expect(await db.solicitacao.count({ where: { baseId: { in: [base, franquia] }, status: "PENDENTE" } })).toBe(2);

      // Uma base não trava a outra, e quem aprova pode abrir pedido mesmo assim.
      await criar(admin(), { baseId: franquia, priority: "NORMAL", notes: null, itens: [{ produtoId: fita, quantity: 1 }] });

      // Recusado ou cancelado libera.
      await recusar(admin(), f1.id, "teste");
      await db.solicitacao.updateMany({ where: { baseId: franquia, status: "PENDENTE" }, data: { status: "CANCELADA" } });
      await pedir(franquia, fita, 1, null);

      // Ainda em andamento depois de aprovado.
      await aprovar(admin(), { id: b1.id, almoxarifadoId: almox, quantidades: {}, note: null });
      await expect(pedir(base, fita, 1)).rejects.toThrow(/ainda está em andamento/);
      await db.solicitacao.update({ where: { id: b1.id }, data: { status: "RECEBIDA" } });
      await pedir(base, fita, 1);
    } finally {
      await db.setting.deleteMany({ where: { key: "pedidos" } });
      await fechar(base);
      await fechar(franquia);
      await db.cicloBase.deleteMany({ where: { baseId: base } });
    }
  });
});

describe("S3: limite por produto", () => {
  it("S19: a base pede lacre em Solicitar insumos; só a página da franquia lista apenas lacres", async () => {
    const ids = async (o?: Parameters<typeof produtosParaPedir>[0]) => (await produtosParaPedir(o)).map((p) => p.id);
    expect(await ids({ lacres: "todos" })).toContain(fita);
    expect(await ids({ lacres: true })).toContain(fita);
    expect(await ids()).not.toContain(fita);
    // e o pedido da base com lacre é aceito
    await fechar(base);
    await expect(pedir(base, fita, 1)).resolves.toBeTruthy();
    await fechar(base);
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

describe("S20: franquia, duas solicitações por ciclo (insumos e lacres)", () => {
  it("pede insumos e lacres (um de cada); só depois dos dois é bloqueada; recusa libera a vaga; o ciclo vence", async () => {
    const papel = (await db.produto.create({ data: { code: `${tag}-PAPEL`, name: "Papel" } })).id;
    await lancarEntrada(admin(), { baseId: almox, document: "NF", reason: null, itens: [{ produtoId: papel, quantity: 100 }] });
    await fechar(franquia);
    await db.bloqueioProduto.deleteMany({ where: { baseId: franquia } });
    await db.setting.deleteMany({ where: { key: "pedidos" } });
    const pedirF = (produtoId: string) => pedir(franquia, produtoId, 1, null);

    // Lacre e insumo no mesmo pedido: barrado. Insumo sozinho e lacre sozinho: aceitos, mesmo com o outro em andamento.
    await expect(criar(admin(), { baseId: franquia, priority: "NORMAL", notes: null, itens: [{ produtoId: papel, quantity: 1 }, { produtoId: fita, quantity: 1 }] })).rejects.toThrow("Lacre e insumo não vão no mesmo pedido");
    const ins = await pedirF(papel);
    // Primeiro pedido: ainda não bloqueia (falta o de lacres) e não trava o de lacres.
    expect((await db.cicloBase.findUniqueOrThrow({ where: { baseId: franquia } })).sourceSolicitacaoId).toBeNull();
    await expect(pedirF(papel)).rejects.toThrow(/já fez a solicitação de insumos deste ciclo/);
    const lac = await pedirF(fita);

    // Os dois feitos: bloqueada por 1 mês (padrão), nos dois tipos.
    const ciclo = await db.cicloBase.findUniqueOrThrow({ where: { baseId: franquia } });
    expect(ciclo.sourceSolicitacaoId).toBe(lac.id);
    expect(ciclo.blockedUntil.getTime()).toBeGreaterThan(Date.now() + 27 * 86_400_000);
    expect(ciclo.blockedUntil.getTime()).toBeLessThan(Date.now() + 32 * 86_400_000);
    await db.solicitacao.updateMany({ where: { baseId: franquia }, data: { status: "RECEBIDA" } });
    await expect(pedirF(papel)).rejects.toThrow(/já fez as duas solicitações do ciclo/);
    await expect(pedirF(fita)).rejects.toThrow(/já fez as duas solicitações do ciclo/);
    // Quem aprova não entra no ciclo.
    await criar(admin(), { baseId: franquia, priority: "NORMAL", notes: null, itens: [{ produtoId: papel, quantity: 1 }] });
    await db.solicitacao.updateMany({ where: { baseId: franquia, status: "PENDENTE" }, data: { status: "RECEBIDA" } });

    // Pedido de lacres cancelado: a vaga de lacres volta e o bloqueio cai; a de insumos continua usada.
    await db.solicitacao.update({ where: { id: lac.id }, data: { status: "CANCELADA" } });
    await expect(pedirF(papel)).rejects.toThrow(/já fez a solicitação de insumos deste ciclo/);
    const lac2 = await pedirF(fita);
    expect(lac2.id).not.toBe(lac.id);
    await db.solicitacao.update({ where: { id: lac2.id }, data: { status: "RECEBIDA" } });
    await expect(pedirF(fita)).rejects.toThrow(/já fez as duas solicitações do ciclo/);

    // Liberado pelo admin ou ciclo vencido: as duas vagas voltam.
    await db.cicloBase.update({ where: { baseId: franquia }, data: { blockedUntil: new Date(Date.now() - 1000) } });
    const novo = await pedirF(papel);
    expect((await db.cicloBase.findUniqueOrThrow({ where: { baseId: franquia } })).lacresSolicitacaoId).toBeNull();
    await db.solicitacao.update({ where: { id: novo.id }, data: { status: "RECEBIDA" } });
    await expect(pedirF(papel)).rejects.toThrow(/já fez a solicitação de insumos deste ciclo/);
    await db.cicloBase.update({ where: { baseId: franquia }, data: { revokedAt: new Date() } });
    await pedirF(papel);

    // Ciclo desligado em Configurações: sem vagas nem bloqueio, só um por vez de cada tipo (S16).
    await fechar(franquia);
    await db.setting.upsert({ where: { key: "pedidos" }, update: { value: { cicloAtivo: false, cicloMeses: 1 } }, create: { key: "pedidos", value: { cicloAtivo: false, cicloMeses: 1 } } });
    try {
      await pedirF(papel);
      await expect(pedirF(papel)).rejects.toThrow(/ainda está em andamento/); // um por vez, por tipo
      await pedirF(fita); // o outro tipo anda junto
      await fechar(franquia);
      await pedirF(papel);
      await fechar(franquia);
    } finally {
      await db.setting.deleteMany({ where: { key: "pedidos" } });
    }
    expect(ins.id).toBeTruthy();
  });
});

describe("S22: bases só pedem às segundas e terças", () => {
  it("base barrada de quarta a domingo; franquia e quem aprova pedem todos os dias", async () => {
    await fechar(base);
    await fechar(franquia);
    await db.cicloBase.deleteMany({ where: { baseId: base } });
    (globalThis as { __regraDoDiaDePedir?: boolean }).__regraDoDiaDePedir = true;
    // Só o Date é falso (e só neste teste): a regra olha o dia da semana de Brasília.
    const dia = (iso: string) => vi.useFakeTimers({ toFake: ["Date"], now: new Date(iso) });
    try {
      dia("2026-11-25T15:00:00-03:00"); // quarta
      await expect(pedir(base, fita, 1)).rejects.toThrow(/segundas e terças-feiras/);
      await pedir(franquia, fita, 1, null);
      await criar(admin(), { baseId: base, priority: "NORMAL", notes: null, itens: [{ produtoId: fita, quantity: 1 }] });
      await fechar(base);
      await fechar(franquia);

      dia("2026-11-22T12:00:00-03:00"); // domingo
      await expect(pedir(base, fita, 1)).rejects.toThrow(/segundas e terças-feiras/);

      // Segunda e terça (até 23h59 de Brasília, mesmo já sendo quarta em UTC) passam.
      dia("2026-11-24T23:30:00-03:00"); // terça à noite = quarta 02:30 UTC
      const s = await pedir(base, fita, 1);
      await recusar(admin(), s.id, "teste");
      dia("2026-11-23T08:00:00-03:00"); // segunda
      await pedir(base, fita, 1);
    } finally {
      vi.useRealTimers();
      delete (globalThis as { __regraDoDiaDePedir?: boolean }).__regraDoDiaDePedir;
      await fechar(base);
      await fechar(franquia);
      await db.cicloBase.deleteMany({ where: { baseId: base } });
    }
  });
});

describe("S1 desligado em Configurações", () => {
  it("com o ciclo desligado a base pede de novo; limites continuam valendo", async () => {
    await db.cicloBase.deleteMany({ where: { baseId: base } });
    await db.setting.upsert({ where: { key: "pedidos" }, update: { value: { cicloAtivo: false, cicloMeses: 3 } }, create: { key: "pedidos", value: { cicloAtivo: false, cicloMeses: 3 } } });
    try {
      await fechar(base);
      await pedir(base, fita, 1);
      await fechar(base);
      await pedir(base, fita, 1);
      expect(await db.cicloBase.count({ where: { baseId: base } })).toBe(0);
      await fechar(base);
      await expect(pedir(base, luva, 11)).rejects.toThrow("Limite permitido: 10 cx");
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
