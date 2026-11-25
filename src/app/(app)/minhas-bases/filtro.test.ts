import { describe, expect, it } from "vitest";
import { agruparPorRegional, filtrarRegionais, filtrarSupervisores, podarSelecao, type RegionalItem, type SupervisorItem } from "./filtro";

const regionais: RegionalItem[] = [
  { id: "r1", code: "MG", name: "Minas Gerais", bases: [
    { id: "a", code: "BHZ-03-MG", name: "BHZ 03-MG", type: "BASE" },
    { id: "b", code: "F-BHZ-08-MG", name: "F BHZ 08-MG", type: "FRANQUIA" },
  ] },
  { id: "r2", code: "SP", name: "São Paulo", bases: [{ id: "c", code: "CD-SP-001", name: "CD SP 001", type: "BASE" }] },
];

describe("filtrarRegionais", () => {
  it("sem filtro mostra tudo", () => {
    expect(filtrarRegionais(regionais, "", "todos").map((r) => r.mostradas.length)).toEqual([2, 1]);
  });
  it("busca ignora hífen, espaço e maiúsculas", () => {
    const r = filtrarRegionais(regionais, "bhz 03", "todos");
    expect(r).toHaveLength(1);
    expect(r[0]!.mostradas.map((b) => b.id)).toEqual(["a"]);
  });
  it("filtra por tipo e some com a regional que ficou vazia", () => {
    const r = filtrarRegionais(regionais, "", "FRANQUIA");
    expect(r.map((x) => x.code)).toEqual(["MG"]);
    expect(r[0]!.mostradas.map((b) => b.id)).toEqual(["b"]);
  });
});

describe("podarSelecao", () => {
  it("tira o que não está mais disponível", () => {
    expect([...podarSelecao(["a", "b"], ["b", "c"])]).toEqual(["b"]);
  });
});

describe("filtrarSupervisores", () => {
  const lista: SupervisorItem[] = [
    { id: "1", name: "Ana Souza", bases: [{ id: "a", code: "BHZ-03-MG", name: "BHZ 03", type: "BASE", regionalCode: "MG" }] },
    { id: "2", name: "Bruno Lima", bases: [{ id: "c", code: "CD-SP-001", name: "CD SP 001", type: "BASE", regionalCode: "SP" }, { id: "d", code: "SP-02", name: "SP 02", type: "BASE", regionalCode: "SP" }] },
  ];
  it("sem busca devolve todos", () => expect(filtrarSupervisores(lista, " ")).toHaveLength(2));
  it("achou o nome: mantém todas as bases dele", () => {
    const r = filtrarSupervisores(lista, "bruno");
    expect(r).toHaveLength(1);
    expect(r[0]!.bases).toHaveLength(2);
  });
  it("achou só a base: mostra o dono com a base que casou", () => {
    const r = filtrarSupervisores(lista, "cd sp");
    expect(r.map((s) => s.name)).toEqual(["Bruno Lima"]);
    expect(r[0]!.bases.map((b) => b.id)).toEqual(["c"]);
  });
  it("não acha nada", () => expect(filtrarSupervisores(lista, "zzz")).toEqual([]));
});

describe("agruparPorRegional", () => {
  it("agrupa e ordena pelo código da regional", () => {
    const g = agruparPorRegional([{ regionalCode: "SP", n: 1 }, { regionalCode: "MG", n: 2 }, { regionalCode: "SP", n: 3 }]);
    expect(g.map((x) => [x.regionalCode, x.bases.length])).toEqual([["MG", 1], ["SP", 2]]);
  });
});
