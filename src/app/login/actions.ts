"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { isLoginBlocked, LOGIN_BLOCK_MINUTES, recordLoginAttempt } from "@/lib/auth/rate-limit";
import { createSession, destroySession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export type LoginState = { error?: string };

const schema = z.object({
  login: z.string().trim().toLowerCase().min(1, "Informe o usuário."),
  password: z.string().min(1, "Informe a senha."),
  next: z.string().optional(),
});

async function clientIp() {
  const h = await headers();
  return (
    h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido"
  );
}

// Só aceita caminhos internos, para não virar redirecionamento aberto.
const safeNext = (n?: string) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/");

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { login, password, next } = parsed.data;
  const ip = await clientIp();

  if (await isLoginBlocked(login, ip)) {
    return { error: `Muitas tentativas. Aguarde ${LOGIN_BLOCK_MINUTES} minutos e tente de novo.` };
  }

  const user = await db.user.findFirst({ where: { OR: [{ login }, { email: login }] } });
  const ok = !!user?.passwordHash && user.active && (await verifyPassword(password, user.passwordHash));
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
