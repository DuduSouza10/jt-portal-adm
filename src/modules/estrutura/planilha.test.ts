import { describe, expect, it } from "vitest";
import { readSheet } from "read-excel-file/node";
import { tabelaDeCelulas } from "@/lib/importacao/arquivo";
import { parseBases } from "./importacao";
import { montarExportacao, montarModelo, type BasePlanilha } from "./planilha";

const lerPrimeiraAba = async (xlsx: Buffer) => tabelaDeCelulas((await readSheet(xlsx)) as unknown[][]);

const base = (o: Partial<BasePlanilha>): BasePlanilha => ({
  code: "BHZ01", name: "Belo Horizonte 01", type: "BASE", regionalCode: "MG", regionalName: "Minas Gerais",
  cnpj: null, city: null, state: null, address: null, active: true, ...o,
});

describe("planilha de regionais e bases (xlsx)", () => {
  it("o modelo é um xlsx que a importação lê sem erro", async () => {
    const arquivo = await montarModelo([{ code: "MG", name: "Minas Gerais", active: true, bases: 3 }]);
    expect(arquivo.subarray(0, 2).toString()).toBe("PK"); // zip = xlsx
    const r = parseBases(await lerPrimeiraAba(arquivo));
    expect(r.missing).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => [x.code, x.type])).toEqual([["BHZ01", "BASE"], ["CTG01", "FRANQUIA"], ["ALM-MG", "ALMOXARIFADO"]]);
    expect(r.unknown).toEqual([]);
  });

  it("exportar e importar de volta devolve as mesmas bases (ida e volta)", async () => {
    const bases = [
      base({}),
      base({ code: "CTG01", name: "Contagem 01", type: "FRANQUIA", cnpj: "12.345.678/0001-90", city: "Contagem", state: "MG", address: "Rua A, 10; sala 2" }),
      base({ code: "1234", name: "Só números", type: "ALMOXARIFADO", regionalCode: "SPN", regionalName: "São Paulo Norte", active: false }),
    ];
    const arquivo = await montarExportacao(
      [{ code: "MG", name: "Minas Gerais", active: true, bases: 2 }, { code: "SPN", name: "São Paulo Norte", active: true, bases: 1 }],
      bases,
    );
    const r = parseBases(await lerPrimeiraAba(arquivo));
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(3);
    for (const [i, b] of bases.entries()) {
      expect(r.rows[i]).toMatchObject({ code: b.code, name: b.name, type: b.type, regionalCode: b.regionalCode, regionalName: b.regionalName, cnpj: b.cnpj, city: b.city, state: b.state, address: b.address, active: b.active });
    }
  });

  it("exportação sem nenhuma base ainda gera a planilha só com o cabeçalho", async () => {
    const r = parseBases(await lerPrimeiraAba(await montarExportacao([], [])));
    expect(r.missing).toEqual([]);
    expect(r.rows).toEqual([]);
  });
});
