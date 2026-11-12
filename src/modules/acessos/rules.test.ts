import { describe, expect, it } from "vitest";
import { isSubsetOf, linksOutsideScopeError, sameLinks, scopeLinksError, scopeWithin } from "./rules";

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

describe("alcance", () => {
  const regionalMG = { scope: "REGIONAL" as const, baseIds: [], regionalIds: ["mg"] };
  const baseBH = { scope: "BASE" as const, baseIds: ["bh"], regionalIds: [] };
  const map = new Map([["bh", "mg"], ["ctg", "mg"], ["gru", "sp"]]);

  it("ninguém concede alcance maior que o seu", () => {
    expect(scopeWithin("GLOBAL", "REGIONAL")).toBe(false);
    expect(scopeWithin("REGIONAL", "REGIONAL")).toBe(true);
    expect(scopeWithin("BASE", "REGIONAL")).toBe(true);
    expect(scopeWithin("REGIONAL", "BASE")).toBe(false);
  });

  it("global vincula qualquer coisa", () => {
    expect(linksOutsideScopeError({ scope: "GLOBAL", baseIds: [], regionalIds: [] }, { baseIds: ["gru"], regionalIds: ["sp"] }, map)).toBeNull();
  });

  it("regional só vincula a sua regional e bases dela", () => {
    expect(linksOutsideScopeError(regionalMG, { baseIds: ["bh", "ctg"], regionalIds: ["mg"] }, map)).toBeNull();
    expect(linksOutsideScopeError(regionalMG, { baseIds: ["gru"], regionalIds: [] }, map)).toMatch(/bases/);
    expect(linksOutsideScopeError(regionalMG, { baseIds: [], regionalIds: ["sp"] }, map)).toMatch(/regionais/);
  });

  it("base só vincula as próprias bases e nenhuma regional", () => {
    expect(linksOutsideScopeError(baseBH, { baseIds: ["bh"], regionalIds: [] }, map)).toBeNull();
    expect(linksOutsideScopeError(baseBH, { baseIds: ["ctg"], regionalIds: [] }, map)).toMatch(/bases/);
    expect(linksOutsideScopeError(baseBH, { baseIds: ["bh"], regionalIds: ["mg"] }, map)).toMatch(/regionais/);
  });

  it("sameLinks ignora a ordem", () => {
    expect(sameLinks({ baseIds: ["a", "b"], regionalIds: [] }, { baseIds: ["b", "a"], regionalIds: [] })).toBe(true);
    expect(sameLinks({ baseIds: ["a"], regionalIds: [] }, { baseIds: ["a", "b"], regionalIds: [] })).toBe(false);
  });
});
