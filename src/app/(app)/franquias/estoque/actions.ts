"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { firstIssue, runAction, type FormState } from "@/lib/action-result";
import { formToObject } from "@/lib/form";
import { usoFranquiaSchema } from "@/modules/estoque/schemas";
import { registrarUsoFranquia } from "@/modules/estoque/service";

/** Franquia registra o que usou do próprio estoque (K7). */
export async function registrarUsoAction(_: FormState, form: FormData): Promise<FormState> {
  const actor = await requirePermission("franquias.estoque");
  const parsed = usoFranquiaSchema.safeParse(formToObject(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const r = await runAction("franquia.uso", async () => {
    await registrarUsoFranquia(actor, parsed.data);
    return { ok: true, message: "Uso registrado." };
  });
  revalidatePath("/franquias/estoque");
  return r;
}
