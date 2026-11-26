import { describe, expect, it } from "vitest";
import { agruparPorRegional, basesComPessoa, filtrarPessoas, perfisDaLista, type PessoaComBases } from "./pessoas";

const b = (id: string, code: string, regionalCode = "MG", type = "BASE") => ({ id, code, name: `Base ${code}`, type, regionalCode });
const lista: PessoaComBases[] = [
  { id: "1", name: "Ana Souza", login: "ana.souza", active: true, perfil: { key: "supervisor", name: "Supervisor" }, bases: [b("a", "BHZ-01-MG"), b("b", "BHZ-02-MG")] },
  { id: "2", name: "Bruno Lima", login: "bruno", active: true, perfil: { key: "supervisor", name: "Supervisor" }, bases: [b("b", "BHZ-02-MG"), b("c", "SPN-10", "SPN")] },
  { id: "3", name: "Conta BHZ01", login: "base.bhz01", active: false, perfil: { key: "base", name: "Base" }, bases: [b("a", "BHZ-01-MG")] },
];

describe("filtrarPessoas", () => {
  it("sem busca e sem filtro devolve tudo", () => {
    expect(filtrarPessoas(lista, "", "todos")).toHaveLength(3);
  });
  it("filtra pelo tipo de acesso", () => {
    expect(filtrarPessoas(lista, "", "base").map((p) => p.id)).toEqual(["3"]);
  });
  it("casou o nome ou o login, vale tudo da pessoa (sem acento nem caixa)", () => {
    expect(filtrarPessoas(lista, "ANA", "todos")[0]!.bases).toHaveLength(2);
    expect(filtrarPessoas(lista, "ANA.souza", "todos").map((p) => p.id)).toEqual(["1"]);
  });
  it("casou só uma base, mostra só as bases que casaram", () => {
    const r = filtrarPessoas(lista, "spn", "todos");
    expect(r.map((p) => p.id)).toEqual(["2"]);
    expect(r[0]!.bases.map((x) => x.code)).toEqual(["SPN-10"]);
  });
  it("busca por base mostra todas as pessoas daquela base", () => {
    expect(filtrarPessoas(lista, "BHZ-02", "todos").map((p) => p.id)).toEqual(["1", "2"]);
  });
});

describe("perfisDaLista, basesComPessoa e agruparPorRegional", () => {
  it("conta pessoas por tipo de acesso", () => {
    expect(perfisDaLista(lista)).toEqual([
      { key: "supervisor", name: "Supervisor", n: 2 },
      { key: "base", name: "Base", n: 1 },
    ]);
  });
  it("base com pessoa conta bases distintas e ignora pessoa inativa", () => {
    expect(basesComPessoa(lista)).toBe(3);
    expect(basesComPessoa([lista[2]!])).toBe(0);
  });
  it("agrupa por regional em ordem de sigla", () => {
    expect(agruparPorRegional([b("c", "SPN-10", "SPN"), b("a", "BHZ-01-MG")]).map((g) => g.regionalCode)).toEqual(["MG", "SPN"]);
  });
});
