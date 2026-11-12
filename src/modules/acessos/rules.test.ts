import { describe, expect, it } from "vitest";
import { isSubsetOf, scopeLinksError } from "./rules";

describe("isSubsetOf", () => {
  it("Dev concede qualquer coisa", () => {
    expect(isSubsetOf(["*"], ["*"])).toBe(true);
    expect(isSubsetOf(["usuarios.editar"], ["*"])).toBe(true);
  });

  it("ninguém além do Dev concede o curinga", () => {
    expect(isSubsetOf(["*"], ["usuarios.ver", "usuarios.editar"])).toBe(false);
  });

  it("só concede permissões que já tem", () => {
    const own = ["usuarios.ver", "usuarios.editar", "estrutura.ver"];
    expect(isSubsetOf(["usuarios.ver", "estrutura.ver"], own)).toBe(true);
    expect(isSubsetOf(["usuarios.ver", "perfis.gerenciar"], own)).toBe(false);
    expect(isSubsetOf([], own)).toBe(true);
  });
});

describe("scopeLinksError", () => {
  it("BASE exige base", () => {
    expect(scopeLinksError({ scope: "BASE", baseIds: [], regionalIds: ["r"] })).toMatch(/base/);
    expect(scopeLinksError({ scope: "BASE", baseIds: ["b"], regionalIds: [] })).toBeNull();
  });

  it("REGIONAL exige regional (ou base)", () => {
    expect(scopeLinksError({ scope: "REGIONAL", baseIds: [], regionalIds: [] })).toMatch(/regional/);
    expect(scopeLinksError({ scope: "REGIONAL", baseIds: [], regionalIds: ["r"] })).toBeNull();
  });

  it("GLOBAL não exige nada", () => {
    expect(scopeLinksError({ scope: "GLOBAL", baseIds: [], regionalIds: [] })).toBeNull();
  });
});
