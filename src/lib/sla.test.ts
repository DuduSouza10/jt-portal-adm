import { describe, expect, it } from "vitest";
import { businessMinutesBetween, DEFAULT_BUSINESS_HOURS, isWithinBusinessHours, separationSla } from "./sla";

// Horários em -03:00 (São Paulo não tem horário de verão desde 2019).
const sp = (iso: string) => new Date(`${iso}-03:00`);
const bh = DEFAULT_BUSINESS_HOURS; // seg–sex 08:00–18:00

describe("horas úteis", () => {
  it("mesmo dia dentro do expediente", () => {
    expect(businessMinutesBetween(sp("2026-10-07T09:00:00"), sp("2026-10-07T11:30:00"), bh)).toBe(150);
  });

  it("ignora a noite", () => {
    // qua 17:00 → qui 09:00 = 1h + 1h
    expect(businessMinutesBetween(sp("2026-10-07T17:00:00"), sp("2026-10-08T09:00:00"), bh)).toBe(120);
  });

  it("ignora fim de semana", () => {
    // sex 17:00 → seg 09:00 = 2h
    expect(businessMinutesBetween(sp("2026-10-09T17:00:00"), sp("2026-10-12T09:00:00"), bh)).toBe(120);
  });

  it("ignora feriados configurados", () => {
    const comFeriado = { ...bh, holidays: ["2026-10-12"] };
    // sex 17:00 → ter 09:00, segunda feriado = 2h
    expect(businessMinutesBetween(sp("2026-10-09T17:00:00"), sp("2026-10-13T09:00:00"), comFeriado)).toBe(120);
  });

  it("pedido feito fora do expediente só conta a partir da abertura", () => {
    expect(businessMinutesBetween(sp("2026-10-07T22:00:00"), sp("2026-10-08T08:30:00"), bh)).toBe(30);
  });

  it("detecta horário comercial", () => {
    expect(isWithinBusinessHours(sp("2026-10-07T10:00:00"), bh)).toBe(true);
    expect(isWithinBusinessHours(sp("2026-10-07T19:00:00"), bh)).toBe(false);
    expect(isWithinBusinessHours(sp("2026-10-10T10:00:00"), bh)).toBe(false); // sábado
  });
});

describe("SLA de separação", () => {
  const sla = { normalHours: 24, urgentHours: 4 };
  it("urgente estoura após 4h úteis", () => {
    const o = { priority: "URGENTE" as const, createdAt: sp("2026-10-07T09:00:00"), separatedAt: null };
    expect(separationSla(o, sp("2026-10-07T12:59:00"), bh, sla).late).toBe(false);
    expect(separationSla(o, sp("2026-10-07T13:01:00"), bh, sla).late).toBe(true);
  });
  it("para de contar quando separado", () => {
    const o = {
      priority: "URGENTE" as const,
      createdAt: sp("2026-10-07T09:00:00"),
      separatedAt: sp("2026-10-07T10:00:00"),
    };
    expect(separationSla(o, sp("2026-10-09T10:00:00"), bh, sla).elapsedMinutes).toBe(60);
  });
});
