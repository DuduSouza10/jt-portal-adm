"use server";

import { db } from "@/lib/db";
import { destroyOtherSessions, requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { hashPassword, PASSWORD_MIN, verifyPassword } from "@/lib/auth/password";

export type PasswordState = { error?: string; ok?: boolean };

export async function changePasswordAction(_: PasswordState, form: FormData): Promise<PasswordState> {
  const user = await requireUser({ allowPendingPasswordChange: true });
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const confirm = String(form.get("confirm") ?? "");

  if (next.length < PASSWORD_MIN) return { error: `A nova senha precisa ter ao menos ${PASSWORD_MIN} caracteres.` };
  if (next !== confirm) return { error: "A confirmação não confere." };
  if (next === current) return { error: "A nova senha deve ser diferente da atual." };

  const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!row.passwordHash || !(await verifyPassword(current, row.passwordHash))) return { error: "Senha atual incorreta." };

  const passwordHash = await hashPassword(next);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
    await audit({ actorId: user.id, action: "usuario.trocar-senha", entity: "User", entityId: user.id, summary: `${user.login} trocou a própria senha` }, tx);
  });
  // Quem tinha a senha antiga (outro navegador, celular perdido) perde o acesso; esta sessão continua.
  await destroyOtherSessions(user.id);
  return { ok: true };
}
