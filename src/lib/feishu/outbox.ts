import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Card } from "@/lib/feishu/cards";
import { deliver, messagingConfig, SHIPPING_WEBHOOK_TARGET, type Channel } from "@/lib/feishu/send";
import { errorInfo, logger } from "@/lib/logger";

type Tx = Prisma.TransactionClient;
export type Destination = { channel: Channel; target: string | null };

/**
 * Para quem vai um aviso no Feishu:
 * - "equipe" (aprovação, separação): grupo da equipe via app (FEISHU_STAFF_CHAT_ID) > webhook do grupo
 *   (FEISHU_WEBHOOK_URL) > mensagem direta a cada destinatário com Feishu ligado.
 * - "expedicao": webhook do grupo da expedição (FEISHU_SHIPPING_WEBHOOK_URL) > mesmo caminho da equipe.
 * - "base": mensagem direta a cada destinatário + grupo da base (Base.feishuChatId). Precisa do app.
 */
export type Route = "equipe" | "expedicao" | "base";

export async function destinations(tx: Tx, route: Route, userIds: string[], baseChatId?: string | null): Promise<Destination[]> {
  const cfg = messagingConfig();
  const dms = async () => {
    if (!cfg.app || !userIds.length) return [];
    const users = await tx.user.findMany({
      where: { id: { in: userIds }, active: true, feishuOpenId: { not: null } },
      select: { feishuOpenId: true },
    });
    return users.map((u) => ({ channel: "user" as const, target: u.feishuOpenId }));
  };
  if (route === "base") {
    const out: Destination[] = await dms();
    if (cfg.app && baseChatId) out.push({ channel: "chat", target: baseChatId });
    return out;
  }
  if (route === "expedicao" && cfg.shippingWebhook) return [{ channel: "webhook", target: SHIPPING_WEBHOOK_TARGET }];
  if (cfg.app && cfg.staffChatId) return [{ channel: "chat", target: cfg.staffChatId }];
  if (cfg.webhook) return [{ channel: "webhook", target: null }];
  return dms();
}

/** Grava na fila de saída dentro da transação do evento: se o evento salvou, o aviso sai (cedo ou tarde). */
export async function enqueue(tx: Tx, event: string, dest: Destination[], card: Card) {
  // Mesmo destino de grupo para dois públicos (ex.: grupo da equipe) recebe o cartão uma vez só.
  const unique = [...new Map(dest.map((d) => [`${d.channel}:${d.target}`, d])).values()];
  if (!unique.length) return;
  await tx.feishuOutbox.createMany({
    data: unique.map((d) => ({ event, channel: d.channel, target: d.target, payload: card as object })),
  });
}

// Espera entre tentativas: 1 min, 5 min, 15 min, 1 h, 3 h. Depois disso, FAILED.
export const BACKOFF_MINUTES = [1, 5, 15, 60, 180];
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1;
export const nextDelayMinutes = (attempts: number) => BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];

/**
 * Envia o que estiver pendente. Cada linha é "reservada" antes do envio (empurrando nextAttemptAt),
 * então duas execuções simultâneas não mandam a mesma mensagem duas vezes.
 */
export async function processOutbox(limit = 25) {
  const due = await db.feishuOutbox.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let sent = 0;
  let failed = 0;
  for (const row of due) {
    const claimed = await db.feishuOutbox.updateMany({
      where: { id: row.id, status: "PENDING", nextAttemptAt: row.nextAttemptAt },
      data: { nextAttemptAt: new Date(Date.now() + 2 * 60_000) },
    });
    if (claimed.count !== 1) continue;
    try {
      await deliver(row.channel as Channel, row.target, row.payload as Card);
      await db.feishuOutbox.update({
        where: { id: row.id },
        data: { status: "SENT", sentAt: new Date(), attempts: row.attempts + 1, lastError: null },
      });
      sent++;
    } catch (e) {
      const attempts = row.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      await db.feishuOutbox.update({
        where: { id: row.id },
        data: {
          attempts,
          lastError: (e instanceof Error ? e.message : String(e)).slice(0, 500),
          status: giveUp ? "FAILED" : "PENDING",
          nextAttemptAt: new Date(Date.now() + nextDelayMinutes(attempts) * 60_000),
        },
      });
      failed++;
      logger.warn("feishu.outbox.failed", { id: row.id, event: row.event, attempts, giveUp, ...errorInfo(e) });
    }
  }
  if (due.length) logger.info("feishu.outbox.run", { due: due.length, sent, failed });
  return { due: due.length, sent, failed };
}

/** Admin: recoloca uma mensagem que falhou na fila. */
export async function retryOutbox(id: string) {
  await db.feishuOutbox.update({
    where: { id },
    data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: null },
  });
}
