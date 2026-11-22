import { describe, expect, it } from "vitest";
import { DEFAULT_BUSINESS_HOURS } from "@/lib/sla";
import { canRemindAgain, DEFAULT_REMINDERS, isDailySummaryDue, reminderKind, spDayKey } from "./select";

const sp = (iso: string) => new Date(`${iso}-03:00`);
const bh = DEFAULT_BUSINESS_HOURS; // seg–sex 08:00–18:00
const cfg = DEFAULT_REMINDERS;
const now = sp("2026-10-07T15:00:00"); // quarta

describe("reminderKind", () => {
  it("pendente: urgente em 1 h útil, normal em 4 h", () => {
    expect(reminderKind({ status: "PENDENTE", priority: "URGENTE", statusChangedAt: sp("2026-10-07T13:30:00") }, now, cfg, bh)).toBe("pendente");
    expect(reminderKind({ status: "PENDENTE", priority: "NORMAL", statusChangedAt: sp("2026-10-07T13:30:00") }, now, cfg, bh)).toBeNull();
    expect(reminderKind({ status: "PENDENTE", priority: "NORMAL", statusChangedAt: sp("2026-10-07T10:00:00") }, now, cfg, bh)).toBe("pendente");
  });

  it("conta só horas úteis (a noite não pesa)", () => {
    // ontem 17:00 → hoje 09:00 = 2 h úteis
    expect(reminderKind({ status: "SEPARADA", priority: "NORMAL", statusChangedAt: sp("2026-10-06T17:00:00") }, sp("2026-10-07T09:00:00"), cfg, bh)).toBeNull();
  });

  it("aprovada/em separação e separada", () => {
    expect(reminderKind({ status: "EM_SEPARACAO", priority: "NORMAL", statusChangedAt: sp("2026-10-06T10:00:00") }, now, cfg, bh)).toBe("aprovada");
    expect(reminderKind({ status: "SEPARADA", priority: "NORMAL", statusChangedAt: sp("2026-10-07T10:00:00") }, now, cfg, bh)).toBe("separada");
    expect(reminderKind({ status: "ENVIADA", priority: "NORMAL", statusChangedAt: sp("2026-10-01T10:00:00") }, now, cfg, bh)).toBeNull();
  });
});

describe("repetição e resumo", () => {
  it("não repete antes de repeatHours", () => {
    expect(canRemindAgain(undefined, now, cfg)).toBe(true);
    expect(canRemindAgain(sp("2026-10-07T13:00:00"), now, cfg)).toBe(false);
    expect(canRemindAgain(sp("2026-10-07T10:00:00"), now, cfg)).toBe(true);
  });

  it("resumo diário: dia útil, depois das 08:00, uma vez", () => {
    expect(isDailySummaryDue(sp("2026-10-07T07:59:00"), cfg, bh, false)).toBe(false);
    expect(isDailySummaryDue(sp("2026-10-07T08:00:00"), cfg, bh, false)).toBe(true);
    expect(isDailySummaryDue(sp("2026-10-07T09:00:00"), cfg, bh, true)).toBe(false);
    expect(isDailySummaryDue(sp("2026-10-10T09:00:00"), cfg, bh, false)).toBe(false); // sábado
  });

  it("chave do dia no fuso de São Paulo", () => {
    expect(spDayKey(sp("2026-10-07T23:30:00"))).toBe("2026-10-07");
  });
});
