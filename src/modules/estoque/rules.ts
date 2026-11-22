import { DomainError } from "@/lib/errors";

/**
 * Regras puras do estoque (K1–K4 em docs/regras-de-negocio.md). Sem banco: testadas em rules.test.ts.
 *
 * O service trava a linha do saldo (SELECT … FOR UPDATE), chama `applyMovement` e grava o resultado.
 * Assim a regra fica num lugar só e duas operações simultâneas no mesmo produto nunca se atropelam.
 */

export type Balance = { quantity: number; reserved: number };

export type Operation =
  | { type: "ENTRADA" | "TRANSFERENCIA_ENTRADA"; quantity: number }
  | { type: "SAIDA" | "TRANSFERENCIA_SAIDA"; quantity: number }
  | { type: "INVENTARIO"; counted: number }
  | { type: "RESERVA"; quantity: number }
  | { type: "LIBERACAO"; quantity: number }
  | { type: "BAIXA"; quantity: number };

export type MovementResult = Balance & {
  /** variação do físico */
  delta: number;
  /** variação do reservado */
  reservedDelta: number;
  /** inventário abaixo do reservado: o disponível ficou negativo (K3) */
  warning?: "DISPONIVEL_NEGATIVO";
};

/** Maior quantidade aceita numa linha. Evita erro de digitação (ex.: 1000000 no lugar de 100). */
export const MAX_QTY = 1_000_000;

export const available = (b: Balance) => b.quantity - b.reserved;

function assertQty(q: number, { allowZero = false } = {}) {
  if (!Number.isInteger(q)) throw new DomainError("Quantidade precisa ser um número inteiro.");
  if (allowZero ? q < 0 : q <= 0) throw new DomainError("Quantidade precisa ser maior que zero.");
  if (q > MAX_QTY) throw new DomainError(`Quantidade acima do limite de ${MAX_QTY.toLocaleString("pt-BR")}.`);
}

export function applyMovement(b: Balance, op: Operation): MovementResult {
  switch (op.type) {
    case "ENTRADA":
    case "TRANSFERENCIA_ENTRADA":
      assertQty(op.quantity);
      return { quantity: b.quantity + op.quantity, reserved: b.reserved, delta: op.quantity, reservedDelta: 0 };

    case "SAIDA":
    case "TRANSFERENCIA_SAIDA":
      assertQty(op.quantity);
      // Não pode tirar o que já está prometido para solicitações aprovadas.
      if (op.quantity > available(b))
        throw new DomainError(`Saldo disponível insuficiente (disponível: ${Math.max(0, available(b))}).`);
      return { quantity: b.quantity - op.quantity, reserved: b.reserved, delta: -op.quantity, reservedDelta: 0 };

    case "INVENTARIO": {
      // K3: o inventário DEFINE o físico para a quantidade contada (nunca negativa).
      assertQty(op.counted, { allowZero: true });
      const result: MovementResult = {
        quantity: op.counted,
        reserved: b.reserved,
        delta: op.counted - b.quantity,
        reservedDelta: 0,
      };
      if (op.counted < b.reserved) result.warning = "DISPONIVEL_NEGATIVO";
      return result;
    }

    case "RESERVA":
      assertQty(op.quantity);
      if (op.quantity > available(b))
        throw new DomainError(`Saldo disponível insuficiente para reservar (disponível: ${Math.max(0, available(b))}).`);
      return { quantity: b.quantity, reserved: b.reserved + op.quantity, delta: 0, reservedDelta: op.quantity };

    case "LIBERACAO":
      assertQty(op.quantity);
      if (op.quantity > b.reserved) throw new DomainError("Liberação maior que o reservado.");
      return { quantity: b.quantity, reserved: b.reserved - op.quantity, delta: 0, reservedDelta: -op.quantity };

    case "BAIXA":
      assertQty(op.quantity);
      if (op.quantity > b.reserved) throw new DomainError("Baixa maior que o reservado.");
      // Pode acontecer depois de um inventário que achou menos do que o reservado.
      if (op.quantity > b.quantity)
        throw new DomainError(`Saldo físico insuficiente para o envio (físico: ${b.quantity}).`);
      return {
        quantity: b.quantity - op.quantity,
        reserved: b.reserved - op.quantity,
        delta: -op.quantity,
        reservedDelta: -op.quantity,
      };
  }
}

export type ItemInput = { produtoId: string; quantity: number };

/**
 * Junta linhas repetidas do mesmo produto, valida as quantidades e ordena por produtoId.
 * A ordem fixa faz todas as transações travarem as linhas na mesma sequência (evita deadlock).
 */
export function normalizeItems(items: ItemInput[], opts: { allowZero?: boolean } = {}): ItemInput[] {
  if (!items.length) throw new DomainError("Informe ao menos um produto.");
  const map = new Map<string, number>();
  for (const it of items) {
    if (!it.produtoId) throw new DomainError("Produto não informado.");
    assertQty(it.quantity, opts);
    map.set(it.produtoId, (map.get(it.produtoId) ?? 0) + it.quantity);
  }
  for (const q of map.values()) assertQty(q, opts);
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([produtoId, quantity]) => ({ produtoId, quantity }));
}

/**
 * Envio de uma solicitação (K4): baixa o que foi enviado e libera o resto da reserva.
 * `shipped` ausente = enviou tudo o que estava reservado.
 */
export function planShipment(reserved: number, shipped?: number): { baixa: number; liberacao: number } {
  const s = shipped ?? reserved;
  if (!Number.isInteger(s) || s < 0) throw new DomainError("Quantidade enviada inválida.");
  if (s > reserved) throw new DomainError(`Envio maior que o reservado (${reserved}).`);
  return { baixa: s, liberacao: reserved - s };
}

// ------------------------------------------------------------------ Custo (valor dos insumos)

/** Maior custo unitário aceito (R$). Evita erro de digitação. */
export const MAX_UNIT_COST = 10_000_000;

const round4 = (v: number) => Math.round(v * 10_000) / 10_000;

/**
 * Custo médio ponderado (K5). Puro.
 * - Entrada (e transferência recebida, ao custo da origem): pondera pelo valor unitário da NF.
 *   Saldo sem custo conhecido (custo 0) não pesa: o custo passa a ser o da entrada.
 * - Inventário que achou a mais: só pondera se vier valor; senão mantém o custo.
 * - Saída, transferência enviada e baixa: não mudam o custo médio; o movimento grava o custo médio.
 * - Reserva e liberação: sem valor.
 * Devolve o novo custo médio e o custo unitário a gravar no movimento (null = sem custo).
 */
export function applyCost(before: { quantity: number; avgCost: number }, op: Operation, delta: number, unitCost?: number | null) {
  const avg = before.avgCost;
  const known = (c: number) => (c > 0 ? c : null);
  const weigh = (q: number, c: number) => (before.quantity > 0 && avg > 0 ? round4((before.quantity * avg + q * c) / (before.quantity + q)) : round4(c));
  switch (op.type) {
    case "ENTRADA":
    case "TRANSFERENCIA_ENTRADA":
      if (unitCost == null) return { avgCost: avg, unitCost: null };
      return { avgCost: weigh(delta, unitCost), unitCost: round4(unitCost) };
    case "INVENTARIO":
      if (delta > 0 && unitCost != null) return { avgCost: weigh(delta, unitCost), unitCost: round4(unitCost) };
      return { avgCost: avg, unitCost: known(avg) };
    case "SAIDA":
    case "TRANSFERENCIA_SAIDA":
    case "BAIXA":
      return { avgCost: avg, unitCost: known(avg) };
    case "RESERVA":
    case "LIBERACAO":
      return { avgCost: avg, unitCost: null };
  }
}

/**
 * Valor unitário por produto quando a mesma NF repete o produto em várias linhas: média ponderada.
 * Se alguma linha do produto vier sem valor, o produto fica sem valor (não dá para ponderar).
 */
export function mergeUnitCosts(items: { produtoId: string; quantity: number; unitCost?: number | null }[]) {
  const acc = new Map<string, { q: number; v: number; missing: boolean }>();
  for (const it of items) {
    const a = acc.get(it.produtoId) ?? { q: 0, v: 0, missing: false };
    if (it.unitCost == null) a.missing = true;
    else a.v += it.quantity * it.unitCost;
    a.q += it.quantity;
    acc.set(it.produtoId, a);
  }
  return new Map([...acc].map(([id, a]) => [id, a.missing || !a.q ? null : round4(a.v / a.q)]));
}
