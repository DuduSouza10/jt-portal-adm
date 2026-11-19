/**
 * Primeiro acesso pelo deploy (roda antes do `next build`, ver "build" no package.json).
 *
 * Só age se FIRST_ADMIN_PASSWORD estiver definida. Aí:
 *   1. aplica as migrations (prisma migrate deploy);
 *   2. cria/atualiza os tipos de acesso padrão (seed em modo produção, sem dados de exemplo);
 *   3. cria o usuário Dev FIRST_ADMIN_LOGIN, se ele AINDA NÃO existir.
 *
 * Usuário que já existe nunca é alterado (a senha não é redefinida), então deixar a variável
 * cadastrada não abre brecha. Mesmo assim, apague FIRST_ADMIN_PASSWORD depois de entrar.
 * A senha é provisória: o portal exige trocá-la no primeiro acesso.
 *
 * Variáveis: FIRST_ADMIN_LOGIN, FIRST_ADMIN_NAME, FIRST_ADMIN_PASSWORD (mín. 10 caracteres).
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { dbSchema } from "../src/lib/db-schema";

const password = process.env.FIRST_ADMIN_PASSWORD;
if (!password) {
  console.log("[primeiro-acesso] FIRST_ADMIN_PASSWORD não definida: nada a fazer.");
  process.exit(0);
}

const login = (process.env.FIRST_ADMIN_LOGIN ?? "").trim().toLowerCase();
const name = (process.env.FIRST_ADMIN_NAME ?? "").trim();
const fail = (msg: string): never => {
  console.error(`[primeiro-acesso] ERRO: ${msg}`);
  process.exit(1);
};

if (!login || !name) fail("defina FIRST_ADMIN_LOGIN e FIRST_ADMIN_NAME junto com FIRST_ADMIN_PASSWORD.");
if (!/^[a-z0-9._-]{3,40}$/.test(login)) fail("FIRST_ADMIN_LOGIN deve ter de 3 a 40 caracteres: letras, números, ponto, hífen ou sublinhado.");
if (password.length < 10) fail("FIRST_ADMIN_PASSWORD precisa ter pelo menos 10 caracteres.");
const url = process.env.DATABASE_URL;
if (!url || !/^postgres(ql)?:\/\//.test(url)) fail("DATABASE_URL ausente ou não é uma URL postgres:// (URLs prisma+postgres:// não servem).");

function run(args: string[]) {
  const prisma = "node_modules/prisma/build/index.js";
  const r = spawnSync(process.execPath, [prisma, ...args], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });
  if (r.status !== 0) fail(`"prisma ${args.join(" ")}" falhou (código ${r.status}).`);
}

async function main() {
  console.log("[primeiro-acesso] aplicando migrations…");
  run(["migrate", "deploy"]);
  console.log("[primeiro-acesso] criando tipos de acesso padrão…");
  run(["db", "seed"]);

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }, { schema: dbSchema() }) });
  try {
    const dev = await db.accessProfile.findUnique({ where: { key: "dev" } });
    if (!dev) return fail('o tipo de acesso "dev" não existe depois do seed.');
    const existing = await db.user.findUnique({ where: { login }, select: { id: true } });
    if (existing) {
      console.log(`[primeiro-acesso] o usuário "${login}" já existe: nada foi alterado.`);
      return;
    }
    await db.user.create({
      data: { login, name, profileId: dev.id, passwordHash: await bcrypt.hash(password, 11), mustChangePassword: true, active: true },
    });
    console.log(`[primeiro-acesso] usuário "${login}" criado com o tipo de acesso Dev. A senha provisória é a de FIRST_ADMIN_PASSWORD.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
