import { describe, expect, it } from "vitest";
import { cadastroSchema } from "./cadastro";

const ok = { name: "Maria da Silva", regionalId: "r1", baseId: "b1", login: "Maria.Silva", password: "senha1234", confirm: "senha1234" };

describe("cadastroSchema (criar conta da franquia)", () => {
  it("aceita os dados certos e põe o login em minúsculas", () => {
    const r = cadastroSchema.parse(ok);
    expect(r.login).toBe("maria.silva");
  });
  it("exige nome completo (nome e sobrenome)", () => {
    expect(cadastroSchema.safeParse({ ...ok, name: "Maria" }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...ok, name: "  Maria   Silva " }).success).toBe(true);
  });
  it("exige regional e franquia", () => {
    expect(cadastroSchema.safeParse({ ...ok, regionalId: "" }).error?.issues[0].message).toBe("Escolha a regional.");
    expect(cadastroSchema.safeParse({ ...ok, baseId: "" }).error?.issues[0].message).toBe("Escolha a franquia.");
  });
  it("valida o login e a senha", () => {
    expect(cadastroSchema.safeParse({ ...ok, login: "a b" }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...ok, password: "curta", confirm: "curta" }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...ok, confirm: "outra-senha" }).error?.issues[0].message).toBe("A confirmação não confere.");
  });
  it("ignora tipo de acesso mandado de fora", () => {
    const r = cadastroSchema.parse({ ...ok, profileId: "admin" });
    expect("profileId" in r).toBe(false);
  });
});
