/**
 * Quem é avisado de cada evento de uma solicitação, e com que texto (S7 em docs/regras-de-negocio.md).
 * Funções PURAS (testadas em notify-rules.test.ts). Quem resolve os públicos em usuários e grava é notify.ts.
 *
 * Igual ao sistema antigo de insumos: o sino do portal + cartão no Feishu, para "a outra parte" do evento.
 */
import type { SolicitacaoStatus } from "@/generated/prisma/enums";
import type { Template } from "@/lib/feishu/cards";
import { fmtDateTime } from "@/lib/format";
import { STATUS_LABEL } from "./rules";

/**
 * Públicos:
 * - aprovadores: quem tem `solicitacoes.aprovar` com alcance sobre a base que pediu;
 * - base: quem fez o pedido + quem pede por aquela base (`solicitacoes.criar`, vinculado à base);
 * - separacao: quem tem `expedicao.separar` com alcance sobre o almoxarifado que atende;
 * - expedicao: quem tem `expedicao.enviar` com alcance sobre o almoxarifado que atende.
 */
export type Publico = "aprovadores" | "base" | "separacao" | "expedicao";

export type Evento =
  | { tipo: "criada" }
  | { tipo: "status"; to: SolicitacaoStatus; from: SolicitacaoStatus; nota?: string | null; parcial?: boolean }
  | { tipo: "comentario"; texto: string }
  | { tipo: "itemCancelado"; item: string; motivo: string };

export type Contexto = {
  number: string; // SOL-000123
  baseCode: string;
  baseName: string;
  urgente: boolean;
  temAlmoxarifado: boolean;
  /** O pedido já está com a expedição (separado ou enviado): mensagem da base também vai para a expedição. */
  naExpedicao?: boolean;
  /** Quem fez a ação é "da base" (fez o pedido ou pede por aquela base)? */
  atorDaBase: boolean;
  atorNome: string;
};

export type Aviso = {
  publico: Publico;
  titulo: string;
  corpo: string;
  cor: Template;
  /** Link: "pedido" = página da solicitação; "expedicao" e "separacao" = filas. */
  link: "pedido" | "expedicao" | "separacao";
};

const COR: Record<SolicitacaoStatus, Template> = {
  PENDENTE: "blue",
  APROVADA: "wathet",
  EM_SEPARACAO: "orange",
  SEPARADA: "violet",
  ENVIADA: "turquoise",
  RECEBIDA: "green",
  RECUSADA: "carmine",
  CANCELADA: "grey",
};

const cut = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

export function avisos(e: Evento, c: Contexto): Aviso[] {
  const n = c.number;
  const statusDaBase = (to: SolicitacaoStatus, corpo = "", parcial = false): Aviso => ({
    publico: "base",
    titulo: `${n}: ${STATUS_LABEL[to]}${parcial ? " (parcial)" : ""}`,
    corpo: cut(corpo),
    cor: parcial ? "yellow" : COR[to],
    link: "pedido",
  });

  switch (e.tipo) {
    case "criada":
      return [
        {
          publico: "aprovadores",
          titulo: `${c.urgente ? "🔥 URGENTE · " : ""}Nova solicitação ${n}`,
          corpo: `Base ${c.baseCode}. Aguardando aprovação.`,
          cor: c.urgente ? "red" : "blue",
          link: "pedido",
        },
      ];

    case "comentario": {
      const corpo = cut(`${c.atorNome}: ${e.texto}`);
      const titulo = `Novo comentário em ${n}`;
      if (!c.atorDaBase) return [{ publico: "base", titulo, corpo, cor: "wathet", link: "pedido" }];
      const out: Aviso[] = [{ publico: "aprovadores", titulo, corpo, cor: "wathet", link: "pedido" }];
      if (c.temAlmoxarifado) out.push({ publico: "separacao", titulo, corpo, cor: "wathet", link: "pedido" });
      if (c.naExpedicao) out.push({ publico: "expedicao", titulo, corpo, cor: "wathet", link: "pedido" });
      return out;
    }

    case "itemCancelado":
      // S17: quem aprova tirou um item; quem pediu precisa saber qual e por quê.
      return [{ publico: "base", titulo: `${n}: item cancelado`, corpo: cut(`${e.item}. Motivo: ${e.motivo}`), cor: "yellow", link: "pedido" }];

    case "status":
      switch (e.to) {
        case "APROVADA":
          return [
            statusDaBase("APROVADA", e.nota ?? ""),
            { publico: "separacao", titulo: `Nova para separar: ${n}`, corpo: `Base ${c.baseCode}.`, cor: c.urgente ? "red" : "orange", link: "separacao" },
          ];
        case "RECUSADA":
          return [statusDaBase("RECUSADA", e.nota ? `Motivo: ${e.nota}` : "")];
        case "CANCELADA": {
          const corpo = e.nota ? `Motivo: ${e.nota}` : "";
          // Cancelou quem pediu: avisa quem aprova (e o almoxarifado, se já estava aprovada). Senão, avisa a base.
          const out: Aviso[] = c.atorDaBase
            ? [{ publico: "aprovadores", titulo: `${n} cancelada pela base`, corpo: cut(corpo), cor: "grey", link: "pedido" }]
            : [statusDaBase("CANCELADA", corpo)];
          if (c.temAlmoxarifado && e.from !== "PENDENTE")
            out.push({ publico: "separacao", titulo: `${n} cancelada: não separar`, corpo: cut(corpo), cor: "grey", link: "pedido" });
          return out;
        }
        case "EM_SEPARACAO":
          return [statusDaBase("EM_SEPARACAO")];
        case "SEPARADA":
          return [
            statusDaBase("SEPARADA", e.parcial ? "Separada com menos itens que o aprovado." : "", !!e.parcial),
            {
              publico: "expedicao",
              titulo: `Pronto para envio: ${n}`,
              corpo: `Base ${c.baseCode}${e.parcial ? " · separação parcial" : ""}. Carregar e confirmar o envio.`,
              cor: "green",
              link: "expedicao",
            },
          ];
        case "ENVIADA":
          return [statusDaBase("ENVIADA", e.nota ?? "")];
        case "RECEBIDA":
          return [{ publico: "separacao", titulo: `${n}: recebida pela base`, corpo: cut(e.nota ?? ""), cor: "green", link: "pedido" }];
        default:
          return [];
      }
  }
}

/** Rota no Feishu de cada público (ver lib/feishu/outbox.ts). */
export const ROTA = { aprovadores: "equipe", separacao: "equipe", expedicao: "expedicao", base: "base" } as const;

/** Item do pedido como o cartão do Feishu mostra. */
export type ItemResumo = { codigo: string; nome: string; unidade: string; pedido: number; aprovado: number | null; separado: number | null; cancelado?: boolean };
export type OutroItemResumo = { nome: string; quantity: number };

/** Quantos itens aparecem no cartão; o resto vira "e mais N". O cartão do Feishu tem limite de tamanho. */
export const MAX_ITENS_NO_CARTAO = 15;

/**
 * Linhas do cartão do Feishu com o pedido em si: quando foi feito, o status de agora e o que foi pedido, com as
 * quantidades (e o que foi aprovado/separado, se for diferente do pedido). Pura (testada em notify-rules.test.ts).
 * `escape` é o escapeMd do Feishu (texto digitado pelo usuário não pode virar tag).
 */
export function resumoPedido(
  p: { criadaEm: Date; status: SolicitacaoStatus; itens: ItemResumo[]; outros?: OutroItemResumo[] },
  escape: (s: string) => string,
): string[] {
  const itens = p.itens.filter((i) => !i.cancelado);
  const linhasItens = itens.map((i) => {
    const extras: string[] = [];
    if (i.aprovado !== null && i.aprovado !== i.pedido) extras.push(`aprovado ${i.aprovado}`);
    if (i.separado !== null && i.separado !== (i.aprovado ?? i.pedido)) extras.push(`separado ${i.separado}`);
    return `• ${escape(i.nome)} (${escape(i.codigo)}): **${i.pedido} ${escape(i.unidade)}**${extras.length ? ` · ${extras.join(" · ")}` : ""}`;
  });
  const linhasOutros = (p.outros ?? []).map((o) => `• ${escape(o.nome)}: **${o.quantity}** · fora do cadastro`);
  const todas = [...linhasItens, ...linhasOutros];
  const mostradas = todas.slice(0, MAX_ITENS_NO_CARTAO);
  if (todas.length > mostradas.length) mostradas.push(`• … e mais ${todas.length - mostradas.length} item(ns). Veja todos na solicitação.`);
  return [
    `**Solicitada em:** ${fmtDateTime(p.criadaEm)}   **Status atual:** ${STATUS_LABEL[p.status]}`,
    todas.length ? `**Itens pedidos (${todas.length}):**\n${mostradas.join("\n")}` : "",
  ];
}
