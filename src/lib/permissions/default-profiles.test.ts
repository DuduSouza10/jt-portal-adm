import { describe, expect, it } from "vitest";
import { isSubsetOf } from "@/modules/acessos/rules";
import { sanitizePermissions } from "./catalog";
import { DEFAULT_PROFILES } from "./default-profiles";

describe("tipos de acesso padrão", () => {
  it("só usam permissões que existem no catálogo", () => {
    for (const p of DEFAULT_PROFILES) expect(sanitizePermissions(p.permissions), p.key).toEqual(p.permissions);
  });

  it("chaves únicas", () => {
    const keys = DEFAULT_PROFILES.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("o Administrador consegue conceder todos os perfis, menos Dev", () => {
    const admin = DEFAULT_PROFILES.find((p) => p.key === "admin")!;
    for (const p of DEFAULT_PROFILES.filter((x) => x.key !== "dev"))
      expect(isSubsetOf(p.permissions, admin.permissions), p.key).toBe(true);
  });

  it("E9: Base e Franquia só pedem insumos e acompanham os próprios pedidos", () => {
    const solicitante = ["produtos.ver", "produtos.precos", "solicitacoes.criar", "solicitacoes.ver"];
    for (const key of ["base", "franquia"]) {
      const p = DEFAULT_PROFILES.find((x) => x.key === key)!;
      expect(p.scope, key).toBe("BASE");
      expect(p.permissions.filter((x) => !solicitante.includes(x)), key).toEqual([]);
    }
  });

  it("E9: Expedição só acessa a expedição", () => {
    const p = DEFAULT_PROFILES.find((x) => x.key === "expedicao")!;
    expect(p.permissions).toEqual(["expedicao.enviar"]);
  });
});
