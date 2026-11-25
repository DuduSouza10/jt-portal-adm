import { describe, expect, it } from "vitest";
import { lerIds, MAX_VISTOS, semRepetir } from "./duvidas-avisos-rules";

describe("avisos de dúvida no navegador", () => {
  it("não repete um aviso já mostrado", () => {
    const r = semRepetir([{ id: "a" }, { id: "b" }], ["a"]);
    expect(r.novos.map((n) => n.id)).toEqual(["b"]);
    expect(r.vistos).toEqual(["a", "b"]);
  });
  it("guarda só os últimos ids", () => {
    const antigos = Array.from({ length: MAX_VISTOS }, (_, i) => `x${i}`);
    const r = semRepetir([{ id: "novo" }], antigos);
    expect(r.vistos).toHaveLength(MAX_VISTOS);
    expect(r.vistos.at(-1)).toBe("novo");
    expect(r.vistos[0]).toBe("x1");
  });
  it("lerIds aguenta texto estragado", () => {
    expect(lerIds(null)).toEqual([]);
    expect(lerIds("{lixo")).toEqual([]);
    expect(lerIds('{"a":1}')).toEqual([]);
    expect(lerIds('["a",2,"b"]')).toEqual(["a", "b"]);
  });
});
