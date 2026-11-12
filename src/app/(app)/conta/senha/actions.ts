"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
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

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });
  return { ok: true };
}
