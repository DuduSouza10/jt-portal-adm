import { describe, expect, it } from "vitest";
import { avisos, cartaoPedido, MAX_ANDAMENTO_NO_CARTAO, MAX_ITENS_NO_CARTAO, resumoPedido, type Contexto } from "./notify-rules";

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
    // Pedido já na expedição: a mensagem da base chega também à expedição.
    expect(publicos(avisos({ tipo: "comentario", texto: "oi" }, ctx({ atorDaBase: true, naExpedicao: true })))).toEqual(["aprovadores", "separacao", "expedicao"]);
  });

  it("texto longo é cortado", () => {
    const [a] = avisos({ tipo: "comentario", texto: "x".repeat(1000) }, ctx());
    expect(a.corpo.length).toBe(300);
  });
});

describe("item cancelado (S17)", () => {
  it("avisa só a base, com o item e o motivo", () => {
    const a = avisos({ tipo: "itemCancelado", item: "caneta preta (10)", motivo: "não temos" }, ctx());
    expect(publicos(a)).toEqual(["base"]);
    expect(a[0]).toMatchObject({ titulo: "SOL-000001: item cancelado", link: "pedido" });
    expect(a[0].corpo).toBe("caneta preta (10). Motivo: não temos");
  });
});

describe("resumo do pedido no cartão", () => {
  const esc = (s: string) => s;
  const base = { criadaEm: new Date("2026-11-25T17:30:00Z"), status: "APROVADA" as const };

  it("mostra data/hora, status atual e itens com quantidade", () => {
    const [cab, itens] = resumoPedido(
      { ...base, itens: [{ codigo: "FIT01", nome: "Fita adesiva", unidade: "UN", pedido: 10, aprovado: 10, separado: null }] },
      esc,
    );
    expect(cab).toContain("25/11/2026");
    expect(cab).toContain("14:30"); // America/Sao_Paulo
    expect(cab).toContain("Aprovada");
    expect(itens).toContain("Itens pedidos (1)");
    expect(itens).toContain("Fita adesiva (FIT01): **10 UN**");
  });

  it("mostra aprovado/separado só quando diferente do pedido", () => {
    const [, itens] = resumoPedido(
      { ...base, itens: [{ codigo: "A", nome: "Caixa", unidade: "UN", pedido: 10, aprovado: 8, separado: 5 }] },
      esc,
    );
    expect(itens).toContain("aprovado 8");
    expect(itens).toContain("separado 5");
  });

  it("ignora item cancelado e inclui item fora do cadastro", () => {
    const [, itens] = resumoPedido(
      {
        ...base,
        itens: [
          { codigo: "A", nome: "Caixa", unidade: "UN", pedido: 1, aprovado: null, separado: null },
          { codigo: "B", nome: "Lacre", unidade: "UN", pedido: 2, aprovado: null, separado: null, cancelado: true },
        ],
        outros: [{ nome: "Cola especial", quantity: 3 }],
      },
      esc,
    );
    expect(itens).toContain("Itens pedidos (2)");
    expect(itens).not.toContain("Lacre");
    expect(itens).toContain("Cola especial: **3** · fora do cadastro");
  });

  it("limita a lista e avisa quantos ficaram de fora", () => {
    const muitos = Array.from({ length: MAX_ITENS_NO_CARTAO + 4 }, (_, i) => ({ codigo: `P${i}`, nome: `Produto ${i}`, unidade: "UN", pedido: 1, aprovado: null, separado: null }));
    const [, itens] = resumoPedido({ ...base, itens: muitos }, esc);
    expect(itens).toContain(`Itens pedidos (${MAX_ITENS_NO_CARTAO + 4})`);
    expect(itens).toContain("e mais 4 item(ns)");
    expect(itens).not.toContain(`Produto ${MAX_ITENS_NO_CARTAO + 1}`);
  });

  it("passa o texto digitado pelo escape", () => {
    const [, itens] = resumoPedido({ ...base, itens: [{ codigo: "A", nome: "<at>x</at>", unidade: "UN", pedido: 1, aprovado: null, separado: null }] }, (s) => s.replace(/</g, "‹"));
    expect(itens).toContain("‹at>x‹/at>");
  });
});

describe("cartão do pedido (um só, atualizado a cada status)", () => {
  const esc = (x: string) => x;
  const base = {
    numero: "SOL-000007",
    urgente: false,
    baseCode: "BHZ01",
    baseName: "Belo Horizonte",
    criadaEm: new Date("2026-11-25T17:30:00Z"),
    itens: [{ codigo: "FIT01", nome: "Fita adesiva", unidade: "UN", pedido: 10, aprovado: null, separado: null }],
    historico: [{ status: null, quando: new Date("2026-11-25T17:30:00Z"), quem: "Ana", nota: null }],
  };

  it("cabeçalho e cor seguem o status de agora", () => {
    expect(cartaoPedido({ ...base, status: "PENDENTE" }, esc)).toMatchObject({ titulo: "SOL-000007 · Aguardando aprovação", cor: "blue" });
    expect(cartaoPedido({ ...base, status: "ENVIADA" }, esc)).toMatchObject({ titulo: "SOL-000007 · Enviada", cor: "turquoise" });
  });

  it("urgente aguardando aprovação fica vermelho e com 🔥; depois volta à cor do status", () => {
    expect(cartaoPedido({ ...base, urgente: true, status: "PENDENTE" }, esc)).toMatchObject({ titulo: "🔥 SOL-000007 · Aguardando aprovação", cor: "red" });
    expect(cartaoPedido({ ...base, urgente: true, status: "APROVADA" }, esc).cor).toBe("wathet");
  });

  it("traz base, itens com quantidade, data e o andamento", () => {
    const { linhas } = cartaoPedido(
      {
        ...base,
        status: "APROVADA",
        historico: [...base.historico, { status: "APROVADA", quando: new Date("2026-11-25T18:00:00Z"), quem: "Beto", nota: "ok, pode separar" }],
      },
      esc,
    );
    const texto = linhas.join("\n");
    expect(texto).toContain("BHZ01 — Belo Horizonte");
    expect(texto).toContain("Fita adesiva (FIT01): **10 UN**");
    expect(texto).toContain("Andamento");
    expect(texto).toContain("Solicitada** · Ana");
    expect(texto).toContain("Aprovada** · Beto — ok, pode separar");
  });

  it("o aviso do evento aparece só para quem o recebe (edição silenciosa não leva)", () => {
    const com = cartaoPedido({ ...base, status: "APROVADA", ultima: { titulo: "Nova para separar: SOL-000007", corpo: "Base BHZ01." } }, esc).linhas.join("\n");
    const sem = cartaoPedido({ ...base, status: "APROVADA" }, esc).linhas.join("\n");
    expect(com).toContain("🔔 **Nova para separar: SOL-000007** — Base BHZ01.");
    expect(sem).not.toContain("🔔");
  });

  it("mostra só as últimas entradas do andamento", () => {
    const muitas = Array.from({ length: MAX_ANDAMENTO_NO_CARTAO + 3 }, (_, i) => ({ status: null, quando: new Date(2026, 10, 25, 8, i), quem: `Pessoa${i}`, nota: null }));
    const texto = cartaoPedido({ ...base, status: "APROVADA", historico: muitas }, esc).linhas.join("\n");
    expect(texto).not.toContain("Pessoa0");
    expect(texto).toContain(`Pessoa${MAX_ANDAMENTO_NO_CARTAO + 2}`);
  });
});
