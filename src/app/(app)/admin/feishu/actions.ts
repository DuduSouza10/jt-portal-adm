"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { testCard } from "@/lib/feishu/cards";
import { feishuConfig } from "@/lib/feishu/config";
import { destinations, enqueue, processOutbox, retryOutbox } from "@/lib/feishu/outbox";
import { messagingConfig } from "@/lib/feishu/send";
import { runScheduledJobs } from "@/lib/jobs/run";

export type TestState = { ok?: boolean; message?: string; error?: string };

/** Envia um cartão de teste agora: para o grupo da equipe, da expedição ou para o próprio usuário. */
export async function sendTestAction(alvo: "equipe" | "expedicao" | "eu"): Promise<TestState> {
  const me = await requirePermission("integracoes.gerenciar");
  const cfg = messagingConfig();
  let dest;
  if (alvo === "eu") {
    if (!cfg.app) return { error: "Falta configurar o app do Feishu (FEISHU_APP_ID e FEISHU_APP_SECRET)." };
    const u = await db.user.findUnique({ where: { id: me.id }, select: { feishuOpenId: true } });
    if (!u?.feishuOpenId) return { error: "Seu usuário não tem o open_id do Feishu. Preencha em Usuários → seu cadastro." };
    dest = [{ channel: "user" as const, target: u.feishuOpenId }];
  } else {
    dest = await destinations(db, alvo, []);
    if (!dest.length)
      return {
        error:
          alvo === "expedicao"
            ? "Nenhum destino para a expedição: configure o webhook do grupo da expedição ou o da equipe."
            : "Nenhum destino para a equipe: configure o webhook do grupo, o chat do grupo ou o app do Feishu.",
      };
  }
  await db.$transaction(async (tx) => {
    await enqueue(tx, "teste", dest, testCard(feishuConfig().appUrl, me.name));
    await audit({ actorId: me.id, action: "feishu.teste", entity: "FeishuOutbox", summary: `Enviou teste do Feishu (${alvo})` }, tx);
  });
  const r = await processOutbox();
  revalidatePath("/admin/feishu");
  return r.failed
    ? { error: "O Feishu recusou a mensagem. Veja o erro na lista abaixo." }
    : { ok: true, message: `Mensagem de teste enviada (${dest.length} destino(s)).` };
}

export async function retryAction(id: string) {
  await requirePermission("integracoes.gerenciar");
  await retryOutbox(id);
  await processOutbox();
  revalidatePath("/admin/feishu");
}

export async function runJobsNowAction(): Promise<TestState> {
  await requirePermission("integracoes.gerenciar");
  const r = await runScheduledJobs();
  revalidatePath("/admin/feishu");
  return { ok: true, message: `Executado: ${JSON.stringify(r)}` };
}
