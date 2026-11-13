#!/usr/bin/env node
/**
 * npm run doctor — confere se a máquina está pronta para rodar o JT Portal ADM.
 * Não instala nem altera nada: só verifica e diz o que fazer. Ver docs/ambiente.md.
 * Usa apenas o Node (sem dependências), para funcionar até antes do `npm install`.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { connect } from "node:net";

const root = process.cwd();
const results = [];
const ok = (name, detail = "") => results.push({ s: "ok", name, detail });
const warn = (name, fix) => results.push({ s: "warn", name, fix });
const fail = (name, fix) => results.push({ s: "fail", name, fix });

const run = (cmd) => {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], timeout: 15_000 }).toString().trim();
  } catch (e) {
    return e.stdout?.toString().trim() || e.stderr?.toString().trim() ? { error: (e.stderr || e.stdout).toString().trim() } : null;
  }
};

// ---------------------------------------------------------------- ferramentas
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor >= 22) ok("Node.js", process.versions.node);
else fail(`Node.js ${process.versions.node}`, "Instale o Node.js 22 ou mais novo (LTS): https://nodejs.org");

const npmV = run("npm -v");
if (typeof npmV === "string") ok("npm", npmV);
else fail("npm", "Vem junto com o Node.js; reinstale o Node.");

const gitV = run("git --version");
if (typeof gitV === "string") ok("Git", gitV.replace("git version ", ""));
else fail("Git", "Instale o Git: https://git-scm.com/downloads");

const ghV = run("gh --version");
if (typeof ghV !== "string") {
  fail("GitHub CLI (gh)", "Instale: https://cli.github.com  (Windows: winget install --id GitHub.cli). Os Claudes conversam pelo gh.");
} else {
  const auth = run("gh auth status");
  const text = typeof auth === "string" ? auth : auth?.error ?? "";
  if (/Logged in/i.test(text)) ok("GitHub CLI (gh)", "logado");
  else fail("GitHub CLI sem login", "Rode: gh auth login  (GitHub.com → HTTPS → navegador).");
}

// ---------------------------------------------------------------- projeto
if (!existsSync(join(root, "package.json"))) {
  fail("Pasta do projeto", "Rode o doctor dentro da pasta jt-portal-adm.");
  report();
  process.exit(1);
}

if (!existsSync(join(root, "node_modules"))) {
  fail("Dependências", "Rode: npm install");
} else {
  ok("Dependências instaladas");
  const req = createRequire(join(root, "package.json"));
  // Engine de migrations do Prisma (baixada no npm install a partir de binaries.prisma.sh).
  let enginesDir = null;
  try {
    enginesDir = join(req.resolve("@prisma/engines/package.json"), "..");
  } catch {}
  const hasEngine = enginesDir && readdirSync(enginesDir).some((f) => f.startsWith("schema-engine"));
  if (hasEngine) ok("Prisma: engine de migrations");
  else
    fail(
      "Prisma: engine de migrations não baixada",
      "O npm install não conseguiu baixar de binaries.prisma.sh. Veja docs/ambiente.md → \"Prisma bloqueado\". Os testes de unidade (npm test) funcionam mesmo assim.",
    );
  if (existsSync(join(root, "src/generated/prisma/client.ts"))) ok("Prisma: cliente gerado");
  else fail("Prisma: cliente não gerado", "Rode: npx prisma generate");
}

// ---------------------------------------------------------------- .env e banco
const envPath = join(root, ".env");
let dbUrl = process.env.DATABASE_URL;
if (!existsSync(envPath)) {
  fail(".env", "Copie o modelo: cp .env.example .env  (depois ajuste o DATABASE_URL).");
} else {
  ok(".env");
  const m = readFileSync(envPath, "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
  dbUrl ??= m?.[1];
  if (!dbUrl) fail("DATABASE_URL", "Preencha DATABASE_URL no .env.");
}

await checkDb(dbUrl);
report();

async function checkDb(url) {
  if (!url) return;
  let host, port;
  try {
    const u = new URL(url);
    host = u.hostname;
    port = Number(u.port || 5432);
  } catch {
    return fail("DATABASE_URL inválida", "Confira o formato: postgres://usuario:senha@host:porta/banco");
  }
  const reachable = await new Promise((resolve) => {
    const s = connect({ host, port, timeout: 4000 }, () => {
      s.end();
      resolve(true);
    });
    s.on("error", () => resolve(false));
    s.on("timeout", () => {
      s.destroy();
      resolve(false);
    });
  });
  if (reachable) ok("Banco de dados acessível", `${host}:${port}`);
  else if (host === "localhost" || host === "127.0.0.1")
    warn(
      `Banco local não está rodando (${host}:${port})`,
      "Rode: npm run db:dev  e copie a porta que ele mostrar para o .env. Só precisa do banco para rodar o app e os testes de integração.",
    );
  else fail(`Banco ${host}:${port} inacessível`, "Confira a rede/VPN e o DATABASE_URL.");
}

function report() {
  const icon = { ok: "✓", warn: "!", fail: "✗" };
  console.log("\nJT Portal ADM — verificação do ambiente\n");
  for (const r of results) {
    console.log(`${icon[r.s]} ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
    if (r.fix) console.log(`    → ${r.fix}`);
  }
  const fails = results.filter((r) => r.s === "fail").length;
  const warns = results.filter((r) => r.s === "warn").length;
  console.log(
    fails
      ? `\n${fails} problema(s) para resolver${warns ? ` e ${warns} aviso(s)` : ""}. Guia: docs/ambiente.md\n`
      : warns
        ? `\nPronto para desenvolver, com ${warns} aviso(s).\n`
        : "\nTudo certo: npm run check e npm run dev devem funcionar.\n",
  );
  process.exitCode = fails ? 1 : 0;
}
