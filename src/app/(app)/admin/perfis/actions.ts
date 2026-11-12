"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { firstIssue, runAction, type FormState } from "@/lib/action-result";
import { formToObject } from "@/lib/form";
import { profileSchema } from "@/modules/acessos/schemas";
import { saveProfile } from "@/modules/acessos/service";

export async function saveProfileAction(id: string | null, _: FormState, form: FormData): Promise<FormState> {
  const actor = await requirePermission("perfis.gerenciar");
  const parsed = profileSchema.safeParse(formToObject(form, ["permissions"]));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const result = await runAction("perfil.salvar", () => saveProfile(actor, id, parsed.data).then(() => undefined), {
    uniqueMessage: "Já existe um tipo de acesso com essa chave.",
  });
  if (result.error) return result;
  revalidatePath("/admin/perfis");
  redirect("/admin/perfis");
}
