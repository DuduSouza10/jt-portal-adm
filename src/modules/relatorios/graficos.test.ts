import { describe, expect, it } from "vitest";
import { dayCalendarGrid, seriesOf, spendMonthGrid } from "./graficos";

const MG = { id: "mg", code: "MG", name: "Minas Gerais" };
const SPN = { id: "spn", code: "SPN", name: "São Paulo Norte" };
const ref = { id: "x", code: "X", name: "X" };
// 15h UTC = meio-dia em São Paulo.
const at = (d: string) => new Date(`${d}T15:00:00Z`);

describe("seriesOf", () => {
  it("tira repetidas e ordena por código", () => {
    expect(seriesOf([SPN, MG, SPN]).map((s) => s.code)).toEqual(["MG", "SPN"]);
  });
});

describe("spendMonthGrid", () => {
  it("soma quantidade × custo por mês e regional, ignorando linha sem custo e mês fora", () => {
    const line = (regional: typeof MG, d: string, quantity: number, unitCost: number | null) => ({ base: ref, produto: ref, regional, shippedAt: at(d), quantity, unitCost });
    const g = spendMonthGrid(
      [line(MG, "2026-10-05", 2, 10), line(MG, "2026-10-20", 1, 5.5), line(SPN, "2026-11-02", 3, 1), line(SPN, "2026-11-03", 9, null), line(MG, "2026-08-01", 1, 99)],
      ["2026-10", "2026-11"],
    );
    expect(g.series.map((s) => s.code)).toEqual(["MG", "SPN"]);
    expect(g.cells).toHaveLength(4);
    const cell = (x: number, z: number) => g.cells.find((c) => c.x === x && c.z === z)!;
    expect(cell(0, 0).values).toEqual([25.5, 0]);
    expect(cell(1, 0).values).toEqual([0, 0]);
    expect(cell(1, 1).values).toEqual([0, 3]);
  });
});

describe("dayCalendarGrid", () => {
  it("monta o calendário (nov/2026 começa no domingo) e conta por regional", () => {
    const g = dayCalendarGrid(
      [
        { date: at("2026-11-02"), regional: MG },
        { date: at("2026-11-02"), regional: SPN },
        { date: at("2026-11-02"), regional: MG },
        { date: at("2026-11-13"), regional: SPN },
      ],
      "2026-11",
      at("2026-11-13"),
    );
    expect(g.cells).toHaveLength(30);
    expect(g.weeks).toBe(5);
    const d2 = g.cells[1];
    expect([d2.x, d2.z, d2.values]).toEqual([1, 0, [2, 1]]);
    const d13 = g.cells[12];
    expect([d13.x, d13.z]).toEqual([5, 1]);
    expect(g.todayIndex).toBe(12);
    expect(g.cells[13].future).toBe(true);
    expect(g.cells[12].future).toBe(false);
  });

  it("mês que começa no sábado ocupa 6 semanas; mês passado não tem hoje", () => {
    const g = dayCalendarGrid([], "2026-08", at("2026-11-13"));
    expect(g.cells[0].x).toBe(6);
    expect(g.weeks).toBe(6);
    expect(g.todayIndex).toBeNull();
    expect(g.series).toEqual([]);
  });
});
