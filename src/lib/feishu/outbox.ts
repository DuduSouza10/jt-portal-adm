import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Card } from "@/lib/feishu/cards";
import { deliver, messagingConfig, podeEditar, type Channel } from "@/lib/feishu/send";
import { errorInfo, logger } from "@/lib/logger";

type Tx = Prisma.TransactionClient;
export type Destination = { channel: Channel; target: string | null };

/**
 * Para quem vai um aviso no Feishu (tudo pelo app/bot da J&T; o bot precisa estar no grupo):
 * - "equipe" (aprovação, separação): grupo de INSUMOS da regional > grupo geral (FEISHU_STAFF_CHAT_ID) > mensagem direta
 *   a cada destinatário com Feishu ligado.
 * - "expedicao": grupo de EXPEDIÇÃO da regional > grupo geral > mensagem direta. Nunca cai no grupo de insumos:
 *   são grupos diferentes (ex.: Insumos SP, Expedição SP, Insumos MG, Expedição MG, todos com o mesmo bot).
 * - "base": mensagem direta a cada destinatário + grupo da base (Base.feishuChatId).
 * Regional sem grupo cadastrado cai no geral: nada deixa de ser enviado.
 */
export type Route = "equipe" | "expedicao" | "base";
/** Grupos do Feishu de uma regional (Regional.feishuStaffChatId / feishuShippingChatId). */
export type RegionalChats = { feishuStaffChatId: string | null; feishuShippingChatId: string | null } | null;

/** Grupo de uma regional: o chat_id oc_... do grupo onde o bot está. Qualquer outra coisa (link de webhook antigo) não vale. */
function grupoRegional(v: string | null | undefined, app: boolean): Destination | null {
  if (!v || !v.startsWith("oc_")) return null;
  return app ? { channel: "chat", target: v } : null;
}

export async function destinations(
  tx: Tx,
  route: Route,
  userIds: string[],
  baseChatId?: string | null,
  regional?: RegionalChats,
): Promise<Destination[]> {
  const cfg = messagingConfig();
  if (!cfg.app) return []; // sem o app do bot não há como enviar
  const dms = async () => {
    if (!userIds.length) return [];
    const users = await tx.user.findMany({
      where: { id: { in: userIds }, active: true, feishuOpenId: { not: null } },
      select: { feishuOpenId: true },
    });
    return users.map((u) => ({ channel: "user" as const, target: u.feishuOpenId }));
  };
  if (route === "base") {
    const out: Destination[] = await dms();
    if (baseChatId) out.push({ channel: "chat", target: baseChatId });
    return out;
  }
  const proprio = grupoRegional(route === "expedicao" ? regional?.feishuShippingChatId : regional?.feishuStaffChatId, cfg.app);
  if (proprio) return [proprio];
  if (cfg.staffChatId) return [{ channel: "chat", target: cfg.staffChatId }];
  return dms();
}

/**
 * De onde sai o aviso de uma regional (para a tela do Feishu mostrar, sem adivinhar):
 * - "regional": o grupo dela (cada regional tem o de insumos e o de expedição, separados);
 * - "geral": a regional não tem esse grupo e cai no grupo geral (por isso duas regionais podem cair no mesmo);
 * - "semApp": tem o chat_id (oc_...) cadastrado, mas o app do bot não está configurado (não é usado);
 * - "nenhum": nada configurado.
 */
export type OrigemGrupo = "regional" | "geral" | "semApp" | "nenhum";
export async function origemDoGrupo(tx: Tx, route: "equipe" | "expedicao", regional: RegionalChats): Promise<OrigemGrupo> {
  const cfg = messagingConfig();
  const valor = route === "expedicao" ? regional?.feishuShippingChatId : regional?.feishuStaffChatId;
  if (grupoRegional(valor, cfg.app)) return "regional";
  if (valor?.startsWith("oc_")) return "semApp"; // cadastrado, mas sem o app do bot não é usado
  const dest = await destinations(tx, route, [], null, regional);
  if (!dest.length) return "nenhum";
  return "geral";
}

/** Opções do aviso: `refId` = solicitação dona do cartão (cada mudança de status edita o mesmo cartão); `soAtualiza` = não envia cartão novo. */
export type EnqueueOptions = { refId?: string; soAtualiza?: boolean };

/** Grava na fila de saída dentro da transação do evento: se o evento salvou, o aviso sai (cedo ou tarde). */
export async function enqueue(tx: Tx, event: string, dest: Destination[], card: Card, opts: EnqueueOptions = {}) {
  // Mesmo destino de grupo para dois públicos (ex.: grupo da equipe) recebe o cartão uma vez só.
  const unique = [...new Map(dest.map((d) => [`${d.channel}:${d.target}`, d])).values()];
  if (!unique.length) return;
  await tx.feishuOutbox.createMany({
    data: unique.map((d) => ({ event, channel: d.channel, target: d.target, payload: card as object, refId: opts.refId ?? null, soAtualiza: opts.soAtualiza ?? false })),
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
    // Mudanças da mesma solicitação para o mesmo destino saem em ordem (e uma por vez): a segunda edita o cartão que a primeira criou.
    if (row.refId && row.target) {
      const antes = await db.feishuOutbox.count({
        where: { status: "PENDING", refId: row.refId, channel: row.channel, target: row.target, createdAt: { lt: row.createdAt } },
      });
      if (antes) continue;
    }
    const claimed = await db.feishuOutbox.updateMany({
      where: { id: row.id, status: "PENDING", nextAttemptAt: row.nextAttemptAt },
      data: { nextAttemptAt: new Date(Date.now() + 2 * 60_000) },
    });
    if (claimed.count !== 1) continue;
    try {
      const cartao =
        row.refId && row.target
          ? await db.feishuCartao.findUnique({ where: { solicitacaoId_channel_target: { solicitacaoId: row.refId, channel: row.channel, target: row.target } } })
          : null;
      if (row.soAtualiza && (!cartao || !podeEditar(cartao.createdAt))) {
        // Quem nunca recebeu o cartão (ou o cartão é velho demais para editar) não recebe um novo só por uma mudança de status.
        await db.feishuOutbox.update({ where: { id: row.id }, data: { status: "SENT", sentAt: new Date(), attempts: row.attempts + 1, lastError: "Nada a editar: o cartão não foi enviado a este destino ou tem mais de 13 dias." } });
        continue;
      }
      const ultima = row.attempts + 1 >= MAX_ATTEMPTS;
      const r = await deliver(row.channel as Channel, row.target, row.payload as Card, cartao ? { messageId: cartao.messageId, enviadoEm: cartao.createdAt } : null, {
        enviarSeFalharEdicao: ultima && !row.soAtualiza,
      });
      if (row.refId && row.target && (!cartao || cartao.messageId !== r.messageId)) {
        await db.feishuCartao.upsert({
          where: { solicitacaoId_channel_target: { solicitacaoId: row.refId, channel: row.channel, target: row.target } },
          create: { solicitacaoId: row.refId, channel: row.channel, target: row.target, messageId: r.messageId },
          update: { messageId: r.messageId, createdAt: new Date() },
        });
      }
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
