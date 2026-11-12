import { describe, expect, it } from "vitest";
import { applyMovement, available, normalizeItems, planShipment, MAX_QTY } from "./rules";

const b = (quantity: number, reserved = 0) => ({ quantity, reserved });

describe("entrada", () => {
  it("soma no físico", () => {
    expect(applyMovement(b(10), { type: "ENTRADA", quantity: 5 })).toMatchObject({ quantity: 15, reserved: 0, delta: 5 });
  });
  it("recusa zero, negativo, fração e exagero", () => {
    expect(() => applyMovement(b(0), { type: "ENTRADA", quantity: 0 })).toThrow(/maior que zero/);
    expect(() => applyMovement(b(0), { type: "ENTRADA", quantity: -1 })).toThrow();
    expect(() => applyMovement(b(0), { type: "ENTRADA", quantity: 1.5 })).toThrow(/inteiro/);
    expect(() => applyMovement(b(0), { type: "ENTRADA", quantity: MAX_QTY + 1 })).toThrow(/limite/);
  });
});

describe("saída e transferência", () => {
  it("tira do físico", () => {
    expect(applyMovement(b(10), { type: "SAIDA", quantity: 4 })).toMatchObject({ quantity: 6, delta: -4 });
  });
  it("não tira o que está reservado (K3)", () => {
    expect(() => applyMovement(b(10, 8), { type: "SAIDA", quantity: 3 })).toThrow(/disponível: 2/);
    expect(applyMovement(b(10, 8), { type: "TRANSFERENCIA_SAIDA", quantity: 2 })).toMatchObject({ quantity: 8, reserved: 8 });
  });
  it("nunca deixa o físico negativo", () => {
    expect(() => applyMovement(b(0), { type: "SAIDA", quantity: 1 })).toThrow(/insuficiente/);
  });
});

describe("inventário (K3)", () => {
  it("define o físico para a contagem", () => {
    expect(applyMovement(b(10), { type: "INVENTARIO", counted: 7 })).toMatchObject({ quantity: 7, delta: -3 });
    expect(applyMovement(b(10), { type: "INVENTARIO", counted: 12 })).toMatchObject({ quantity: 12, delta: 2 });
    expect(applyMovement(b(10), { type: "INVENTARIO", counted: 0 })).toMatchObject({ quantity: 0, delta: -10 });
  });
  it("contagem negativa é recusada", () => {
    expect(() => applyMovement(b(10), { type: "INVENTARIO", counted: -1 })).toThrow();
  });
  it("contagem abaixo do reservado é aceita, com alerta de disponível negativo", () => {
    const r = applyMovement(b(10, 8), { type: "INVENTARIO", counted: 5 });
    expect(r).toMatchObject({ quantity: 5, reserved: 8, warning: "DISPONIVEL_NEGATIVO" });
    expect(available(r)).toBe(-3);
  });
});

describe("reserva, liberação e baixa (K4)", () => {
  it("reserva só mexe no reservado", () => {
    expect(applyMovement(b(10, 2), { type: "RESERVA", quantity: 5 })).toMatchObject({ quantity: 10, reserved: 7, delta: 0, reservedDelta: 5 });
  });
  it("não reserva mais que o disponível", () => {
    expect(() => applyMovement(b(10, 8), { type: "RESERVA", quantity: 3 })).toThrow(/disponível: 2/);
  });
  it("liberação devolve o reservado", () => {
    expect(applyMovement(b(10, 7), { type: "LIBERACAO", quantity: 7 })).toMatchObject({ quantity: 10, reserved: 0 });
    expect(() => applyMovement(b(10, 2), { type: "LIBERACAO", quantity: 3 })).toThrow();
  });
  it("baixa tira do físico e do reservado", () => {
    expect(applyMovement(b(10, 7), { type: "BAIXA", quantity: 7 })).toMatchObject({ quantity: 3, reserved: 0, delta: -7, reservedDelta: -7 });
  });
  it("baixa falha se o inventário achou menos que o reservado", () => {
    expect(() => applyMovement(b(5, 8), { type: "BAIXA", quantity: 8 })).toThrow(/físico: 5/);
  });
});

describe("normalizeItems", () => {
  it("junta repetidos e ordena por produto", () => {
    expect(
      normalizeItems([
        { produtoId: "b", quantity: 1 },
        { produtoId: "a", quantity: 2 },
        { produtoId: "b", quantity: 3 },
      ]),
    ).toEqual([
      { produtoId: "a", quantity: 2 },
      { produtoId: "b", quantity: 4 },
    ]);
  });
  it("lista vazia e quantidade inválida", () => {
    expect(() => normalizeItems([])).toThrow(/ao menos um/);
    expect(() => normalizeItems([{ produtoId: "a", quantity: 0 }])).toThrow();
    expect(normalizeItems([{ produtoId: "a", quantity: 0 }], { allowZero: true })).toEqual([{ produtoId: "a", quantity: 0 }]);
  });
});

describe("planShipment", () => {
  it("envio total, parcial e zero", () => {
    expect(planShipment(10)).toEqual({ baixa: 10, liberacao: 0 });
    expect(planShipment(10, 6)).toEqual({ baixa: 6, liberacao: 4 });
    expect(planShipment(10, 0)).toEqual({ baixa: 0, liberacao: 10 });
  });
  it("não envia mais que o reservado", () => {
    expect(() => planShipment(10, 11)).toThrow();
  });
});
