// Cálculo de horas úteis e SLA. Funções puras (testadas em sla.test.ts).

import { TZDate } from "@date-fns/tz";

export const TZ = "America/Sao_Paulo";

export type BusinessHours = {
  start: string; // "08:00"
  end: string; // "18:00"
  days: number[]; // 0 = domingo ... 6 = sábado
  holidays: string[]; // "2026-11-02"
};

export type SlaConfig = { normalHours: number; urgentHours: number };

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  start: "08:00",
  end: "18:00",
  days: [1, 2, 3, 4, 5],
  holidays: [],
};

export const DEFAULT_SLA: SlaConfig = { normalHours: 24, urgentHours: 4 };

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const dayKey = (d: TZDate) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function isBusinessDay(d: Date, bh: BusinessHours) {
  const z = new TZDate(d, TZ);
  return bh.days.includes(z.getDay()) && !bh.holidays.includes(dayKey(z));
}

export function isWithinBusinessHours(d: Date, bh: BusinessHours) {
  if (!isBusinessDay(d, bh)) return false;
  const z = new TZDate(d, TZ);
  const m = z.getHours() * 60 + z.getMinutes();
  return m >= toMinutes(bh.start) && m < toMinutes(bh.end);
}

/** Minutos úteis entre dois instantes, no fuso de São Paulo. */
export function businessMinutesBetween(from: Date, to: Date, bh: BusinessHours): number {
  if (to <= from) return 0;
  const startMin = toMinutes(bh.start);
  const endMin = toMinutes(bh.end);
  let total = 0;

  // Percorre dia a dia (pedidos ficam abertos dias/semanas, não anos).
  const cursor = new TZDate(from, TZ);
  cursor.setHours(0, 0, 0, 0);
  const limit = 400;
  for (let i = 0; i < limit && cursor.getTime() < to.getTime(); i++) {
    if (bh.days.includes(cursor.getDay()) && !bh.holidays.includes(dayKey(cursor))) {
      const open = new TZDate(cursor, TZ);
      open.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
      const close = new TZDate(cursor, TZ);
      close.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
      const a = Math.max(open.getTime(), from.getTime());
      const b = Math.min(close.getTime(), to.getTime());
      if (b > a) total += (b - a) / 60000;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.floor(total);
}

export function slaHoursFor(priority: "NORMAL" | "URGENTE", sla: SlaConfig) {
  return priority === "URGENTE" ? sla.urgentHours : sla.normalHours;
}

export type SlaState = { elapsedMinutes: number; limitMinutes: number; late: boolean; ratio: number };

/** SLA de separação: conta de createdAt até separatedAt (ou agora). */
export function separationSla(
  order: { priority: "NORMAL" | "URGENTE"; createdAt: Date; separatedAt: Date | null },
  now: Date,
  bh: BusinessHours,
  sla: SlaConfig,
): SlaState {
  const end = order.separatedAt ?? now;
  const elapsedMinutes = businessMinutesBetween(order.createdAt, end, bh);
  const limitMinutes = slaHoursFor(order.priority, sla) * 60;
  return {
    elapsedMinutes,
    limitMinutes,
    late: elapsedMinutes > limitMinutes,
    ratio: limitMinutes ? elapsedMinutes / limitMinutes : 0,
  };
}

/** "3h 20min", "2d 4h" (dias corridos de 24h para leitura rápida). */
export function formatDuration(ms: number) {
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}min`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
