import { describe, expect, it } from "vitest";
import { erroPreco, resumoPreco, variacaoPreco } from "./preco";

describe("resumoPreco", () => {
  it("sem custo em nenhum almoxarifado = sem preço", () => {
    expect(resumoPreco([])).toEqual({ valor: null, varia: false, min: null, max: null });
    expect(resumoPreco([0, 0])).toMatchObject({ valor: null });
  });
  it("custos iguais = um preço só; diferentes = varia, valor é o maior", () => {
    expect(resumoPreco([12.5, 12.5, 0])).toEqual({ valor: 12.5, varia: false, min: 12.5, max: 12.5 });
    expect(resumoPreco([10, 12.34567])).toEqual({ valor: 12.3457, varia: true, min: 10, max: 12.3457 });
  });
});

describe("erroPreco", () => {
  it("aceita valor positivo e recusa vazio, zero, negativo e absurdo", () => {
    expect(erroPreco(12.5)).toBeNull();
    expect(erroPreco(null)).toMatch(/Informe/);
    expect(erroPreco(0)).toMatch(/maior que zero/);
    expect(erroPreco(-1)).toMatch(/maior que zero/);
    expect(erroPreco(1e9)).toMatch(/limite/);
  });
});

describe("variacaoPreco", () => {
  it("% de subida e descida; sem preço anterior = null", () => {
    expect(variacaoPreco(10, 12)).toBeCloseTo(20);
    expect(variacaoPreco(10, 8)).toBeCloseTo(-20);
    expect(variacaoPreco(null, 8)).toBeNull();
  });
});
