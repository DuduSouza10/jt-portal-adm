import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Testes de integração (*.integration.test.ts): usam o banco de DATABASE_URL.
 * npm run test:integration — no CI rodam contra um PostgreSQL de verdade (ver .github/workflows/ci.yml).
 * Cada teste cria os próprios dados com códigos únicos; não depende do seed.
 */
export default defineConfig({
  resolve: {
    alias: { "@": src("./src"), "server-only": src("./src/test/empty.ts") },
  },
  test: {
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["dotenv/config"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
});
