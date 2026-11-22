/**
 * Precificação (regras puras). O preço de um produto é o custo médio unitário (R$) dele no estoque
 * (StockBalance.avgCost), que as NFs de entrada atualizam (K5) e que a tela de precificação permite
 * alterar à mão (P6). Envios antigos guardam o preço da época (SolicitacaoItem.unitCost).
 */

import { MAX_UNIT_COST } from "@/modules/estoque/rules";

export const round4 = (v: number) => Math.round(v * 10_000) / 10_000;

/**
 * Preço atual a partir dos custos médios do produto em cada almoxarifado (0 = sem custo, ignorado).
 * Se os almoxarifados tiverem custos diferentes (NFs diferentes), `varia` = true e `valor` é o maior.
 */
export function resumoPreco(custos: number[]): { valor: number | null; varia: boolean; min: number | null; max: number | null } {
  const c = custos.filter((x) => x > 0).map(round4);
  if (!c.length) return { valor: null, varia: false, min: null, max: null };
  const min = Math.min(...c);
  const max = Math.max(...c);
  return { valor: max, varia: max - min >= 0.0001, min, max };
}

/** Valida o preço digitado. Devolve a mensagem de erro (em português, traduzida no cliente) ou null. */
export function erroPreco(valor: number | null): string | null {
  if (valor == null || !Number.isFinite(valor)) return "Informe o preço em reais (ex.: 12,50).";
  if (valor <= 0) return "O preço precisa ser maior que zero.";
  if (valor > MAX_UNIT_COST) return "Preço acima do limite permitido.";
  return null;
}

/** Variação % entre o preço anterior e o novo (null sem preço anterior). */
export const variacaoPreco = (anterior: number | null, novo: number) => (anterior && anterior > 0 ? ((novo - anterior) / anterior) * 100 : null);
