import { describe, expect, it } from "vitest";
import { baseScopeWhere, canAccessBase, type Actor } from "./check";
import { scopeLinksError, scopeWithin } from "@/modules/acessos/rules";

// E16: alcances "Todas as franquias" (FRANQUIAS) e "Só a sua franquia" (FRANQUIA).
const ator = (scope: Actor["scope"], baseIds: string[] = []): Actor => ({ id: "u", permissions: [], scope, baseIds, regionalIds: [] });
const franquia = { id: "f1", regionalId: "r1", type: "FRANQUIA" };
const base = { id: "b1", regionalId: "r1", type: "BASE" };

describe("alcances de franquia", () => {
  it("Todas as franquias vê qualquer franquia, e base só se vinculada", () => {
    expect(canAccessBase(ator("FRANQUIAS"), franquia)).toBe(true);
    expect(canAccessBase(ator("FRANQUIAS"), base)).toBe(false);
    expect(canAccessBase(ator("FRANQUIAS", ["b1"]), base)).toBe(true);
    expect(baseScopeWhere(ator("FRANQUIAS"))).toEqual({ OR: [{ type: "FRANQUIA" }, { id: { in: [] } }] });
  });

  it("Só a sua franquia funciona como Só as suas bases", () => {
    expect(canAccessBase(ator("FRANQUIA", ["f1"]), franquia)).toBe(true);
    expect(canAccessBase(ator("FRANQUIA"), franquia)).toBe(false);
    expect(scopeLinksError({ scope: "FRANQUIA", baseIds: [], regionalIds: [] })).toMatch(/franquia/);
  });

  it("quem concede o quê", () => {
    expect(scopeWithin("FRANQUIAS", "GLOBAL")).toBe(true);
    expect(scopeWithin("FRANQUIA", "FRANQUIAS")).toBe(true);
    expect(scopeWithin("FRANQUIAS", "REGIONAL")).toBe(false);
    expect(scopeWithin("REGIONAL", "FRANQUIAS")).toBe(false);
    expect(scopeWithin("GLOBAL", "FRANQUIAS")).toBe(false);
    expect(scopeWithin("FRANQUIAS", "BASE")).toBe(false);
  });
});
