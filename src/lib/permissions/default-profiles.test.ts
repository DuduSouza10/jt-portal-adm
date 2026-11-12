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
});
