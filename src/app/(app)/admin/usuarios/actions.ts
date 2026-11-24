"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { firstIssue, runAction, type FormState } from "@/lib/action-result";
import { formToObject } from "@/lib/form";
import { userSchema } from "@/modules/acessos/schemas";
import { aprovarAcesso, deleteUser, resetPassword, saveUser, setUserActive } from "@/modules/acessos/service";

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

/** Aprova quem está "Aguardando liberação" (vira Base/Franquia na base que o Feishu já vinculou). */
export async function aprovarAcessoAction(id: string): Promise<FormState> {
  const actor = await requirePermission("usuarios.editar");
  const r = await runAction("usuario.aprovar", async () => {
    const x = await aprovarAcesso(actor, id);
    return { ok: true, message: `Acesso de ${x.login} liberado como ${x.perfil}.` };
  });
  revalidatePath("/admin/usuarios");
  return r;
}

/** Desativa ou reativa (mantém o histórico). */
export async function setUserActiveAction(id: string, active: boolean): Promise<FormState> {
  const actor = await requirePermission("usuarios.editar");
  const r = await runAction("usuario.ativo", () => setUserActive(actor, id, active));
  revalidatePath("/admin/usuarios");
  return r;
}

/** Exclui de vez (só quem não tem histórico). */
export async function deleteUserAction(id: string): Promise<FormState> {
  const actor = await requirePermission("usuarios.excluir");
  const r = await runAction("usuario.excluir", async () => { await deleteUser(actor, id); });
  if (r.error) return r;
  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios");
}
