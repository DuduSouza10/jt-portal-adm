import type { Prioridade, SolicitacaoStatus } from "@/generated/prisma/enums";

/**
 * Regras puras de solicitações, separação e expedição (sem banco — testadas em rules.test.ts).
 * Fluxo (S4): PENDENTE → APROVADA → EM_SEPARACAO → SEPARADA → ENVIADA → RECEBIDA,
 * com RECUSADA (só de PENDENTE) e CANCELADA (de PENDENTE ou APROVADA).
 */

export type Acao = "aprovar" | "recusar" | "cancelar" | "iniciarSeparacao" | "separar" | "enviar" | "receber";

const FROM: Record<Acao, SolicitacaoStatus[]> = {
  aprovar: ["PENDENTE"],
  recusar: ["PENDENTE"],
  cancelar: ["PENDENTE", "APROVADA"],
  iniciarSeparacao: ["APROVADA"],
  separar: ["APROVADA", "EM_SEPARACAO"],
  enviar: ["SEPARADA"],
  receber: ["ENVIADA"],
};

export const TO: Record<Acao, SolicitacaoStatus> = {
  aprovar: "APROVADA",
  recusar: "RECUSADA",
  cancelar: "CANCELADA",
  iniciarSeparacao: "EM_SEPARACAO",
  separar: "SEPARADA",
  enviar: "ENVIADA",
  receber: "RECEBIDA",
};

/** Nome do status como a base vê (E9: separado, na expedição, enviado). */
export const STATUS_LABEL: Record<SolicitacaoStatus, string> = {
  PENDENTE: "Aguardando aprovação",
  APROVADA: "Aprovada",
  EM_SEPARACAO: "Em separação",
  SEPARADA: "Separada · na expedição",
  ENVIADA: "Enviada",
  RECEBIDA: "Recebida",
  RECUSADA: "Recusada",
  CANCELADA: "Cancelada",
};

export const PRIORIDADE_LABEL: Record<Prioridade, string> = { NORMAL: "Normal", URGENTE: "Urgente" };

/** Etapas mostradas na linha de progresso da base. */
export const ETAPAS: SolicitacaoStatus[] = ["PENDENTE", "APROVADA", "EM_SEPARACAO", "SEPARADA", "ENVIADA", "RECEBIDA"];

export const ABERTOS: SolicitacaoStatus[] = ["PENDENTE", "APROVADA", "EM_SEPARACAO", "SEPARADA", "ENVIADA"];

/** Mensagem de erro se a ação não vale para o status atual, ou null. */
export function transitionError(acao: Acao, status: SolicitacaoStatus, number: string): string | null {
  if (FROM[acao].includes(status)) return null;
  if (acao === "enviar") {
    if (status === "ENVIADA" || status === "RECEBIDA") return `${number} já foi enviada.`;
    if (status === "CANCELADA" || status === "RECUSADA") return `${number} foi ${status === "CANCELADA" ? "cancelada" : "recusada"}. Não envie.`;
    return `${number} ainda está "${STATUS_LABEL[status]}": o almoxarifado não terminou de separar.`;
  }
  return `Não dá para fazer isso: ${number} está "${STATUS_LABEL[status]}".`;
}

/** SOL-000123 */
export const formatNumber = (n: number) => `SOL-${String(n).padStart(6, "0")}`;

// ------------------------------------------------------------------ Leitura da guia (expedição)

export type ScanCode = { id: string } | { number: number } | null;

/**
 * Interpreta o que o leitor (ou a digitação) entregou na tela da expedição.
 * O QR da guia traz o link do pedido (".../solicitacoes/<id>"); também aceita "SOL-000123", "SOL123" ou "123".
 */
export function parseScan(raw: string): ScanCode {
  const text = raw.trim();
  if (!text) return null;
  const link = text.match(/\/solicitacoes\/([A-Za-z0-9_-]{10,})/);
  if (link) return { id: link[1] };
  const num = text.toUpperCase().match(/^(?:SOL-?)?0*(\d{1,9})$/);
  if (num && Number(num[1]) > 0) return { number: Number(num[1]) };
  return null;
}

// ------------------------------------------------------------------ Quantidades

type Linha = { produtoId: string; label: string; max: number };

/**
 * Valida as quantidades informadas (aprovação ou separação) contra o máximo de cada item.
 * Ausente = máximo. Retorna o mapa produto → quantidade e se ficou parcial.
 */
export function planQuantities(linhas: Linha[], informado: Record<string, number | undefined>, opts: { etapa: string }) {
  const out = new Map<string, number>();
  let partial = false;
  for (const l of linhas) {
    const q = informado[l.produtoId] ?? l.max;
    if (!Number.isInteger(q) || q < 0) throw new Error(`${l.label}: quantidade inválida.`);
    if (q > l.max) throw new Error(`${l.label}: ${opts.etapa} ${q}, mas o máximo é ${l.max}.`);
    if (q < l.max) partial = true;
    out.set(l.produtoId, q);
  }
  if ([...out.values()].every((q) => q === 0)) throw new Error(`Informe ao menos um item com quantidade maior que zero.`);
  return { quantities: out, partial };
}
