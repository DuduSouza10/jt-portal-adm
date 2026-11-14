/**
 * Integração do fluxo completo contra um PostgreSQL real (npm run test:integration):
 * base pede → gestor aprova (reserva) → almoxarifado separa (parcial) → expedição envia (baixa) → base recebe.
 * Também confere a divisão de acesso da E9 (cada perfil só faz a sua parte).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/session";
import { lancarEntrada } from "@/modules/estoque/service";
import { aprovar, cancelar, criar, enviarLote, iniciarSeparacao, lookupParaEnvio, receber, recusar, separar } from "./service";

const tag = `S${Date.now().toString(36).toUpperCase()}`;
let regionalId: string;
let outraRegionalId: string;
let almox: string;
let base: string;
let outraBase: string;
let p1: string;
let p2: string;
let userId: string;
const photo = { mime: "image/jpeg", data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) };

const actor = (over: Partial<CurrentUser>): CurrentUser => ({
  id: userId,
  name: "Teste",
  login: "teste",
  email: null,
  mustChangePassword: false,
  profile: { id: "", key: "teste", name: "Teste" },
  permissions: ["*"],
  scope: "GLOBAL",
  bases: [],
  baseIds: [],
  regionalIds: [],
  ...over,
});
// Perfis padrão (default-profiles.ts), com alcance da regional/base de teste.
const basePerfil = () => actor({ scope: "BASE", baseIds: [base], permissions: ["produtos.ver", "solicitacoes.criar", "solicitacoes.ver"] });
const gestor = () => actor({ scope: "REGIONAL", regionalIds: [regionalId], permissions: ["solicitacoes.ver", "solicitacoes.aprovar"] });
const almoxPerfil = () =>
  actor({ scope: "REGIONAL", regionalIds: [regionalId], permissions: ["solicitacoes.ver", "expedicao.separar", "expedicao.enviar", "estoque.ver", "estoque.movimentar"] });
const expedicao = () => actor({ scope: "REGIONAL", regionalIds: [regionalId], permissions: ["expedicao.enviar"] });
const expedicaoOutra = () => actor({ scope: "REGIONAL", regionalIds: [outraRegionalId], permissions: ["expedicao.enviar"] });

const bal = async (produtoId: string) =>
  (await db.stockBalance.findUnique({ where: { baseId_produtoId: { baseId: almox, produtoId } } })) ?? { quantity: 0, reserved: 0 };
const status = async (id: string) => (await db.solicitacao.findUniqueOrThrow({ where: { id } })).status;
const json = (o: unknown) => o as Record<string, number>;

beforeAll(async () => {
  regionalId = (await db.regional.create({ data: { code: `${tag}R1`, name: "Regional teste" } })).id;
  outraRegionalId = (await db.regional.create({ data: { code: `${tag}R2`, name: "Outra regional" } })).id;
  almox = (await db.base.create({ data: { code: `${tag}-ALM`, name: "Almox", type: "ALMOXARIFADO", regionalId } })).id;
  base = (await db.base.create({ data: { code: `${tag}-B1`, name: "Base 1", regionalId } })).id;
  outraBase = (await db.base.create({ data: { code: `${tag}-B2`, name: "Base 2", regionalId: outraRegionalId } })).id;
  p1 = (await db.produto.create({ data: { code: `${tag}-P1`, name: "Produto 1" } })).id;
  p2 = (await db.produto.create({ data: { code: `${tag}-P2`, name: "Produto 2" } })).id;
  const profile = await db.accessProfile.create({ data: { key: tag.toLowerCase(), name: "Teste", scope: "GLOBAL", permissions: ["*"] } });
  userId = (await db.user.create({ data: { name: "Teste", login: tag.toLowerCase(), profileId: profile.id } })).id;
  await lancarEntrada(actor({}), { baseId: almox, document: "NF", reason: null, itens: [{ produtoId: p1, quantity: 100 }, { produtoId: p2, quantity: 10 }] });
});

// O ciclo de 3 meses (S1) barraria o segundo pedido da mesma base: cada teste começa sem ciclo.
beforeEach(async () => {
  await db.cicloBase.deleteMany({ where: { base: { code: { startsWith: tag } } } });
});

afterAll(async () => {
  const baseIds = [almox, base, outraBase];
  // Avisos dos pedidos de teste também chegam a usuários de verdade do banco (ex.: um admin global).
  const solicitacoes = await db.solicitacao.findMany({ where: { baseId: { in: baseIds } }, select: { id: true } });
  await db.notification.deleteMany({ where: { refType: "solicitacao", refId: { in: solicitacoes.map((x) => x.id) } } });
  await db.solicitacao.deleteMany({ where: { baseId: { in: baseIds } } });
  await db.shipmentPhoto.deleteMany({ where: { solicitacoes: { none: {} } } });
  await db.stockMovement.deleteMany({ where: { baseId: { in: baseIds } } });
  await db.stockReservation.deleteMany({ where: { baseId: { in: baseIds } } });
  await db.stockBalance.deleteMany({ where: { baseId: { in: baseIds } } });
  await db.auditLog.deleteMany({ where: { actorId: userId } });
  await db.user.deleteMany({ where: { login: tag.toLowerCase() } });
  await db.accessProfile.deleteMany({ where: { key: tag.toLowerCase() } });
  await db.produto.deleteMany({ where: { code: { startsWith: tag } } });
  await db.base.deleteMany({ where: { id: { in: baseIds } } });
  await db.regional.deleteMany({ where: { code: { startsWith: tag } } });
  await db.$disconnect();
});

describe("fluxo completo", () => {
  it("pede → aprova → separa parcial → envia → recebe, com o estoque certo em cada etapa", async () => {
    const s = await criar(basePerfil(), { baseId: base, priority: "URGENTE", peopleCount: 5, notes: null, itens: [{ produtoId: p1, quantity: 30 }, { produtoId: p2, quantity: 5 }] });
    expect(s.status).toBe("PENDENTE");

    // Base e expedição não aprovam.
    await expect(aprovar(basePerfil(), { id: s.id, almoxarifadoId: almox, quantidades: {}, note: null })).rejects.toThrow(/permissão/);
    await expect(aprovar(expedicao(), { id: s.id, almoxarifadoId: almox, quantidades: {}, note: null })).rejects.toThrow(/não encontrada/);

    await aprovar(gestor(), { id: s.id, almoxarifadoId: almox, quantidades: json({ [p1]: 20 }), note: null });
    expect(await bal(p1)).toMatchObject({ quantity: 100, reserved: 20 });
    expect(await bal(p2)).toMatchObject({ quantity: 10, reserved: 5 });

    // Expedição só envia o que já foi separado.
    await expect(lookupParaEnvio(expedicao(), { id: s.id })).rejects.toThrow(/não terminou de separar/);
    await expect(separar(expedicao(), { id: s.id, quantidades: {} })).rejects.toThrow(/permissão/);

    await iniciarSeparacao(almoxPerfil(), s.id);
    await expect(cancelar(basePerfil(), s.id, "desisti")).rejects.toThrow(/Em separação/);
    await separar(almoxPerfil(), { id: s.id, quantidades: json({ [p1]: 18 }) });
    const separada = await db.solicitacao.findUniqueOrThrow({ where: { id: s.id } });
    expect(separada).toMatchObject({ status: "SEPARADA", partial: true });

    // Expedição de outra regional não vê; a da regional bipa pelo número.
    await expect(lookupParaEnvio(expedicaoOutra(), { number: separada.number })).rejects.toThrow(/não encontrado/);
    expect(await lookupParaEnvio(expedicao(), { number: separada.number })).toBe(s.id);

    const r = await enviarLote(expedicao(), { ids: [s.id], tripId: "VIAGEM-1", volumes: 2, shippingNotes: null }, photo);
    expect(r.shipped).toHaveLength(1);
    expect(r.failed).toHaveLength(0);
    // Baixou o separado (18 e 5) e liberou o resto da reserva.
    expect(await bal(p1)).toMatchObject({ quantity: 82, reserved: 0 });
    expect(await bal(p2)).toMatchObject({ quantity: 5, reserved: 0 });

    // Enviar de novo falha sem travar; base confirma o recebimento.
    const de_novo = await enviarLote(expedicao(), { ids: [s.id], tripId: "VIAGEM-1", shippingNotes: null }, photo);
    expect(de_novo.failed[0].error).toMatch(/já foi enviada/);
    await receber(basePerfil(), s.id, null);
    expect(await status(s.id)).toBe("RECEBIDA");
    const eventos = await db.solicitacaoEvento.count({ where: { solicitacaoId: s.id } });
    expect(eventos).toBe(6); // criada, aprovada, em separação, separada, enviada, recebida
  });

  it("aprovação sem estoque falha inteira e o pedido continua pendente", async () => {
    const s = await criar(basePerfil(), { baseId: base, priority: "NORMAL", peopleCount: 5, notes: null, itens: [{ produtoId: p2, quantity: 50 }] });
    await expect(aprovar(gestor(), { id: s.id, almoxarifadoId: almox, quantidades: {}, note: null })).rejects.toThrow(/insuficiente|disponível/);
    expect(await status(s.id)).toBe("PENDENTE");
    await recusar(gestor(), s.id, "sem estoque");
    expect(await status(s.id)).toBe("RECUSADA");
  });

  it("cancelar aprovada devolve a reserva; base não pede para base de fora", async () => {
    const s = await criar(basePerfil(), { baseId: base, priority: "NORMAL", peopleCount: 5, notes: null, itens: [{ produtoId: p1, quantity: 10 }] });
    await aprovar(gestor(), { id: s.id, almoxarifadoId: almox, quantidades: {}, note: null });
    expect((await bal(p1)).reserved).toBe(10);
    await cancelar(basePerfil(), s.id, "pedido errado");
    expect((await bal(p1)).reserved).toBe(0);
    await expect(
      criar(basePerfil(), { baseId: outraBase, priority: "NORMAL", peopleCount: 5, notes: null, itens: [{ produtoId: p1, quantity: 1 }] }),
    ).rejects.toThrow(/não encontrada/);
  });
});
