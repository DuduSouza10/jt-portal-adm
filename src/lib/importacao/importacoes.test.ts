import { describe, expect, it } from "vitest";
import { mapColumns, parseBool, parseIntBR } from "./csv";
import { parseBases, parseBaseType, BASES_TEMPLATE_CSV } from "@/modules/estrutura/importacao";
import { parseProdutos, PRODUTOS_TEMPLATE_CSV } from "@/modules/produtos/importacao";
import { parseEstoque, ESTOQUE_TEMPLATE_CSV } from "@/modules/estoque/importacao";
import { parseCsv } from "./csv";
import { translateServerMessage } from "@/i18n/server-messages";

const table = (csv: string) => parseCsv(csv);

describe("leitura comum", () => {
  it("números de planilha brasileira", () => {
    expect(parseIntBR("1.250")).toBe(1250);
    expect(parseIntBR("120")).toBe(120);
    expect(parseIntBR("12,0")).toBe(12);
    expect(parseIntBR("1,5")).toBeNull();
    expect(parseIntBR("abc")).toBeNull();
    expect(parseIntBR("")).toBeNull();
  });
  it("sim/não e colunas com apelido", () => {
    expect(parseBool("Não")).toBe(false);
    expect(parseBool("")).toBe(true);
    expect(parseBool("talvez")).toBeNull();
    const c = mapColumns(["Código do Produto", "QTD", "Outra"], { produto: ["codigodoproduto"], quantidade: ["qtd"] }, ["produto", "quantidade"]);
    expect(c.missing).toEqual([]);
    expect(c.unknown).toEqual(["Outra"]);
  });
});

describe("regionais e bases", () => {
  it("lê a planilha modelo sem erro", () => {
    const r = parseBases(table(BASES_TEMPLATE_CSV));
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.type)).toEqual(["BASE", "FRANQUIA", "ALMOXARIFADO"]);
    expect(r.rows[0]).toMatchObject({ code: "BHZ01", regionalCode: "MG", regionalName: "Minas Gerais", state: "MG", active: true });
  });
  it("tipos e erros de formato", () => {
    expect(parseBaseType("Franqueado")).toBe("FRANQUIA");
    expect(parseBaseType("CD")).toBe("ALMOXARIFADO");
    expect(parseBaseType("loja")).toBeNull();
    const r = parseBases(table("sigla;nome;regional;uf;tipo\nB1;Base um;MG;MG;\nBH 1;Base;MG;;\nB2;Base dois;MG;;loja\nB1;Repetida;MG;;\nB3;Base três;MG;MGX;"));
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5, 6]);
    expect(r.errors[2].message).toMatch(/repetida/);
  });
  it("aponta coluna obrigatória faltando", () => {
    expect(parseBases(table("sigla;nome\nB1;Base")).missing).toEqual(["regional"]);
  });
});

describe("produtos", () => {
  it("lê a planilha modelo e usa 'un' quando falta a unidade", () => {
    expect(parseProdutos(table(PRODUTOS_TEMPLATE_CSV)).errors).toEqual([]);
    const r = parseProdutos(table("código;descrição\nluva m;Luva M"));
    expect(r.rows[0]).toMatchObject({ code: "LUVAM", name: "Luva M", unit: "un", active: true });
  });
  it("código repetido e inválido", () => {
    const r = parseProdutos(table("codigo;nome\nA1;Produto\nA1;Outro\n#;X y"));
    expect(r.errors.map((e) => e.line)).toEqual([3, 4]);
  });
});

describe("estoque", () => {
  it("lê a planilha modelo (almoxarifado e mínimo opcionais)", () => {
    const r = parseEstoque(table(ESTOQUE_TEMPLATE_CSV));
    expect(r.errors).toEqual([]);
    expect(r.rows[2]).toMatchObject({ almoxCode: null, produtoCode: "ETIQ-100", quantity: 45, minimum: 10 });
  });
  it("quantidade inválida e produto repetido no mesmo almoxarifado", () => {
    const r = parseEstoque(table("produto;quantidade;almoxarifado\nP1;-3;\nP2;1,5;\nP3;10;A\nP3;5;A\nP3;5;B"));
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 5]);
    expect(r.rows).toHaveLength(2);
  });
});

describe("tradução das mensagens das linhas", () => {
  it("traduz mensagens com valores", () => {
    expect(translateServerMessage('Produto "X1" não encontrado. Importe o produto antes.', "zh-CN")).toBe("未找到产品“X1”。请先导入该产品。");
    expect(translateServerMessage("+15 (saldo 10 → 25)", "zh-CN")).toBe("+15（库存 10 → 25）");
    expect(translateServerMessage("Nova franquia em MG", "zh-CN")).toBe("在 MG 新增加盟商");
  });
});
