"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { firstIssue, runAction, type FormState } from "@/lib/action-result";
import { formToObject } from "@/lib/form";
import { produtoSchema } from "@/modules/produtos/schemas";
import { saveProduto } from "@/modules/produtos/service";

export async function saveProdutoAction(id: string | null, _: FormState, form: FormData): Promise<FormState> {
  const actor = await requirePermission("produtos.editar");
  const parsed = produtoSchema.safeParse(formToObject(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const result = await runAction("produto.salvar", () => saveProduto(actor, id, parsed.data).then(() => undefined), {
    uniqueMessage: "Já existe um produto com esse código.",
  });
  if (result.error) return result;
  revalidatePath("/produtos");
  redirect("/produtos");
}
