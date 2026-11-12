import { describe, expect, it } from "vitest";
import { entradaSchema, inventarioSchema, saidaSchema, transferenciaSchema } from "./schemas";

const itens = (v: unknown) => JSON.stringify(v);

describe("formulários do estoque", () => {
  it("entrada: lê os itens em JSON e exige documento", () => {
    const ok = entradaSchema.safeParse({ baseId: "b", document: " NF 1 ", itens: itens([{ produtoId: "p", quantity: "5" }]) });
    expect(ok.success && ok.data).toMatchObject({ document: "NF 1", itens: [{ produtoId: "p", quantity: 5 }] });
    expect(entradaSchema.safeParse({ baseId: "b", document: "", itens: itens([{ produtoId: "p", quantity: 1 }]) }).success).toBe(false);
  });

  it("saída exige motivo", () => {
    expect(saidaSchema.safeParse({ baseId: "b", reason: "", itens: itens([{ produtoId: "p", quantity: 1 }]) }).success).toBe(false);
    expect(saidaSchema.safeParse({ baseId: "b", reason: "avaria", itens: itens([{ produtoId: "p", quantity: 1 }]) }).success).toBe(true);
  });

  it("itens inválidos", () => {
    const parse = (v: string) => transferenciaSchema.safeParse({ origemId: "a", destinoId: "b", itens: v });
    expect(parse("não é json").success).toBe(false);
    expect(parse(itens([])).success).toBe(false);
    expect(parse(itens([{ produtoId: "p", quantity: 1.5 }])).success).toBe(false);
    expect(parse(itens([{ produtoId: "", quantity: 1 }])).success).toBe(false);
    expect(parse(itens(Array.from({ length: 501 }, (_, i) => ({ produtoId: `p${i}`, quantity: 1 })))).success).toBe(false);
  });

  it("inventário aceita contagem zero (o limite fica na regra)", () => {
    expect(inventarioSchema.safeParse({ baseId: "b", reason: "mensal", itens: itens([{ produtoId: "p", quantity: 0 }]) }).success).toBe(true);
  });
});
