import "server-only";
import { db } from "@/lib/db";
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
