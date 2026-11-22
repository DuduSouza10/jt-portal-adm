import { describe, expect, it } from "vitest";
import { addMonths, holdActive, limitError, limitFor, periodStart } from "./limites";

const now = new Date("2026-11-13T15:00:00Z");

describe("ciclo de 3 meses (S1)", () => {
  it("soma meses de calendário", () => {
    expect(addMonths(new Date("2026-11-13T15:00:00Z"), 3).toISOString()).toBe("2027-02-13T15:00:00.000Z");
    expect(addMonths(new Date("2026-11-30T12:00:00Z"), 3).toISOString()).toBe("2027-02-28T12:00:00.000Z");
  });

  it("cai se o prazo passou, foi liberado ou o pedido de origem foi recusado/cancelado", () => {
    const base = { blockedUntil: new Date("2027-01-01Z"), revokedAt: null, sourceStatus: "ENVIADA" as const };
    expect(holdActive(base, now)).toBe(true);
    expect(holdActive({ ...base, blockedUntil: new Date("2026-11-01Z") }, now)).toBe(false);
    expect(holdActive({ ...base, revokedAt: now }, now)).toBe(false);
    expect(holdActive({ ...base, sourceStatus: "RECUSADA" }, now)).toBe(false);
    expect(holdActive({ ...base, sourceStatus: "CANCELADA" }, now)).toBe(false);
    expect(holdActive({ ...base, sourceStatus: null }, now)).toBe(true); // definido à mão
    expect(holdActive(null, now)).toBe(false);
  });
});

describe("limite por produto (S3)", () => {
  it("usa o limite do tipo de base", () => {
    const p = { limitBase: 10, limitFranquia: 4 };
    expect(limitFor(p, "BASE")).toBe(10);
    expect(limitFor(p, "FRANQUIA")).toBe(4);
    expect(limitFor(p, "ALMOXARIFADO")).toBeNull();
  });

  it("mensagens iguais às do sistema do Eduardo", () => {
    expect(limitError("Luva", "cx", null, 100, 100)).toBeNull();
    expect(limitError("Luva", "cx", 10, 0, 11)).toBe("Limite de insumos excedido para Luva. Limite permitido: 10 cx.");
    expect(limitError("Luva", "cx", 10, 10, 1)).toBe("Você já atingiu o limite de 10 cx para Luva.");
    expect(limitError("Luva", "cx", 10, 7, 4)).toBe("Limite de insumos excedido para Luva. Restam 3 cx no período de bloqueio.");
    expect(limitError("Luva", "cx", 10, 7, 3)).toBeNull();
  });

  it("período: N dias atrás ou desde a liberação manual", () => {
    expect(periodStart(now, 60, null).toISOString()).toBe("2026-09-14T15:00:00.000Z");
    const liberado = new Date("2026-11-01T00:00:00Z");
    expect(periodStart(now, 60, liberado)).toBe(liberado);
  });
});
