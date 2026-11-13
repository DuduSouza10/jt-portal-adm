import { describe, expect, it } from "vitest";
import { formatNumber, parseScan, planQuantities, transitionError } from "./rules";

describe("transitionError (S4)", () => {
  it("segue o fluxo", () => {
    expect(transitionError("aprovar", "PENDENTE", "SOL-1")).toBeNull();
    expect(transitionError("separar", "APROVADA", "SOL-1")).toBeNull();
    expect(transitionError("separar", "EM_SEPARACAO", "SOL-1")).toBeNull();
    expect(transitionError("enviar", "SEPARADA", "SOL-1")).toBeNull();
    expect(transitionError("receber", "ENVIADA", "SOL-1")).toBeNull();
  });
  it("não cancela depois que a separação começou", () => {
    expect(transitionError("cancelar", "APROVADA", "SOL-1")).toBeNull();
    expect(transitionError("cancelar", "EM_SEPARACAO", "SOL-1")).toMatch(/Em separação/);
  });
  it("explica por que não pode enviar", () => {
    expect(transitionError("enviar", "ENVIADA", "SOL-1")).toMatch(/já foi enviada/);
    expect(transitionError("enviar", "CANCELADA", "SOL-1")).toMatch(/cancelada/);
    expect(transitionError("enviar", "APROVADA", "SOL-1")).toMatch(/não terminou de separar/);
  });
});

describe("parseScan", () => {
  it("lê o link do QR da guia", () => {
    expect(parseScan("https://portal/solicitacoes/cmabc1234567890")).toEqual({ id: "cmabc1234567890" });
  });
  it("lê o número em vários formatos", () => {
    expect(parseScan("SOL-000123")).toEqual({ number: 123 });
    expect(parseScan(" sol123 ")).toEqual({ number: 123 });
    expect(parseScan("123")).toEqual({ number: 123 });
    expect(formatNumber(123)).toBe("SOL-000123");
  });
  it("rejeita lixo", () => {
    expect(parseScan("")).toBeNull();
    expect(parseScan("abc")).toBeNull();
    expect(parseScan("0")).toBeNull();
  });
});

describe("planQuantities", () => {
  const linhas = [
    { produtoId: "a", label: "A", max: 10 },
    { produtoId: "b", label: "B", max: 5 },
  ];
  it("ausente = máximo, sem parcial", () => {
    const r = planQuantities(linhas, {}, { etapa: "separado" });
    expect(r.partial).toBe(false);
    expect(r.quantities.get("a")).toBe(10);
  });
  it("menos que o máximo = parcial", () => {
    expect(planQuantities(linhas, { b: 2 }, { etapa: "separado" }).partial).toBe(true);
  });
  it("não passa do máximo nem aceita tudo zero", () => {
    expect(() => planQuantities(linhas, { a: 11 }, { etapa: "separado" })).toThrow(/máximo é 10/);
    expect(() => planQuantities(linhas, { a: 0, b: 0 }, { etapa: "separado" })).toThrow(/ao menos um/);
    expect(() => planQuantities(linhas, { a: -1 }, { etapa: "separado" })).toThrow(/inválida/);
  });
});
