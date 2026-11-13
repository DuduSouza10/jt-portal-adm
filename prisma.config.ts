import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations usam a conexão direta (no Supabase: porta 5432, não o pooler).
// Se DATABASE_SCHEMA estiver definido (ex.: "portal"), as tabelas são criadas nesse schema.
function migrationUrl() {
  const raw = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"];
  const schema = process.env["DATABASE_SCHEMA"];
  if (!raw || !schema) return raw;
  const url = new URL(raw);
  url.searchParams.set("schema", schema);
  return url.toString();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: migrationUrl(),
  },
});
