import { describe, expect, it } from "vitest";
import { chunk, decodeCsvBytes, defaultLogin, mapHeaders, normalizeRows, parseCsv, TEMPLATE_CSV } from "./importacao";

describe("leitura do arquivo", () => {
  it("UTF-8 com BOM", () => {
    const bytes = new TextEncoder().encode("﻿nome;matrícula\nJoão;1");
    expect(decodeCsvBytes(bytes)).toBe("nome;matrícula\nJoão;1");
  });

  it("Windows-1252 (CSV salvo pelo Excel em português)", () => {
    // "João" em Windows-1252: J o 0xE3 o
    const bytes = new Uint8Array([0x4a, 0x6f, 0xe3, 0x6f]);
    expect(decodeCsvBytes(bytes)).toBe("João");
  });

  it("detecta o separador e trata aspas", () => {
    expect(parseCsv('a;b\n"x;1";"diz ""oi"""\n')).toEqual([["a", "b"], ["x;1", 'diz "oi"']]);
    expect(parseCsv("a,b\r\n1,2\r\n\r\n")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv('nome;obs\n"Ana";"linha 1\nlinha 2"')).toEqual([["nome", "obs"], ["Ana", "linha 1\nlinha 2"]]);
  });
});

describe("cabeçalho", () => {
  it("aceita variações de nome de coluna", () => {
    const h = mapHeaders(["Nome Completo", "Matrícula", "E-mail", "Tipo de Acesso", "Unidade", "Situação", "Cargo"]);
    expect(h.indexOf).toMatchObject({ nome: 0, matricula: 1, email: 2, tipo: 3, bases: 4, ativo: 5 });
    expect(h.unknown).toEqual(["Cargo"]);
    expect(h.missing).toEqual([]);
  });

  it("exige nome e algum identificador", () => {
    expect(mapHeaders(["telefone"]).missing).toEqual(["nome", "matricula"]);
    expect(mapHeaders(["nome", "email"]).missing).toEqual([]);
  });
});

describe("linhas", () => {
  const run = (csv: string) => normalizeRows(parseCsv(csv));

  it("o modelo é válido", () => {
    const r = run(TEMPLATE_CSV);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[2]).toMatchObject({ login: "102032", baseCodes: ["CTG01", "BHZ01"], profile: "franquia", active: true });
  });

  it("login padrão: login > matrícula > e-mail", () => {
    expect(defaultLogin("", "", "Maria.Souza@x.com")).toBe("maria.souza");
    expect(defaultLogin("", "A1234", "m@x.com")).toBe("a1234");
    expect(defaultLogin("Joao Silva", "1", "")).toBe("joao.silva");
  });

  it("normaliza nome, e-mail e ativo", () => {
    const r = run("nome;email;ativo\n  Ana   Paula  ;ANA@X.COM;Não\nBeto;beto@x.com;");
    expect(r.rows[0]).toMatchObject({ name: "Ana Paula", email: "ana@x.com", login: "ana", active: false });
    expect(r.rows[1].active).toBe(true);
  });

  it("aponta erros com o número da linha", () => {
    const r = run("nome;matricula;email;ativo\nA;1;;sim\nBruno;12;;sim\nCarla;123;nao-email;sim\nDani;124;;talvez\nEdu;125;;sim\nFabi;125;;sim");
    expect(r.errors).toEqual([
      { line: 2, message: "Nome vazio ou muito curto." },
      { line: 3, message: expect.stringMatching(/Login "12" inválido/) },
      { line: 4, message: expect.stringMatching(/E-mail "nao-email" inválido/) },
      { line: 5, message: expect.stringMatching(/ativo/) },
      { line: 7, message: expect.stringMatching(/repetido \(já está na linha 6\)/) },
    ]);
    expect(r.rows.map((x) => x.line)).toEqual([6]);
  });

  it("e-mail repetido em linhas diferentes", () => {
    const r = run("nome;matricula;email\nAna;1001;a@x.com\nBia;1002;A@X.com");
    expect(r.errors).toEqual([{ line: 3, message: expect.stringMatching(/E-mail "a@x.com" repetido/) }]);
  });

  it("5.000 linhas em lotes", () => {
    const csv = ["nome;matricula", ...Array.from({ length: 5000 }, (_, i) => `Pessoa ${i};${100000 + i}`)].join("\n");
    const r = run(csv);
    expect(r.errors).toEqual([]);
    expect(chunk(r.rows, 500)).toHaveLength(10);
  });
});
