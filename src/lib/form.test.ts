import { describe, expect, it } from "vitest";
import { z } from "zod";
import { checkbox, codeField, formToObject, optionalText } from "./form";
import { baseSchema, regionalSchema } from "@/modules/estrutura/schemas";
import { userSchema } from "@/modules/acessos/schemas";

describe("checkbox", () => {
  const s = z.object({ active: checkbox });

  it("marcada vira true; desmarcada (campo ausente) vira false", () => {
    expect(s.parse({ active: "on" })).toEqual({ active: true });
    expect(s.parse({ active: "true" })).toEqual({ active: true });
    expect(s.parse({})).toEqual({ active: false });
    expect(s.parse({ active: null })).toEqual({ active: false });
  });

  it("desativar pelos formulários reais funciona (regressão da Issue #18)", () => {
    const form = new FormData();
    form.set("code", "mg");
    form.set("name", "Minas");
    expect(regionalSchema.parse(formToObject(form))).toMatchObject({ code: "MG", active: false });
    expect(baseSchema.safeParse({ code: "BH1", name: "BH", type: "BASE", regionalId: "r" }).success).toBe(true);
    expect(userSchema.parse({ name: "Ana", login: "ana", profileId: "p" }).active).toBe(false);
  });
});

describe("outros campos", () => {
  it("texto opcional vazio vira null e sigla vai para maiúscula", () => {
    expect(z.object({ x: optionalText }).parse({ x: "  " })).toEqual({ x: null });
    expect(codeField.parse(" bhz01 ")).toBe("BHZ01");
  });
});
