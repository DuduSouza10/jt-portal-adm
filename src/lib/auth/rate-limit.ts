import "server-only";
import { db } from "@/lib/db";
import { UNKNOWN_IP } from "@/lib/client-ip";
import { errorInfo, logger } from "@/lib/logger";

// Rate limit de login no banco (memória não serve em serverless: cada instância é isolada).
const WINDOW_MIN = 15;
/** Mesmo login, mesmo IP: o caso normal de alguém tentando adivinhar a senha. */
const MAX_PER_LOGIN_IP = 5;
/**
 * Mesmo login, de qualquer IP: segura ataque distribuído. É mais alto que o anterior para que
 * outra pessoa não consiga travar a conta de alguém com 5 tentativas de outro lugar.
 */
const MAX_PER_LOGIN = 30;
/**
 * Por IP o limite é alto de propósito: numa base, dezenas de funcionários saem pelo MESMO IP (NAT).
 * Ele só segura ataque automatizado em massa.
 */
const MAX_PER_IP = 300;

export async function isLoginBlocked(login: string, ip: string) {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000);
  const failed = { success: false, createdAt: { gte: since } };
  // IP desconhecido (hospedagem sem cabeçalho confiável): sobra só o limite por login. Contar por
  // "desconhecido" juntaria todas as bases num IP só e qualquer um travaria o login de todos.
  if (ip === UNKNOWN_IP) return (await db.loginAttempt.count({ where: { ...failed, login } })) >= MAX_PER_LOGIN;
  const [byLoginIp, byLogin, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { ...failed, login, ip } }),
    db.loginAttempt.count({ where: { ...failed, login } }),
    db.loginAttempt.count({ where: { ...failed, ip } }),
  ]);
  return byLoginIp >= MAX_PER_LOGIN_IP || byLogin >= MAX_PER_LOGIN || byIp >= MAX_PER_IP;
}

export async function recordLoginAttempt(login: string, ip: string, success: boolean) {
  await db.loginAttempt.create({ data: { login, ip, success } });
  if (success) {
    // Login bem-sucedido zera as falhas daquele usuário.
    await db.loginAttempt.deleteMany({ where: { login, success: false } });
  }
  // Limpeza oportunista: em ~1% dos logins apaga tentativas antigas e sessões expiradas,
  // para as tabelas não crescerem sem parar (≈ 5.000 usuários). Sem job agendado para manter.
  if (Math.random() < 0.01) void cleanupAuthTables();
}

export async function cleanupAuthTables() {
  try {
    const dayAgo = new Date(Date.now() - 86_400_000);
    const [attempts, sessions] = await Promise.all([
      db.loginAttempt.deleteMany({ where: { createdAt: { lt: dayAgo } } }),
      db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    ]);
    logger.info("auth.cleanup", { attempts: attempts.count, sessions: sessions.count });
  } catch (e) {
    logger.error("auth.cleanup.failed", errorInfo(e));
  }
}

export const LOGIN_BLOCK_MINUTES = WINDOW_MIN;

// ---------------------------------------------------------------- Criar conta (franquias)
// A tela é pública: o limite segura quem tentar criar contas em massa. Usa a mesma tabela do login,
// com um "login" que nenhum usuário real pode ter (o cadastro só aceita [a-z0-9._-]) e success=true,
// para não se misturar com as tentativas de login (que contam só as que falharam).
const SIGNUP_KEY = "#cadastro";
const SIGNUP_WINDOW_MIN = 60;
/** Por IP: uma base inteira (mesmo IP por NAT) consegue cadastrar várias pessoas, mas não centenas. */
const SIGNUP_MAX_PER_IP = 10;
/** IP desconhecido (hospedagem sem cabeçalho confiável): teto único para todo mundo. */
const SIGNUP_MAX_UNKNOWN = 60;

export const SIGNUP_BLOCK_MINUTES = SIGNUP_WINDOW_MIN;

export async function isSignupBlocked(ip: string) {
  const since = new Date(Date.now() - SIGNUP_WINDOW_MIN * 60_000);
  const unknown = ip === UNKNOWN_IP;
  const n = await db.loginAttempt.count({ where: { login: SIGNUP_KEY, success: true, createdAt: { gte: since }, ...(unknown ? {} : { ip }) } });
  return n >= (unknown ? SIGNUP_MAX_UNKNOWN : SIGNUP_MAX_PER_IP);
}

export async function recordSignupAttempt(ip: string) {
  await db.loginAttempt.create({ data: { login: SIGNUP_KEY, ip, success: true } });
}
