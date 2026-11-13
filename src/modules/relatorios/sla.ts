/**
 * SLA das solicitações por etapa e valores — cálculos PUROS (testados em sla.test.ts).
 *
 * Cada etapa começa quando a solicitação passa a ser responsabilidade de alguém (S9):
 *   aprovação  : criada    → aprovada   (quem aprova)
 *   separação  : aprovada  → separada   (almoxarifado)
 *   expedição  : separada  → enviada    (expedição)
 *   entrega    : enviada   → recebida   (transporte; só informativo, em horas corridas)
 * Aprovação, separação e expedição contam em horas ÚTEIS e têm prazo (normal/urgente) configurável.
 */
import type { Prioridade, SolicitacaoStatus } from "@/generated/prisma/enums";
import { businessMinutesBetween, type BusinessHours } from "@/lib/sla";

export type StageKey = "aprovacao" | "separacao" | "expedicao" | "entrega";
export const STAGES: StageKey[] = ["aprovacao", "separacao", "expedicao", "entrega"];
export const TARGET_STAGES = ["aprovacao", "separacao", "expedicao"] as const;
export type TargetStage = (typeof TARGET_STAGES)[number];
export type Targets = Record<TargetStage, { normal: number; urgente: number }>;

export type SlaOrder = {
  id: string;
  number: number;
  status: SolicitacaoStatus;
  priority: Prioridade;
  createdAt: Date;
  approvedAt: Date | null;
  separatedAt: Date | null;
  shippedAt: Date | null;
  receivedAt: Date | null;
  base: { id: string; code: string; name: string };
  almoxarifado: { id: string; code: string; name: string } | null;
};

const RANGE: Record<StageKey, { from: keyof SlaOrder; to: keyof SlaOrder; running: SolicitacaoStatus[] }> = {
  aprovacao: { from: "createdAt", to: "approvedAt", running: ["PENDENTE"] },
  separacao: { from: "approvedAt", to: "separatedAt", running: ["APROVADA", "EM_SEPARACAO"] },
  expedicao: { from: "separatedAt", to: "shippedAt", running: ["SEPARADA"] },
  entrega: { from: "shippedAt", to: "receivedAt", running: ["ENVIADA"] },
};

export type StageTime = {
  /** Horas da etapa (úteis; corridas na entrega). null = etapa não começou. */
  hours: number | null;
  /** A etapa ainda está correndo (sem o "para"). */
  running: boolean;
  /** Prazo em horas (null na entrega). */
  target: number | null;
  /** Dentro do prazo? null = sem prazo ou não começou. Etapa correndo e já estourada conta como fora. */
  ok: boolean | null;
};

export function targetFor(stage: StageKey, priority: Prioridade, targets: Targets): number | null {
  if (stage === "entrega") return null;
  return priority === "URGENTE" ? targets[stage].urgente : targets[stage].normal;
}

export function stageTime(o: SlaOrder, stage: StageKey, now: Date, bh: BusinessHours, targets: Targets): StageTime {
  const r = RANGE[stage];
  const from = o[r.from] as Date | null;
  const to = o[r.to] as Date | null;
  const target = targetFor(stage, o.priority, targets);
  const running = !to && r.running.includes(o.status);
  if (!from || (!to && !running)) return { hours: null, running: false, target, ok: null };
  const end = to ?? now;
  const hours = stage === "entrega" ? (end.getTime() - from.getTime()) / 3_600_000 : businessMinutesBetween(from, end, bh) / 60;
  let ok: boolean | null = null;
  if (target !== null) ok = running ? (hours > target ? false : null) : hours <= target;
  return { hours, running, target, ok };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (n: number, d: number) => (d ? (n / d) * 100 : null);

export type StageSummary = {
  /** Etapas concluídas no grupo. */
  done: number;
  avgHours: number | null;
  /** % das concluídas dentro do prazo. */
  okPct: number | null;
  /** Concluídas fora do prazo + correndo e já estouradas. */
  late: number;
  /** Correndo agora (ainda dentro ou fora do prazo). */
  running: number;
};

export function summarize(orders: SlaOrder[], now: Date, bh: BusinessHours, targets: Targets): Record<StageKey, StageSummary> {
  const out = {} as Record<StageKey, StageSummary>;
  for (const s of STAGES) {
    const times = orders.map((o) => stageTime(o, s, now, bh, targets)).filter((t) => t.hours !== null);
    const done = times.filter((t) => !t.running);
    out[s] = {
      done: done.length,
      avgHours: avg(done.map((t) => t.hours!)),
      okPct: s === "entrega" ? null : pct(done.filter((t) => t.ok).length, done.length),
      late: times.filter((t) => t.ok === false).length,
      running: times.filter((t) => t.running).length,
    };
  }
  return out;
}

/** Agrupa (por base, por almoxarifado...) e resume cada grupo. Ordena pelo total de solicitações. */
export function summarizeBy<K extends { id: string; code: string; name: string }>(
  orders: SlaOrder[],
  key: (o: SlaOrder) => K | null,
  now: Date,
  bh: BusinessHours,
  targets: Targets,
) {
  const groups = new Map<string, { key: K; list: SlaOrder[] }>();
  for (const o of orders) {
    const k = key(o);
    if (!k) continue;
    const g = groups.get(k.id) ?? { key: k, list: [] };
    g.list.push(o);
    groups.set(k.id, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g.key, total: g.list.length, stages: summarize(g.list, now, bh, targets) }))
    .sort((a, b) => b.total - a.total || a.code.localeCompare(b.code));
}

/** Solicitações com alguma etapa correndo e já fora do prazo, da mais atrasada para a menos. */
export function lateNow(orders: SlaOrder[], now: Date, bh: BusinessHours, targets: Targets) {
  return orders
    .flatMap((o) =>
      TARGET_STAGES.flatMap((s) => {
        const t = stageTime(o, s, now, bh, targets);
        return t.running && t.ok === false ? [{ order: o, stage: s, hours: t.hours!, target: t.target!, ratio: t.hours! / t.target! }] : [];
      }),
    )
    .sort((a, b) => b.ratio - a.ratio);
}

// ------------------------------------------------------------------ Valores

type Ref = { id: string; code: string; name: string };
export type SpendLine = { base: Ref; regional: Ref; produto: Ref; quantity: number; unitCost: number | null; shippedAt: Date };

/** Gasto (R$) por base e por produto: quantidade enviada × custo no envio. Linhas sem custo contam à parte. */
export function spendBy(lines: SpendLine[]) {
  const byBase = new Map<string, { id: string; code: string; name: string; value: number; semCusto: number }>();
  const byRegional = new Map<string, { id: string; code: string; name: string; value: number }>();
  const byProduto = new Map<string, { id: string; code: string; name: string; value: number; quantity: number }>();
  let total = 0;
  let semCusto = 0;
  for (const l of lines) {
    const b = byBase.get(l.base.id) ?? { ...l.base, value: 0, semCusto: 0 };
    const p = byProduto.get(l.produto.id) ?? { ...l.produto, value: 0, quantity: 0 };
    p.quantity += l.quantity;
    if (l.unitCost == null) {
      b.semCusto += l.quantity;
      semCusto += l.quantity;
    } else {
      const v = l.quantity * l.unitCost;
      b.value += v;
      p.value += v;
      const r = byRegional.get(l.regional.id) ?? { ...l.regional, value: 0 };
      r.value += v;
      byRegional.set(l.regional.id, r);
      total += v;
    }
    byBase.set(l.base.id, b);
    byProduto.set(l.produto.id, p);
  }
  const sort = <T extends { value: number; code: string }>(xs: T[]) => xs.sort((a, b) => b.value - a.value || a.code.localeCompare(b.code));
  return { total, semCusto, byBase: sort([...byBase.values()]), byRegional: sort([...byRegional.values()]), byProduto: sort([...byProduto.values()]) };
}

/** Início e fim (exclusivo) de um mês "AAAA-MM" no fuso de São Paulo. Mês inválido = mês de `now`. */
export function monthRange(mes: string | undefined, now: Date) {
  const sp = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mes ?? "");
  const y = m ? Number(m[1]) : sp.getFullYear();
  const mo = m ? Number(m[2]) - 1 : sp.getMonth();
  // São Paulo não tem horário de verão desde 2019: UTC-3 fixo.
  const start = new Date(Date.UTC(y, mo, 1, 3));
  const end = new Date(Date.UTC(y, mo + 1, 1, 3));
  const key = `${y}-${String(mo + 1).padStart(2, "0")}`;
  return { start, end, key };
}

/** Chave "AAAA-MM" de uma data no fuso de São Paulo. */
export const monthKeyOf = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);

/** Os `n` meses terminando em `endKey` ("AAAA-MM"), do mais antigo para o mais novo. */
export function lastMonths(endKey: string, n: number) {
  const [y, m] = endKey.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/** Gasto (R$) de cada mês. Linhas sem custo não somam. */
export function spendByMonth(lines: SpendLine[], months: string[]) {
  const by = new Map(months.map((k) => [k, 0]));
  for (const l of lines) {
    const k = monthKeyOf(l.shippedAt);
    if (by.has(k) && l.unitCost != null) by.set(k, by.get(k)! + l.quantity * l.unitCost);
  }
  return months.map((key) => ({ key, value: by.get(key)! }));
}

/** Variação % em relação ao período anterior (null quando não há base de comparação). */
export const deltaPct = (cur: number, prev: number) => (prev ? ((cur - prev) / prev) * 100 : null);
