import { describe, expect, it } from "vitest";
import { avisos, type Contexto } from "./notify-rules";

const ctx = (over: Partial<Contexto> = {}): Contexto => ({
  number: "SOL-000001",
  baseCode: "BHZ01",
  baseName: "Belo Horizonte",
  urgente: false,
  temAlmoxarifado: true,
  atorDaBase: false,
  atorNome: "Ana",
  ...over,
});
const publicos = (a: ReturnType<typeof avisos>) => a.map((x) => x.publico);

describe("quem é avisado", () => {
  it("nova solicitação vai para quem aprova (urgente em vermelho)", () => {
    const [a] = avisos({ tipo: "criada" }, ctx({ temAlmoxarifado: false, urgente: true }));
    expect(a).toMatchObject({ publico: "aprovadores", cor: "red" });
    expect(a.titulo).toMatch(/URGENTE/);
  });

  it("aprovada: base + separação", () => {
    expect(publicos(avisos({ tipo: "status", from: "PENDENTE", to: "APROVADA" }, ctx()))).toEqual(["base", "separacao"]);
  });

  it("separada: base + expedição (pronto para envio), parcial em amarelo", () => {
    const a = avisos({ tipo: "status", from: "EM_SEPARACAO", to: "SEPARADA", parcial: true }, ctx());
    expect(publicos(a)).toEqual(["base", "expedicao"]);
    expect(a[0]).toMatchObject({ cor: "yellow" });
    expect(a[1]).toMatchObject({ link: "expedicao" });
    expect(a[1].titulo).toMatch(/Pronto para envio/);
  });

  it("enviada e recusada: só a base; recebida: o almoxarifado", () => {
    expect(publicos(avisos({ tipo: "status", from: "SEPARADA", to: "ENVIADA", nota: "Viagem: V1" }, ctx()))).toEqual(["base"]);
    expect(publicos(avisos({ tipo: "status", from: "PENDENTE", to: "RECUSADA", nota: "sem verba" }, ctx({ temAlmoxarifado: false })))).toEqual(["base"]);
    expect(publicos(avisos({ tipo: "status", from: "ENVIADA", to: "RECEBIDA" }, ctx({ atorDaBase: true })))).toEqual(["separacao"]);
  });

  it("cancelada: pela base avisa quem aprova; depois de aprovada também o almoxarifado", () => {
    expect(publicos(avisos({ tipo: "status", from: "PENDENTE", to: "CANCELADA" }, ctx({ atorDaBase: true, temAlmoxarifado: false })))).toEqual(["aprovadores"]);
    expect(publicos(avisos({ tipo: "status", from: "APROVADA", to: "CANCELADA" }, ctx({ atorDaBase: true })))).toEqual(["aprovadores", "separacao"]);
    expect(publicos(avisos({ tipo: "status", from: "APROVADA", to: "CANCELADA" }, ctx({ atorDaBase: false })))).toEqual(["base", "separacao"]);
  });

  it("comentário vai para a outra parte", () => {
    expect(publicos(avisos({ tipo: "comentario", texto: "oi" }, ctx({ atorDaBase: false })))).toEqual(["base"]);
    expect(publicos(avisos({ tipo: "comentario", texto: "oi" }, ctx({ atorDaBase: true })))).toEqual(["aprovadores", "separacao"]);
    expect(publicos(avisos({ tipo: "comentario", texto: "oi" }, ctx({ atorDaBase: true, temAlmoxarifado: false })))).toEqual(["aprovadores"]);
  });

  it("texto longo é cortado", () => {
    const [a] = avisos({ tipo: "comentario", texto: "x".repeat(1000) }, ctx());
    expect(a.corpo.length).toBe(300);
  });
});
