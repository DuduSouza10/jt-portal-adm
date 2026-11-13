/**
 * Integração das importações por planilha (estrutura, produtos, estoque) contra um PostgreSQL real.
 * Confere a prévia (sem gravar), a gravação, o livro do estoque e o alcance de quem importa.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/session";
import * as bases from "@/modules/estrutura/importacao.service";
import * as produtos from "@/modules/produtos/importacao.service";
import * as estoque from "@/modules/estoque/importacao.service";
import type { BaseImportRow } from "@/modules/estrutura/importacao";
import type { EstoqueImportRow } from "@/modules/estoque/importacao";

const tag = `I${Date.now().toString(36).toUpperCase()}`;
let userId: string;
let regionalId: string;

const actor = (over: Partial<CurrentUser> = {}): CurrentUser => ({
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

const baseRow = (line: number, code: string, over: Partial<BaseImportRow> = {}): BaseImportRow => ({
  line,
  code,
  name: `Base ${code}`,
  type: "BASE",
  regionalCode: `${tag}R`,
  regionalName: "Regional teste",
  cnpj: null,
  city: null,
  state: null,
  address: null,
  active: true,
  ...over,
});
const erow = (line: number, produtoCode: string, quantity: number, over: Partial<EstoqueImportRow> = {}): EstoqueImportRow => ({
  line,
  almoxCode: `${tag}-ALM`,
  produtoCode,
  quantity,
  minimum: null,
  ...over,
});
const bal = async (code: string) => {
  const p = await db.produto.findUniqueOrThrow({ where: { code } });
  const a = await db.base.findUniqueOrThrow({ where: { code: `${tag}-ALM` } });
  return db.stockBalance.findUnique({ where: { baseId_produtoId: { baseId: a.id, produtoId: p.id } } });
};

beforeAll(async () => {
  const profile = await db.accessProfile.create({ data: { key: tag.toLowerCase(), name: "Teste", scope: "GLOBAL", permissions: ["*"] } });
  userId = (await db.user.create({ data: { name: "Teste", login: tag.toLowerCase(), profileId: profile.id } })).id;
});

afterAll(async () => {
  const baseIds = (await db.base.findMany({ where: { code: { startsWith: tag } } })).map((b) => b.id);
  await db.stockMovement.deleteMany({ where: { baseId: { in: baseIds } } });
  await db.stockBalance.deleteMany({ where: { baseId: { in: baseIds } } });
  await db.auditLog.deleteMany({ where: { actorId: userId } });
  await db.produto.deleteMany({ where: { code: { startsWith: tag } } });
  await db.base.deleteMany({ where: { id: { in: baseIds } } });
  await db.regional.deleteMany({ where: { code: { startsWith: tag } } });
  await db.user.deleteMany({ where: { login: tag.toLowerCase() } });
  await db.accessProfile.deleteMany({ where: { key: tag.toLowerCase() } });
  await db.$disconnect();
});

describe("regionais e bases", () => {
  it("prévia não grava; importação cria a regional que falta e as bases; reimportar fica igual", async () => {
    const rows = [baseRow(2, `${tag}-B1`), baseRow(3, `${tag}-ALM`, { type: "ALMOXARIFADO" })];
    const prev = await bases.validarLote(actor(), rows);
    expect(prev.map((p) => p.action)).toEqual(["criar", "criar"]);
    expect(prev[0].message).toMatch(/cria a regional/);
    expect(await db.regional.count({ where: { code: `${tag}R` } })).toBe(0);

    const res = await bases.aplicarLote(actor(), rows);
    expect(res.map((r) => r.action)).toEqual(["criar", "criar"]);
    const regional = await db.regional.findUniqueOrThrow({ where: { code: `${tag}R` } });
    regionalId = regional.id;
    expect(regional.name).toBe("Regional teste");
    expect((await bases.validarLote(actor(), rows)).map((p) => p.action)).toEqual(["igual", "igual"]);

    const muda = await bases.validarLote(actor(), [baseRow(2, `${tag}-B1`, { city: "Contagem", active: false })]);
    expect(muda[0]).toMatchObject({ action: "atualizar", message: "Muda: cidade, ativo" });
  });
});

describe("produtos", () => {
  it("cria, atualiza e mostra o que muda", async () => {
    const rows = [
      { line: 2, code: `${tag}-P1`, name: "Produto 1", unit: "cx", active: true },
      { line: 3, code: `${tag}-P2`, name: "Produto 2", unit: "un", active: true },
    ];
    expect((await produtos.aplicarLote(actor(), rows)).map((r) => r.action)).toEqual(["criar", "criar"]);
    const r = await produtos.validarLote(actor(), [{ ...rows[0], unit: "pct", active: false }]);
    expect(r[0]).toMatchObject({ action: "atualizar", message: "Muda: unidade cx → pct, desativa" });
  });
});

describe("estoque", () => {
  const contado = { mode: "contado" as const, almoxarifadoId: null, document: null, reason: "Implantação" };
  const entrada = { mode: "entrada" as const, almoxarifadoId: null, document: "NF 1", reason: null };

  it("saldo contado define o saldo e o mínimo, pelo livro do estoque", async () => {
    const rows = [erow(2, `${tag}-P1`, 100, { minimum: 10 }), erow(3, `${tag}-P2`, 0)];
    const prev = await estoque.validarLote(actor(), rows, contado);
    expect(prev[0]).toMatchObject({ action: "criar", message: "Saldo 0 → 100 · mínimo 0 → 10" });
    expect(prev[1].action).toBe("igual");
    await estoque.aplicarLote(actor(), rows, contado);
    expect(await bal(`${tag}-P1`)).toMatchObject({ quantity: 100, minimum: 10 });
    const mov = await db.stockMovement.findFirstOrThrow({ where: { produto: { code: `${tag}-P1` } } });
    expect(mov).toMatchObject({ type: "INVENTARIO", quantity: 100, reason: "Implantação (importação)" });
  });

  it("entrada soma ao saldo e exige NF", async () => {
    await expect(estoque.validarLote(actor(), [erow(2, `${tag}-P1`, 5)], { ...entrada, document: null })).rejects.toThrow(/nota fiscal/);
    const r = await estoque.aplicarLote(actor(), [erow(2, `${tag}-P1`, 25), erow(3, `${tag}-P1`, 0, { almoxCode: `${tag}-B1` })], entrada);
    expect(r[0]).toMatchObject({ action: "atualizar", message: "+25 (saldo 100 → 125)" });
    expect(r[1]).toMatchObject({ action: "erro" });
    expect((await bal(`${tag}-P1`))!.quantity).toBe(125);
  });

  it("respeita o alcance e as permissões", async () => {
    const fora = actor({ scope: "REGIONAL", regionalIds: ["outra"], permissions: ["estoque.inventario", "estoque.movimentar"] });
    expect((await estoque.validarLote(fora, [erow(2, `${tag}-P1`, 1)], contado))[0].message).toMatch(/fora do seu alcance/);
    const dentro = actor({ scope: "REGIONAL", regionalIds: [regionalId], permissions: ["estoque.inventario"] });
    expect((await estoque.validarLote(dentro, [erow(2, `${tag}-P1`, 1, { minimum: 3 })], contado))[0].message).toMatch(/mínimo/);
    await expect(estoque.validarLote(dentro, [erow(2, `${tag}-P1`, 1)], entrada)).rejects.toThrow(/lançar entradas/);
    expect((await estoque.validarLote(actor(), [erow(2, "NAO-EXISTE", 1)], contado))[0].message).toMatch(/Importe o produto antes/);
  });
});
