import { describe, expect, it } from "vitest";
import { almoxarifadosExpedicaoWhere, baseScopeWhere, can, canAccessAlmoxarifado, canAccessBase, canAny, type Actor } from "./check";
import { ALL_PERMISSIONS, sanitizePermissions } from "./catalog";

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: "u1",
  permissions: [],
  scope: "BASE",
  baseIds: ["b1"],
  regionalIds: [],
  ...over,
});

describe("can", () => {
  it("libera só as permissões do perfil", () => {
    const a = actor({ permissions: ["usuarios.ver"] });
    expect(can(a, "usuarios.ver")).toBe(true);
    expect(can(a, "usuarios.editar")).toBe(false);
  });

  it("curinga libera tudo", () => {
    const a = actor({ permissions: ["*"] });
    expect(ALL_PERMISSIONS.every((p) => can(a, p))).toBe(true);
  });

  it("canAny", () => {
    const a = actor({ permissions: ["estoque.ver"] });
    expect(canAny(a, ["usuarios.ver", "estoque.ver"])).toBe(true);
    expect(canAny(a, ["usuarios.ver"])).toBe(false);
  });
});

describe("alcance de bases", () => {
  const bh = { id: "b1", regionalId: "mg" };
  const sp = { id: "b2", regionalId: "spn" };

  it("GLOBAL vê tudo e não filtra", () => {
    const a = actor({ scope: "GLOBAL", baseIds: [] });
    expect(canAccessBase(a, sp)).toBe(true);
    expect(baseScopeWhere(a)).toBeUndefined();
  });

  it("REGIONAL vê as bases das suas regionais", () => {
    const a = actor({ scope: "REGIONAL", baseIds: [], regionalIds: ["mg"] });
    expect(canAccessBase(a, bh)).toBe(true);
    expect(canAccessBase(a, sp)).toBe(false);
  });

  it("BASE vê só as bases vinculadas", () => {
    const a = actor({ scope: "BASE", baseIds: ["b1"] });
    expect(canAccessBase(a, bh)).toBe(true);
    expect(canAccessBase(a, sp)).toBe(false);
    expect(baseScopeWhere(a)).toEqual({ id: { in: ["b1"] } });
  });
});

describe("sanitizePermissions", () => {
  it("remove chaves desconhecidas e duplicadas", () => {
    expect(sanitizePermissions(["usuarios.ver", "usuarios.ver", "nao.existe", "*"])).toEqual(["usuarios.ver", "*"]);
  });
});

describe("expedição é da regional (E22)", () => {
  const almoxMg = { id: "almox-mg", regionalId: "mg", type: "ALMOXARIFADO" };
  const almoxSp = { id: "almox-sp", regionalId: "sp", type: "ALMOXARIFADO" };
  const soBase: Actor = { id: "u", permissions: ["expedicao.enviar"], scope: "BASE", baseIds: ["base-mg"], regionalIds: [], baseRegionalIds: ["mg"] };

  it("quem só tem uma base vinculada atende os almoxarifados da regional dessa base", () => {
    expect(canAccessBase(soBase, almoxMg)).toBe(false); // o alcance normal não chega lá
    expect(canAccessAlmoxarifado(soBase, almoxMg)).toBe(true);
    expect(canAccessAlmoxarifado(soBase, almoxSp)).toBe(false);
  });
  it("sem baseRegionalIds (ator antigo) vale só o alcance normal", () => {
    expect(canAccessAlmoxarifado({ ...soBase, baseRegionalIds: undefined }, almoxMg)).toBe(false);
  });
  it("o filtro da fila inclui a regional das bases; GLOBAL não filtra", () => {
    const w = almoxarifadosExpedicaoWhere(soBase);
    expect(w).toMatchObject({ type: "ALMOXARIFADO", OR: [{ id: { in: ["base-mg"] } }, { regionalId: { in: ["mg"] } }] });
    expect(almoxarifadosExpedicaoWhere({ ...soBase, scope: "GLOBAL" })).toEqual({ type: "ALMOXARIFADO" });
  });
});
