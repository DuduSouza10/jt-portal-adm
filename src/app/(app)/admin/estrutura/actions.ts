"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { firstIssue, runAction, type FormState } from "@/lib/action-result";
import { formToObject } from "@/lib/form";
import { baseSchema, regionalSchema } from "@/modules/estrutura/schemas";
import { deleteBase, saveBase, saveRegional } from "@/modules/estrutura/service";

export async function saveRegionalAction(id: string | null, _: FormState, form: FormData): Promise<FormState> {
  const actor = await requirePermission("estrutura.editar");
  const parsed = regionalSchema.safeParse(formToObject(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const result = await runAction("regional.salvar", () => saveRegional(actor, id, parsed.data).then(() => undefined), {
    uniqueMessage: "Já existe uma regional com essa sigla.",
  });
  if (result.error) return result;
  revalidatePath("/admin/estrutura");
  redirect("/admin/estrutura");
}

export async function saveBaseAction(id: string | null, _: FormState, form: FormData): Promise<FormState> {
  const actor = await requirePermission("estrutura.editar");
  const parsed = baseSchema.safeParse(formToObject(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const result = await runAction("base.salvar", () => saveBase(actor, id, parsed.data).then(() => undefined), {
    uniqueMessage: "Já existe uma base com essa sigla.",
  });
  if (result.error) return result;
  revalidatePath("/admin/estrutura");
  redirect("/admin/estrutura");
}

/** Exclui a base de vez (só sem histórico; senão a mensagem pede para desativar). */
export async function deleteBaseAction(id: string): Promise<FormState> {
  const actor = await requirePermission("estrutura.editar");
  const r = await runAction("base.excluir", async () => {
    await deleteBase(actor, id);
  });
  if (r.error) return r;
  revalidatePath("/admin/estrutura");
  redirect("/admin/estrutura");
}
