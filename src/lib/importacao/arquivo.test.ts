import { describe, expect, it } from "vitest";
import { celulaParaTexto, tabelaDeCelulas, tipoDoArquivo } from "./arquivo";

describe("leitura de arquivo de importação", () => {
  it("reconhece xlsx e csv pelo nome", () => {
    expect(tipoDoArquivo("Bases.XLSX")).toBe("xlsx");
    expect(tipoDoArquivo("bases.csv")).toBe("csv");
    expect(tipoDoArquivo("bases.txt")).toBe("csv");
    expect(tipoDoArquivo("bases.xls")).toBeNull();
    expect(tipoDoArquivo("bases.pdf")).toBeNull();
  });

  it("célula do Excel vira o texto que a pessoa vê", () => {
    expect(celulaParaTexto(null)).toBe("");
    expect(celulaParaTexto("  BHZ01 ")).toBe("BHZ01");
    expect(celulaParaTexto(1234)).toBe("1234");
    expect(celulaParaTexto(true)).toBe("sim");
    expect(celulaParaTexto(false)).toBe("não");
    expect(celulaParaTexto(new Date("2026-11-24T00:00:00Z"))).toBe("2026-11-24");
    expect(celulaParaTexto(new Date("x"))).toBe("");
  });

  it("descarta linhas totalmente vazias", () => {
    expect(tabelaDeCelulas([["a", "b"], [null, ""], ["1", null], []])).toEqual([["a", "b"], ["1", ""]]);
  });
});
