"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { runAction, type FormState } from "@/lib/action-result";
import { escolherMinhasBases } from "@/modules/acessos/service";

export async function salvarMinhasBasesAction(_: FormState, form: FormData): Promise<FormState> {
  const actor = await requirePermission("bases.escolher");
  const r = await runAction("usuario.minhas-bases", async () => {
    await escolherMinhasBases(actor, form.getAll("baseIds").map(String));
    return { ok: true, message: "Bases salvas." };
  });
  revalidatePath("/", "layout");
  return r;
}
