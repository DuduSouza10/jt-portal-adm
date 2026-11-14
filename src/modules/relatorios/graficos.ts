import { dayKeyOf, monthKeyOf, type SpendLine } from "./sla";

/**
 * Dados dos gráficos 3D/2D dos relatórios (puros, sem banco).
 * Uma "série" é uma regional (cada uma com sua cor); uma "célula" é uma coluna na grade x × z,
 * empilhada por série.
 */

export type Serie = { id: string; code: string; name: string };
export type Cell = {
  key: string;
  x: number;
  z: number;
  /** Valor de cada série nesta coluna (mesma ordem de `series`). */
  values: number[];
  /** Dia ainda não chegou (calendário). */
  future?: boolean;
  day?: number;
};
export type GridData = { series: Serie[]; cells: Cell[] };

/** Regionais sem repetição, em ordem de código. */
export function seriesOf(refs: Serie[]): Serie[] {
  return [...new Map(refs.map((r) => [r.id, { id: r.id, code: r.code, name: r.name }])).values()].sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Gasto (R$) por mês × regional: x = mês, z = regional; cada coluna tem só a sua regional.
 * Linhas sem custo não somam (igual ao gasto do mês).
 */
export function spendMonthGrid(lines: SpendLine[], months: string[]): GridData {
  const series = seriesOf(lines.map((l) => l.regional));
  const si = new Map(series.map((s, i) => [s.id, i]));
  const mi = new Map(months.map((k, i) => [k, i]));
  const sums = series.map(() => months.map(() => 0));
  for (const l of lines) {
    const m = mi.get(monthKeyOf(l.shippedAt));
    if (m == null || l.unitCost == null) continue;
    sums[si.get(l.regional.id)!][m] += l.quantity * l.unitCost;
  }
  const cells = series.flatMap((_, s) =>
    months.map((k, x) => ({ key: `${k}:${series[s].id}`, x, z: s, values: series.map((_, j) => (j === s ? Math.round(sums[s][x] * 100) / 100 : 0)) })),
  );
  return { series, cells };
}

/**
 * Calendário do mês: x = dia da semana (domingo = 0), z = semana do mês; cada dia empilha as regionais.
 * Dias depois de hoje ficam marcados como futuros.
 */
export function dayCalendarGrid(items: { date: Date; regional: Serie }[], monthKey: string, now: Date): GridData & { weeks: number; todayIndex: number | null } {
  const [y, m] = monthKey.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const series = seriesOf(items.map((i) => i.regional));
  const si = new Map(series.map((s, i) => [s.id, i]));
  const counts = new Map<string, number[]>();
  for (const it of items) {
    const k = dayKeyOf(it.date);
    const row = counts.get(k) ?? series.map(() => 0);
    row[si.get(it.regional.id)!]++;
    counts.set(k, row);
  }
  const today = dayKeyOf(now);
  const cells: Cell[] = [];
  let todayIndex: number | null = null;
  for (let day = 1; day <= last; day++) {
    const key = `${monthKey}-${String(day).padStart(2, "0")}`;
    const pos = first + day - 1;
    if (key === today) todayIndex = cells.length;
    cells.push({ key, day, x: pos % 7, z: Math.floor(pos / 7), values: counts.get(key) ?? series.map(() => 0), future: key > today });
  }
  return { series, cells, weeks: Math.floor((first + last - 1) / 7) + 1, todayIndex };
}
