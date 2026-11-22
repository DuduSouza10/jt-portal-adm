import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Produção (Supabase): toda tabela do portal tem RLS ligado e nenhuma policy, para a API pública do Supabase
 * não enxergar nada. A migration 20261121120000_rls_todas_tabelas ligou em todas as que existiam; daqui para
 * frente, cada migration que cria tabela precisa ligar o RLS nela, na mesma migration:
 *
 *   ALTER TABLE "NomeDaTabela" ENABLE ROW LEVEL SECURITY;
 */
const DIR = join(process.cwd(), "prisma", "migrations");
const MARCO = "20261121120000_rls_todas_tabelas";

describe("migrations", () => {
  const depois = readdirSync(DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name > MARCO)
    .map((d) => d.name);

  it("a migration que liga o RLS em tudo existe", () => {
    expect(readdirSync(DIR)).toContain(MARCO);
  });

  it.each(depois.length ? depois : ["(nenhuma)"])("%s: toda tabela criada liga o RLS", (nome) => {
    if (nome === "(nenhuma)") return;
    const sql = readFileSync(join(DIR, nome, "migration.sql"), "utf8");
    const criadas = [...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"/gi)].map((m) => m[1]);
    for (const t of criadas) expect(sql, `ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY; faltando`).toMatch(new RegExp(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`, "i"));
  });
});
