import { describe, expect, it } from "vitest";
import { DEFAULT_BUSINESS_HOURS } from "@/lib/sla";
import { countByDay, deltaPct, durationParts, lastMonths, lateNow, monthRange, spendBy, spendByMonth, stageTime, summarize, summarizeBy, type SlaOrder, type Targets } from "./sla";

const bh = DEFAULT_BUSINESS_HOURS; // seg–sex 08:00–18:00
const targets: Targets = { aprovacao: { normal: 8, urgente: 2 }, separacao: { normal: 24, urgente: 4 }, expedicao: { normal: 8, urgente: 2 } };
// 2026-11-09 é segunda-feira. Horários em São Paulo (UTC-3).
const sp = (d: string) => new Date(`${d}-03:00`);

const order = (over: Partial<SlaOrder>): SlaOrder => ({
  id: "o1",
  number: 1,
  status: "PENDENTE",
  priority: "NORMAL",
  createdAt: sp("2026-11-09T09:00:00"),
  approvedAt: null,
  separatedAt: null,
  shippedAt: null,
  receivedAt: null,
  base: { id: "b1", code: "BHZ01", name: "BH" },
  almoxarifado: { id: "a1", code: "ALM", name: "Almox" },
  ...over,
});

describe("stageTime", () => {
  it("conta horas úteis só a partir de quando a etapa começa", () => {
    const o = order({ status: "ENVIADA", approvedAt: sp("2026-11-09T11:00:00"), separatedAt: sp("2026-11-10T11:00:00"), shippedAt: sp("2026-11-10T15:00:00") });
    const now = sp("2026-11-12T10:00:00");
    expect(stageTime(o, "aprovacao", now, bh, targets)).toMatchObject({ hours: 2, ok: true, running: false });
    // aprovada seg 11h → separada ter 11h = 10 h úteis
    expect(stageTime(o, "separacao", now, bh, targets)).toMatchObject({ hours: 10, ok: true });
    expect(stageTime(o, "expedicao", now, bh, targets)).toMatchObject({ hours: 4, ok: true });
    // entrega correndo em horas corridas, sem prazo
    expect(stageTime(o, "entrega", now, bh, targets)).toMatchObject({ running: true, target: null, ok: null });
  });

  it("fim de semana não conta e urgente tem prazo menor", () => {
    // aprovada sexta 17h, separada segunda 10h = 1 h (sex) + 2 h (seg) = 3 h úteis
    const o = order({ status: "SEPARADA", priority: "URGENTE", createdAt: sp("2026-11-13T16:00:00"), approvedAt: sp("2026-11-13T17:00:00"), separatedAt: sp("2026-11-16T10:00:00") });
    expect(stageTime(o, "separacao", sp("2026-11-16T12:00:00"), bh, targets)).toMatchObject({ hours: 3, target: 4, ok: true });
  });

  it("etapa correndo só vira 'fora do prazo' quando estoura", () => {
    const o = order({ status: "PENDENTE" });
    expect(stageTime(o, "aprovacao", sp("2026-11-09T12:00:00"), bh, targets).ok).toBeNull();
    expect(stageTime(o, "aprovacao", sp("2026-11-10T10:00:00"), bh, targets)).toMatchObject({ hours: 11, ok: false, running: true });
    expect(stageTime(o, "separacao", sp("2026-11-10T10:00:00"), bh, targets).hours).toBeNull();
  });

  it("recusada/cancelada não deixa etapa correndo", () => {
    const o = order({ status: "CANCELADA", approvedAt: sp("2026-11-09T10:00:00") });
    expect(stageTime(o, "separacao", sp("2026-11-20T10:00:00"), bh, targets).hours).toBeNull();
  });
});

describe("resumos", () => {
  const now = sp("2026-11-11T17:00:00");
  const a = order({ id: "a", status: "RECEBIDA", approvedAt: sp("2026-11-09T10:00:00"), separatedAt: sp("2026-11-09T12:00:00"), shippedAt: sp("2026-11-09T13:00:00"), receivedAt: sp("2026-11-10T13:00:00") });
  const b = order({ id: "b", status: "APROVADA", approvedAt: sp("2026-11-09T10:00:00"), base: { id: "b2", code: "CTG", name: "Contagem" } });
  it("% no prazo e atrasados agora", () => {
    const s = summarize([a, b], now, bh, targets);
    expect(s.aprovacao).toMatchObject({ done: 2, okPct: 100, late: 0 });
    expect(s.separacao).toMatchObject({ done: 1, okPct: 100, running: 1, late: 1 }); // b: 25 h úteis > 24
    expect(s.entrega.avgHours).toBe(24);
    const late = lateNow([a, b], now, bh, targets);
    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({ stage: "separacao", target: 24 });
    expect(summarizeBy([a, b], (o) => o.base, now, bh, targets).map((g) => g.code)).toEqual(["BHZ01", "CTG"]);
  });
});

describe("valores", () => {
  it("gasto por base e por produto; sem custo conta à parte", () => {
    const base = { id: "b1", code: "BHZ01", name: "BH" };
    const p1 = { id: "p1", code: "LUVA", name: "Luva" };
    const p2 = { id: "p2", code: "FITA", name: "Fita" };
    const mg = { id: "r1", code: "MG", name: "Minas" };
    const sp1 = { id: "r2", code: "SP", name: "São Paulo" };
    const nov = sp("2026-11-10T10:00:00");
    const lines = [
      { base, regional: mg, produto: p1, quantity: 3, unitCost: 10, shippedAt: nov },
      { base, regional: mg, produto: p2, quantity: 2, unitCost: null, shippedAt: nov },
      { base: { id: "b2", code: "CTG", name: "Contagem" }, regional: sp1, produto: p1, quantity: 1, unitCost: 12.5, shippedAt: sp("2026-10-31T23:00:00") },
    ];
    const r = spendBy(lines);
    expect(r.total).toBe(42.5);
    expect(r.semCusto).toBe(2);
    expect(r.byBase[0]).toMatchObject({ code: "BHZ01", value: 30, semCusto: 2 });
    expect(r.byRegional.map((x) => [x.code, x.value])).toEqual([["MG", 30], ["SP", 12.5]]);
    expect(r.byProduto[0]).toMatchObject({ code: "LUVA", value: 42.5, quantity: 4 });
    // Gasto por mês no fuso de São Paulo (31/10 23h fica em outubro).
    expect(lastMonths("2026-11", 3)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(spendByMonth(lines, ["2026-10", "2026-11"])).toEqual([{ key: "2026-10", value: 12.5 }, { key: "2026-11", value: 30 }]);
    expect(deltaPct(30, 12.5)).toBe(140);
    expect(deltaPct(5, 0)).toBeNull();
  });

  it("mês em São Paulo", () => {
    const r = monthRange("2026-11", new Date());
    expect(r.start.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-12-01T03:00:00.000Z");
    expect(monthRange("lixo", sp("2026-02-10T10:00:00")).key).toBe("2026-02");
  });
});

describe("gráficos", () => {
  it("todos os dias do mês, com os zerados; dias que não chegaram ficam marcados", () => {
    const now = sp("2026-11-05T10:00:00");
    const r = countByDay([sp("2026-11-02T09:00:00"), sp("2026-11-02T17:00:00"), sp("2026-11-04T23:30:00")], "2026-11", now);
    expect(r).toHaveLength(30);
    expect(r.slice(0, 5).map((x) => x.count)).toEqual([0, 2, 0, 1, 0]);
    expect(r[4].future).toBe(false);
    expect(r[5].future).toBe(true);
    expect(countByDay([], "2026-10", now)).toHaveLength(31);
  });
  it("duração legível", () => {
    expect(durationParts(0.25)).toEqual({ value: 15, unit: "min" });
    expect(durationParts(3.44)).toEqual({ value: 3.4, unit: "h" });
    expect(durationParts(60)).toEqual({ value: 60, unit: "h" });
    expect(durationParts(60, { dias: true })).toEqual({ value: 2.5, unit: "d" });
    expect(durationParts(null)).toBeNull();
  });
});
