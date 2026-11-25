import { createElement as h, Fragment } from "react";
import { describe, expect, it } from "vitest";
import { filterOptions, highlightParts, normalize, optionsFromChildren, textOf, type ComboOption } from "./combobox-rules";

const o = (value: string, label: string, extra: Partial<ComboOption> = {}): ComboOption => ({ value, label, ...extra });
const PRODUTOS = [
  o("1", "Fita adesiva 48mm", { hint: "FIT-48" }),
  o("2", "Lacre numerado azul", { hint: "LAC-AZ" }),
  o("3", "Caixa de papelão M", { hint: "CX-M" }),
  o("4", "Etiqueta térmica", { hint: "ETQ-10", description: "rolo 100x150" }),
];

describe("seletor: busca", () => {
  it("ignora acento e maiúscula", () => {
    expect(normalize("Papelão")).toBe("papelao");
    expect(filterOptions(PRODUTOS, "PAPELAO").map((x) => x.value)).toEqual(["3"]);
    expect(filterOptions(PRODUTOS, "termica").map((x) => x.value)).toEqual(["4"]);
  });

  it("acha por código, por nome e por parte do nome", () => {
    expect(filterOptions(PRODUTOS, "lac-az").map((x) => x.value)).toEqual(["2"]);
    expect(filterOptions(PRODUTOS, "numerado").map((x) => x.value)).toEqual(["2"]);
    expect(filterOptions(PRODUTOS, "azul").map((x) => x.value)).toEqual(["2"]);
  });

  it("vários termos: todos precisam aparecer, em qualquer ordem; também na descrição", () => {
    expect(filterOptions(PRODUTOS, "48 fita").map((x) => x.value)).toEqual(["1"]);
    expect(filterOptions(PRODUTOS, "etiqueta 150").map((x) => x.value)).toEqual(["4"]);
    expect(filterOptions(PRODUTOS, "fita azul")).toEqual([]);
  });

  it("busca vazia devolve tudo na ordem original", () => {
    expect(filterOptions(PRODUTOS, "  ")).toBe(PRODUTOS);
  });

  it("mais relevante primeiro: começa pelo código, depois pelo nome, depois contém", () => {
    const lista = [o("a", "Fita de lacre", { hint: "X-1" }), o("b", "Lacre azul", { hint: "Y-2" }), o("c", "Etiqueta", { hint: "LAC-9" })];
    expect(filterOptions(lista, "lac").map((x) => x.value)).toEqual(["c", "b", "a"]);
  });
});

describe("seletor: destaque do que foi digitado", () => {
  it("marca os trechos que casam, mantendo o texto original com acento", () => {
    expect(highlightParts("Caixa de papelão M", "papelao")).toEqual([
      { text: "Caixa de ", match: false },
      { text: "papelão", match: true },
      { text: " M", match: false },
    ]);
  });
  it("vários termos e sem busca", () => {
    expect(highlightParts("Fita adesiva 48mm", "fita 48").filter((p) => p.match).map((p) => p.text)).toEqual(["Fita", "48"]);
    expect(highlightParts("Fita", "")).toEqual([{ text: "Fita", match: false }]);
    expect(highlightParts("Fita", "zzz")).toEqual([{ text: "Fita", match: false }]);
  });
});

describe("seletor: lê os <option> como um <select> comum", () => {
  it("opções, texto composto, fragmentos e placeholder", () => {
    const filhos = h(
      Fragment,
      null,
      h("option", { value: "", disabled: true }, "Escolha…"),
      [h("option", { key: "a", value: "a" }, "BHZ01", " · ", "Belo Horizonte", false && "x"), h("option", { key: "b", value: "b", disabled: true }, "MG ", ["(", "inativa", ")"])],
      h("option", { value: "" }, "Todos"),
    );
    const r = optionsFromChildren(filhos);
    expect(r.placeholder).toBe("Escolha…");
    expect(r.options).toEqual([
      { value: "a", label: "BHZ01 · Belo Horizonte", disabled: undefined },
      { value: "b", label: "MG (inativa)", disabled: true },
      { value: "", label: "Todos", disabled: undefined },
    ]);
  });
  it("sem value, o valor é o texto (como no HTML)", () => {
    expect(optionsFromChildren(h("option", null, "Normal")).options[0].value).toBe("Normal");
    expect(textOf(null)).toBe("");
  });
});
