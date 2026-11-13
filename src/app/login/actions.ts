"use server";

import { headers } from "next/headers";
import { pickClientIp } from "@/lib/client-ip";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { safeNext } from "@/lib/auth/redirect";
import { isLoginBlocked, LOGIN_BLOCK_MINUTES, recordLoginAttempt } from "@/lib/auth/rate-limit";
import { createSession, destroySession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export type LoginState = { error?: string };

const schema = z.object({
  login: z.string().trim().toLowerCase().min(1, "Informe o usuário."),
  password: z.string().min(1, "Informe a senha."),
  next: z.string().optional(),
});

// Só cabeçalho preenchido pela hospedagem (ver src/lib/client-ip.ts): o cliente não consegue forjar.
async function clientIp() {
  const h = await headers();
  return pickClientIp((n) => h.get(n), process.env);
}

// Hash de uma senha qualquer: usuário inexistente também gasta um bcrypt, para o tempo de resposta
// não revelar quais logins existem.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString("hex")));

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { login, password, next } = parsed.data;
  const ip = await clientIp();

  if (await isLoginBlocked(login, ip)) {
    return { error: `Muitas tentativas. Aguarde ${LOGIN_BLOCK_MINUTES} minutos e tente de novo.` };
  }

  const user = await db.user.findFirst({ where: { OR: [{ login }, { email: login }] } });
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  const ok = !!user?.passwordHash && user.active && passwordOk;
  await recordLoginAttempt(login, ip, ok);

  if (!ok || !user) {
    logger.warn("login.failed", { login, ip });
    return { error: "Usuário ou senha inválidos." };
  }

  await createSession(user.id);
  logger.info("login.ok", { userId: user.id });
  redirect(user.mustChangePassword ? "/conta/senha" : safeNext(next));
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
