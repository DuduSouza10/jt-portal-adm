/**
 * Cria (ou reativa) o primeiro usuário Dev em produção, com senha temporária.
 * Uso: npm run create-admin -- <login> "<Nome Completo>"
 * Rode o seed antes (ele cria o tipo de acesso "dev").
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { dbSchema } from "../src/lib/db-schema";

const [login, name] = process.argv.slice(2);
if (!login || !name) {
  console.error('Uso: npm run create-admin -- <login> "<Nome Completo>"');
  process.exit(1);
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, { schema: dbSchema() }),
});

async function main() {
  const dev = await db.accessProfile.findUnique({ where: { key: "dev" } });
  if (!dev) throw new Error('Tipo de acesso "dev" não existe. Rode "npm run db:seed" antes.');
  const temp = randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(temp, 11);
  const data = { name, profileId: dev.id, passwordHash, mustChangePassword: true, active: true };
  await db.user.upsert({ where: { login: login.toLowerCase() }, update: data, create: { login: login.toLowerCase(), ...data } });
  console.log(`Usuário "${login}" pronto. Senha temporária: ${temp}`);
  console.log("Ela será trocada no primeiro acesso.");
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e.message ?? e);
    await db.$disconnect();
    process.exit(1);
  });
