/**
 * Seed: cria os tipos de acesso padrão e, em desenvolvimento, dados de exemplo.
 * Rodar: npm run db:seed  (é idempotente: pode rodar de novo sem duplicar)
 *
 * Os perfis padrão ficam em src/lib/permissions/default-profiles.ts e são atualizados
 * a cada seed (nome, alcance, permissões).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { dbSchema } from "../src/lib/db-schema";
import { DEFAULT_PROFILES } from "../src/lib/permissions/default-profiles";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema: dbSchema() }),
});

async function main() {
  for (const p of DEFAULT_PROFILES) {
    await db.accessProfile.upsert({
      where: { key: p.key },
      update: { name: p.name, description: p.description, scope: p.scope, permissions: p.permissions, system: true },
      create: { ...p, system: true },
    });
  }
  console.log(`✓ ${DEFAULT_PROFILES.length} tipos de acesso padrão`);

  if (process.env.NODE_ENV === "production") return;

  // ---- Dados de exemplo (só desenvolvimento) ----
  const mg = await db.regional.upsert({ where: { code: "MG" }, update: {}, create: { code: "MG", name: "Minas Gerais" } });
  const spn = await db.regional.upsert({ where: { code: "SPN" }, update: {}, create: { code: "SPN", name: "São Paulo Norte" } });
  const bases = [
    { code: "BHZ01", name: "Belo Horizonte 01", regionalId: mg.id, city: "Belo Horizonte", state: "MG" },
    { code: "CTG01", name: "Contagem 01", regionalId: mg.id, city: "Contagem", state: "MG", type: "FRANQUIA" as const },
    { code: "ALM-MG", name: "Almoxarifado MG", regionalId: mg.id, city: "Contagem", state: "MG", type: "ALMOXARIFADO" as const },
    { code: "GRU01", name: "Guarulhos 01", regionalId: spn.id, city: "Guarulhos", state: "SP" },
  ];
  for (const b of bases) await db.base.upsert({ where: { code: b.code }, update: {}, create: b });
  console.log("✓ regionais e bases de exemplo");

  const password = process.env.SEED_PASSWORD ?? "portal123";
  const hash = await bcrypt.hash(password, 11);
  const profiles = Object.fromEntries((await db.accessProfile.findMany()).map((p) => [p.key, p.id]));
  const bhz = await db.base.findUniqueOrThrow({ where: { code: "BHZ01" } });
  const users = [
    { login: "dev", name: "Dev (exemplo)", profileId: profiles.dev },
    { login: "admin", name: "Admin (exemplo)", profileId: profiles.admin },
    { login: "gestor.mg", name: "Gestor MG (exemplo)", profileId: profiles["gestor-regional"], regionalId: mg.id },
    { login: "almox.mg", name: "Almoxarifado MG (exemplo)", profileId: profiles.almoxarifado, regionalId: mg.id },
    { login: "base.bhz", name: "Base BHZ01 (exemplo)", profileId: profiles.base, baseId: bhz.id },
  ];
  for (const { regionalId, baseId, ...u } of users) {
    await db.user.upsert({
      where: { login: u.login },
      update: {},
      create: {
        ...u,
        passwordHash: hash,
        ...(regionalId && { regionals: { create: { regionalId } } }),
        ...(baseId && { bases: { create: { baseId } } }),
      },
    });
  }
  const produtos = [
    { code: "LUVA-M", name: "Luva de látex M", unit: "cx" },
    { code: "FITA-48", name: "Fita adesiva 48mm", unit: "un" },
    { code: "ETIQ-100", name: "Etiqueta térmica 100x150", unit: "rolo" },
    { code: "SACO-G", name: "Saco plástico G", unit: "pct" },
    { code: "CANETA-AZ", name: "Caneta azul", unit: "un" },
  ];
  for (const p of produtos) await db.produto.upsert({ where: { code: p.code }, update: {}, create: p });
  console.log(`✓ ${produtos.length} produtos de exemplo (sem saldo: lance uma entrada em /estoque)`);

  console.log(`✓ usuários de exemplo: ${users.map((u) => u.login).join(", ")} (senha: ${password})`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
