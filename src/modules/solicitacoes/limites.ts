import type { SolicitacaoStatus } from "@/generated/prisma/enums";

/**
 * Regras de pedido trazidas do portal do Eduardo (jt-portal-insumos) — PURAS, testadas em limites.test.ts.
 *
 * S1. Ciclo de 3 meses: só base (tipo BASE; franquia não tem). Ao pedir, a base fica sem poder abrir pedido
 *     novo por 3 meses; quando o pedido é ENVIADO, os 3 meses passam a contar do envio. O ciclo cai se o
 *     pedido de origem for recusado ou cancelado.
 * S2. A base informa o número de pessoas em cada pedido (obrigatório). Não limita quantidade: é informativo.
 * S3. Limite por produto: limite para base e para franquia, num período (padrão 60 dias). Soma o que a
 *     base pediu no período (pedidos que não foram recusados/cancelados). Atingiu o limite: o produto fica
 *     bloqueado para a base até o fim do período. Recusar/cancelar o pedido desfaz o bloqueio.
 * Quem aprova (solicitacoes.aprovar) não entra nas regras, como o admin no sistema do Eduardo.
 */

export const CYCLE_MONTHS = 3;
export const DEFAULT_LIMIT_DAYS = 60;
export const MAX_PEOPLE = 99_999;

/** Pedidos que contam para o limite e mantêm ciclo/bloqueio de pé. */
export const COUNTED: SolicitacaoStatus[] = ["PENDENTE", "APROVADA", "EM_SEPARACAO", "SEPARADA", "ENVIADA", "RECEBIDA"];

/** Soma meses de calendário (31/jan + 1 mês = 28 ou 29/fev). */
export function addMonths(d: Date, months: number) {
  const r = new Date(d);
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + months);
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}

type Hold = { blockedUntil: Date; revokedAt: Date | null; sourceStatus: SolicitacaoStatus | null };

/** Ciclo ou bloqueio está valendo agora? */
export function holdActive(h: Hold | null | undefined, now: Date) {
  if (!h || h.revokedAt || h.blockedUntil <= now) return false;
  return h.sourceStatus === null || COUNTED.includes(h.sourceStatus);
}

export function limitFor(p: { limitBase: number | null; limitFranquia: number | null }, baseType: "BASE" | "FRANQUIA" | "ALMOXARIFADO") {
  if (baseType === "BASE") return p.limitBase;
  if (baseType === "FRANQUIA") return p.limitFranquia;
  return null;
}

/** Erro do limite do produto (mensagens iguais às do sistema do Eduardo) ou null. */
export function limitError(name: string, unit: string, limit: number | null, used: number, requested: number) {
  if (limit == null || limit <= 0) return null;
  if (requested > limit) return `Limite de insumos excedido para ${name}. Limite permitido: ${limit} ${unit}.`;
  if (used >= limit) return `Você já atingiu o limite de ${limit} ${unit} para ${name}.`;
  if (used + requested > limit) return `Limite de insumos excedido para ${name}. Restam ${limit - used} ${unit} no período de bloqueio.`;
  return null;
}

/** Início do período que conta para o limite: N dias atrás, ou a liberação manual do bloqueio, se for mais recente. */
export function periodStart(now: Date, days: number, revokedAt: Date | null | undefined) {
  const start = new Date(now.getTime() - Math.max(1, days) * 86_400_000);
  return revokedAt && revokedAt > start ? revokedAt : start;
}
