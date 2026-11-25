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
export function planQuantities(linhas: Linha[], informado: Record<string, number | undefined>, opts: { etapa: string; permitirVazio?: boolean }) {
  const out = new Map<string, number>();
  let partial = false;
  for (const l of linhas) {
    const q = informado[l.produtoId] ?? l.max;
    if (!Number.isInteger(q) || q < 0) throw new Error(`${l.label}: quantidade inválida.`);
    if (q > l.max) throw new Error(`${l.label}: ${opts.etapa} ${q}, mas o máximo é ${l.max}.`);
    if (q < l.max) partial = true;
    out.set(l.produtoId, q);
  }
  // Pedido só com itens digitados (fora do cadastro) não tem nada de estoque para reservar ou separar.
  if (!opts.permitirVazio && [...out.values()].every((q) => q === 0)) throw new Error(`Informe ao menos um item com quantidade maior que zero.`);
  return { quantities: out, partial };
}

// ------------------------------------------------------------------ Cancelar item (S17)

/** Item digitado fora do cadastro (texto livre); `cancelado` aparece quando quem aprova o tirou do pedido. */
export type OutroItem = { nome: string; quantity: number; cancelado?: { motivo: string; em: string } };

/** Mensagem de erro se não dá para tirar um item agora, ou null. `ativos` = itens ainda valendo, contando este. */
export function cancelarItemError(status: SolicitacaoStatus, number: string, ativos: number): string | null {
  if (status !== "PENDENTE") return `Só dá para tirar um item enquanto ${number} aguarda aprovação.`;
  if (ativos <= 1) return "Este é o único item que sobrou. Para encerrar o pedido, use Recusar ou Cancelar pedido.";
  return null;
}

// ------------------------------------------------------------------ Abas da lista

export type AbaKey = "abertas" | "PENDENTE" | "APROVADA" | "EM_SEPARACAO" | "SEPARADA" | "ENVIADA" | "RECEBIDA" | "ENCERRADAS";

/** Abas da lista de solicitações, na ordem do fluxo. A primeira é a padrão. */
export const ABAS: { key: AbaKey; statuses: SolicitacaoStatus[]; final: boolean }[] = [
  { key: "abertas", statuses: ABERTOS, final: false },
  { key: "PENDENTE", statuses: ["PENDENTE"], final: false },
  { key: "APROVADA", statuses: ["APROVADA"], final: false },
  { key: "EM_SEPARACAO", statuses: ["EM_SEPARACAO"], final: false },
  { key: "SEPARADA", statuses: ["SEPARADA"], final: false },
  { key: "ENVIADA", statuses: ["ENVIADA"], final: false },
  { key: "RECEBIDA", statuses: ["RECEBIDA"], final: true },
  { key: "ENCERRADAS", statuses: ["RECUSADA", "CANCELADA"], final: true },
];

/** Aba pedida na URL (?status=...). Vale um status ou "ENCERRADAS"; qualquer outra coisa é "abertas". */
export function abaDe(param: string | undefined) {
  return ABAS.find((a) => a.key === param && a.key !== "abertas") ?? ABAS[0]!;
}

/** Soma da aba a partir da contagem por status. */
export const totalDaAba = (aba: { statuses: SolicitacaoStatus[] }, porStatus: Partial<Record<SolicitacaoStatus, number>>) =>
  aba.statuses.reduce((n, st) => n + (porStatus[st] ?? 0), 0);
