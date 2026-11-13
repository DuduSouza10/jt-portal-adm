"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { firstIssue, runAction, type FormState } from "@/lib/action-result";
import { formToObject } from "@/lib/form";
import { userSchema } from "@/modules/acessos/schemas";
import { resetPassword, saveUser } from "@/modules/acessos/service";

export async function saveUserAction(id: string | null, _: FormState, form: FormData): Promise<FormState> {
  const actor = await requirePermission("usuarios.editar");
  const parsed = userSchema.safeParse(formToObject(form, ["baseIds", "regionalIds"]));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const result = await runAction(
    "usuario.salvar",
    async () => {
      const r = await saveUser(actor, id, parsed.data);
      // Criação: fica na página para mostrar a senha temporária.
      if (r.tempPassword)
        return {
          ok: true,
          message: `Usuário criado. Senha temporária: ${r.tempPassword} (anote e passe para a pessoa; ela troca no primeiro acesso).`,
        };
    },
    { uniqueMessage: "Já existe um usuário com esse login, e-mail ou matrícula." },
  );
  if (result.error) return result;
  revalidatePath("/admin/usuarios");
  if (result.message) return result;
  redirect("/admin/usuarios");
}

export async function resetPasswordAction(id: string): Promise<FormState> {
  const actor = await requirePermission("usuarios.editar");
  return runAction("usuario.senha", async () => {
    const r = await resetPassword(actor, id);
    return {
      ok: true,
      message: `Nova senha temporária de ${r.login}: ${r.tempPassword}. As sessões abertas foram encerradas.`,
    };
  });
}
