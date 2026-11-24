"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, requireUser } from "@/lib/auth/session";
import { runAction, type FormState } from "@/lib/action-result";
import { conversa, enviarDuvida, responderDuvida } from "@/modules/duvidas/service";

/** Balão: a conversa do próprio usuário. */
export async function minhaConversaAction() {
  const user = await requireUser();
  const msgs = await conversa(user.id);
  return msgs.map((m) => ({ id: m.id, texto: m.texto, daEquipe: m.daEquipe, autor: m.autor?.name ?? null, em: m.createdAt.toISOString() }));
}

/** Balão: manda uma dúvida. */
export async function enviarDuvidaAction(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  return runAction("duvida.enviar", () => enviarDuvida(user, String(form.get("texto") ?? "")));
}

/** Tela da equipe: responde a conversa de um usuário. */
export async function responderDuvidaAction(solicitanteId: string, _: FormState, form: FormData): Promise<FormState> {
  const actor = await requirePermission("duvidas.responder");
  const r = await runAction("duvida.responder", () => responderDuvida(actor, solicitanteId, String(form.get("texto") ?? "")));
  revalidatePath("/admin/duvidas");
  return r;
}
