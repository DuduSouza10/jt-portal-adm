import { describe, expect, it } from "vitest";
import { baseScopeWhere, can, canAccessBase, canAny, type Actor } from "./check";
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
