import "server-only";
import { db } from "@/lib/db";

// Rate limit de login no banco (memória não serve em serverless: cada instância é isolada).
const WINDOW_MIN = 15;
const MAX_PER_LOGIN = 5;
// Por IP o limite é alto de propósito: numa base, dezenas de funcionários saem pelo MESMO IP (NAT).
// Ele só segura ataque automatizado; a proteção real contra adivinhar senha é o limite por login.
const MAX_PER_IP = 300;

export async function isLoginBlocked(login: string, ip: string) {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000);
  const [byLogin, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { login, success: false, createdAt: { gte: since } } }),
    db.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } }),
  ]);
  return byLogin >= MAX_PER_LOGIN || byIp >= MAX_PER_IP;
}

export async function recordLoginAttempt(login: string, ip: string, success: boolean) {
  await db.loginAttempt.create({ data: { login, ip, success } });
  if (success) {
    // Login bem-sucedido zera as falhas daquele usuário.
    await db.loginAttempt.deleteMany({ where: { login, success: false } });
  }
}

export const LOGIN_BLOCK_MINUTES = WINDOW_MIN;
