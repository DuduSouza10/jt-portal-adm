import { describe, expect, it } from "vitest";
import { agruparPorRegional, agruparSupervisoresPorRegional, filtrarRegionais, filtrarSupervisores, nomeBonito, podarSelecao, type RegionalItem, type SupervisorItem } from "./filtro";

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

describe("nomeBonito", () => {
  it("nome em caixa alta vira Nome Sobrenome, com da/de/do em minúsculas", () => {
    expect(nomeBonito("AMANDA BRUNA DE ALMEIDA")).toBe("Amanda Bruna de Almeida");
    expect(nomeBonito("  FABIO AGEFLIO MARQUES DOS SANTOS ")).toBe("Fabio Ageflio Marques dos Santos");
  });
  it("nome já bem escrito não muda", () => {
    expect(nomeBonito("Icaro Lopes de Aquino")).toBe("Icaro Lopes de Aquino");
  });
});

describe("agruparSupervisoresPorRegional", () => {
  const b = (id: string, regionalCode: string) => ({ id, code: id, name: id, type: "BASE", regionalCode });
  const lista: SupervisorItem[] = [
    { id: "1", name: "ZULEIDE", bases: [b("a", "SPN")] },
    { id: "2", name: "ANA", bases: [b("c", "MG"), b("d", "SPN")] },
    { id: "3", name: "BRUNO", bases: [b("e", "MG")] },
    { id: "4", name: "CARLA", bases: [] },
  ];
  it("separa por regional, com cada supervisor só com as bases daquela regional", () => {
    const { grupos, semBases } = agruparSupervisoresPorRegional(lista);
    expect(grupos.map((g) => [g.regionalCode, g.supervisores.map((s) => s.name), g.totalBases])).toEqual([
      ["MG", ["ANA", "BRUNO"], 2],
      ["SPN", ["ANA", "ZULEIDE"], 2],
    ]);
    expect(grupos[0]!.supervisores[0]!.bases.map((x) => x.id)).toEqual(["c"]);
    expect(semBases.map((s) => s.name)).toEqual(["CARLA"]);
  });
});
