// Regras puras dos lembretes e do resumo diário (testadas em select.test.ts).
// Trazidas do sistema antigo de insumos, com os status do portal.
import { TZDate } from "@date-fns/tz";
import { businessMinutesBetween, isBusinessDay, TZ, type BusinessHours } from "@/lib/sla";

/** Lembretes no Feishu: horas ÚTEIS paradas no status. */
export type ReminderConfig = {
  enabled: boolean;
  pendingNormalHours: number; // solicitação normal aguardando aprovação há mais de X h
  pendingUrgentHours: number; // urgente aguardando aprovação há mais de X h
  approvedHours: number; // aprovada e não separada há mais de X h
  separatedHours: number; // separada e não enviada há mais de X h
  repeatHours: number; // não repetir o lembrete do mesmo pedido antes de X h
  dailySummary: boolean;
  dailySummaryTime: string; // "08:00"
};

export const DEFAULT_REMINDERS: ReminderConfig = {
  enabled: true,
  pendingNormalHours: 4,
  pendingUrgentHours: 1,
  approvedHours: 8,
  separatedHours: 4,
  repeatHours: 4,
  dailySummary: true,
  dailySummaryTime: "08:00",
};

export type ReminderKind = "pendente" | "aprovada" | "separada";

export type ReminderCandidate = {
  status: string;
  priority: "NORMAL" | "URGENTE";
  statusChangedAt: Date;
};

/** Qual lembrete (se algum) uma solicitação merece agora. */
export function reminderKind(o: ReminderCandidate, now: Date, cfg: ReminderConfig, bh: BusinessHours): ReminderKind | null {
  const idleMin = businessMinutesBetween(o.statusChangedAt, now, bh);
  switch (o.status) {
    case "PENDENTE":
      return idleMin >= (o.priority === "URGENTE" ? cfg.pendingUrgentHours : cfg.pendingNormalHours) * 60 ? "pendente" : null;
    case "APROVADA":
    case "EM_SEPARACAO":
      return idleMin >= cfg.approvedHours * 60 ? "aprovada" : null;
    case "SEPARADA":
      return idleMin >= cfg.separatedHours * 60 ? "separada" : null;
    default:
      return null;
  }
}

/** Não repete o lembrete do mesmo pedido antes de `repeatHours` (relógio, não horas úteis). */
export function canRemindAgain(lastSent: Date | undefined, now: Date, cfg: ReminderConfig) {
  return !lastSent || now.getTime() - lastSent.getTime() >= cfg.repeatHours * 3600_000;
}

export function spDayKey(now: Date) {
  const z = new TZDate(now, TZ);
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
}

/** Resumo diário: dia útil, já passou do horário configurado e ainda não foi enviado hoje. */
export function isDailySummaryDue(now: Date, cfg: ReminderConfig, bh: BusinessHours, alreadySentToday: boolean) {
  if (!cfg.dailySummary || alreadySentToday || !isBusinessDay(now, bh)) return false;
  const z = new TZDate(now, TZ);
  const [h, m] = cfg.dailySummaryTime.split(":").map(Number);
  return z.getHours() * 60 + z.getMinutes() >= h * 60 + m;
}
