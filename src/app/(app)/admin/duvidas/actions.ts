"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, requireUser } from "@/lib/auth/session";
import { runAction, type FormState } from "@/lib/action-result";
import { AVISO_FOLGA_S, conversa, enviarDuvida, novosAvisosDuvida, responderDuvida } from "@/modules/duvidas/service";

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

/**
 * Navegador: o que chegou de dúvida desde a última checagem (notificação do sistema, só para o suporte).
 * Devolve a hora do servidor (menos uma folga) para a próxima checagem, assim o relógio do computador não importa.
 */
export async function novosAvisosDuvidaAction(desde: string | null) {
  const user = await requireUser();
  const d = desde ? new Date(desde) : null;
  const r = await novosAvisosDuvida(user.id, d && !Number.isNaN(d.getTime()) ? d : null);
  return { desde: new Date(r.agora.getTime() - AVISO_FOLGA_S * 1000).toISOString(), itens: r.itens };
}
