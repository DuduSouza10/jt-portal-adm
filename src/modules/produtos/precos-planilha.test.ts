import { describe, expect, it } from "vitest";
import { lerPlanilhaPrecos } from "./precos-planilha";

const csv = (s: string) => new TextEncoder().encode(s);

describe("lerPlanilhaPrecos", () => {
  it("aceita a planilha de estoque da J&T (Código + ValorMedio, ponto ou vírgula)", () => {
    const r = lerPlanilhaPrecos(
      csv("﻿Código;Material;Saldo;ValorMedio\n2025069;Açucar;28;4.75\n2025006;Adaptador;0;70\n2025214;Adesivo;0;\n2025103;Abraçadeira;70000;0\n;Sem código;1;5\n2025150;Detergente;80;1,60\n"),
    );
    expect(r.erro).toBeNull();
    expect(r.linhas).toEqual([
      { line: 2, codigo: "2025069", preco: 4.75 },
      { line: 3, codigo: "2025006", preco: 70 },
      { line: 7, codigo: "2025150", preco: 1.6 },
    ]);
    expect(r.ignoradas).toBe(3);
  });

  it("aceita o formato simples codigo;preco e marca preço inválido como null", () => {
    const r = lerPlanilhaPrecos(csv("codigo;preco\nluva-m;R$ 12,50\nfita;abc\n"));
    expect(r.linhas).toEqual([
      { line: 2, codigo: "LUVA-M", preco: 12.5 },
      { line: 3, codigo: "FITA", preco: null },
    ]);
  });

  it("sem as colunas certas ou vazia = erro", () => {
    expect(lerPlanilhaPrecos(csv("nome;quantidade\nLuva;3\n")).erro).toMatch(/colunas/);
    expect(lerPlanilhaPrecos(csv("codigo;preco\n")).erro).toMatch(/vazia/);
  });
});
