import { describe, expect, it } from "vitest";
import { produtoSchema } from "./schemas";

const base = { code: " luva-m ", name: "  Luva  de látex M ", unit: " CX " };

describe("formulário de produto", () => {
  it("normaliza código, nome e unidade; sem limites e sem dias usa o padrão", () => {
    const r = produtoSchema.safeParse({ ...base, limitBase: "", limitFranquia: "", limitBlockDays: "" });
    expect(r.success && r.data).toMatchObject({
      code: "LUVA-M",
      name: "Luva de látex M",
      unit: "cx",
      active: false,
      limitBase: null,
      limitFranquia: null,
      limitBlockDays: 60,
    });
  });

  it("campos de limite ausentes também valem (sem limite, 60 dias)", () => {
    const r = produtoSchema.safeParse({ ...base, active: "on" });
    expect(r.success && r.data).toMatchObject({ active: true, limitBase: null, limitFranquia: null, limitBlockDays: 60 });
  });

  it("lê limites e período como inteiros; zero é um limite válido", () => {
    const r = produtoSchema.safeParse({ ...base, limitBase: "10", limitFranquia: "0", limitBlockDays: "30" });
    expect(r.success && r.data).toMatchObject({ limitBase: 10, limitFranquia: 0, limitBlockDays: 30 });
  });

  it("recusa limite negativo, decimal, texto ou acima de 1.000.000", () => {
    for (const v of ["-1", "1,5", "dez", "1000001"]) expect(produtoSchema.safeParse({ ...base, limitBase: v }).success, v).toBe(false);
  });

  it("recusa período fora de 1 a 3650 dias", () => {
    for (const v of ["0", "3651", "-5", "2,5"]) expect(produtoSchema.safeParse({ ...base, limitBlockDays: v }).success, v).toBe(false);
    expect(produtoSchema.safeParse({ ...base, limitBlockDays: "3650" }).success).toBe(true);
  });

  it("recusa código inválido, nome curto e unidade longa ou vazia", () => {
    expect(produtoSchema.safeParse({ ...base, code: "LUVA M" }).success).toBe(false);
    expect(produtoSchema.safeParse({ ...base, code: "" }).success).toBe(false);
    expect(produtoSchema.safeParse({ ...base, name: "A" }).success).toBe(false);
    expect(produtoSchema.safeParse({ ...base, unit: "" }).success).toBe(false);
    expect(produtoSchema.safeParse({ ...base, unit: "caixinhas!!" }).success).toBe(false);
  });
});
