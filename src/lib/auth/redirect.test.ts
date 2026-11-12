import { describe, expect, it } from "vitest";
import { safeNext } from "./redirect";

describe("safeNext", () => {
  it("aceita caminhos internos", () => {
    expect(safeNext("/estoque")).toBe("/estoque");
    expect(safeNext("/admin/usuarios?q=joao")).toBe("/admin/usuarios?q=joao");
  });

  it("recusa destinos externos", () => {
    const BS = String.fromCharCode(92); // barra invertida
    const ataques = [
      "https://evil.com",
      "//evil.com",
      `/${BS}evil.com`,
      `/${BS}/evil.com`,
      `${BS}evil.com`,
      "/\t/evil.com",
      "/\n/evil.com",
      "",
    ];
    for (const n of ataques) expect(safeNext(n), JSON.stringify(n)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});
