import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** Testes de unidade: regras puras, sem banco (npm test). */
export default defineConfig({
  resolve: {
    alias: {
      "@": src("./src"),
      // "server-only" só funciona dentro do Next; nos testes vira um módulo vazio.
      "server-only": src("./src/test/empty.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integration.test.ts", "node_modules/**"],
    environment: "node",
  },
});
