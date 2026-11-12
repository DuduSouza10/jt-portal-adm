import { describe, expect, it } from "vitest";
import { userSchema } from "./schemas";

const base = { name: "João", login: "Joao.Silva", profileId: "p", active: "on" };

describe("userSchema", () => {
  it("login e e-mail sempre em minúsculas", () => {
    const r = userSchema.parse({ ...base, email: " Joao.Silva@JT.com " });
    expect(r.login).toBe("joao.silva");
    expect(r.email).toBe("joao.silva@jt.com");
  });

  it("e-mail vazio vira null e inválido é recusado", () => {
    expect(userSchema.parse({ ...base, email: "" }).email).toBeNull();
    expect(userSchema.safeParse({ ...base, email: "nao-e-email" }).success).toBe(false);
  });
});
