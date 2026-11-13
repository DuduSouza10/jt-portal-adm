// Envio de mensagens: webhook de bot de grupo (custom bot) ou app bot (Open Platform).
import { createHmac } from "node:crypto";
import { FeishuError, getTenantAccessToken } from "@/lib/feishu/client";
import { feishuConfig } from "@/lib/feishu/config";
import type { Card } from "@/lib/feishu/cards";

export type Channel = "webhook" | "chat" | "user";

/** Assinatura do custom bot: base64(HMAC-SHA256(chave = "timestamp\nsecret", mensagem vazia)). */
export function webhookSign(timestamp: number, secret: string) {
  return createHmac("sha256", `${timestamp}\n${secret}`).update("").digest("base64");
}

export async function sendWebhookCard(card: Card, url = process.env.FEISHU_WEBHOOK_URL, secret = process.env.FEISHU_WEBHOOK_SECRET) {
  if (!url) throw new FeishuError("FEISHU_WEBHOOK_URL não configurado.");
  const body: Record<string, unknown> = { msg_type: "interactive", card };
  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000);
    body.timestamp = String(timestamp);
    body.sign = webhookSign(timestamp, secret);
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => null)) as { code?: number; StatusCode?: number; msg?: string } | null;
  const code = json?.code ?? json?.StatusCode;
  if (!res.ok || (code !== undefined && code !== 0))
    throw new FeishuError(`Webhook Feishu: ${json?.msg ?? `HTTP ${res.status}`} (código ${code})`, code);
}

/** App bot: envia para um grupo (chat_id) ou para uma pessoa (open_id). */
export async function sendAppCard(receiveIdType: "chat_id" | "open_id", receiveId: string, card: Card) {
  const token = await getTenantAccessToken();
  const { baseUrl } = feishuConfig();
  const res = await fetch(`${baseUrl}/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ receive_id: receiveId, msg_type: "interactive", content: JSON.stringify(card) }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => null)) as { code?: number; msg?: string } | null;
  if (!json || json.code !== 0)
    throw new FeishuError(`Mensagem Feishu: ${json?.msg ?? `HTTP ${res.status}`} (código ${json?.code})`, json?.code);
}

/** Webhook do grupo da expedição (bot personalizado próprio). */
export const SHIPPING_WEBHOOK_TARGET = "expedicao";

export async function deliver(channel: Channel, target: string | null, card: Card) {
  if (channel === "webhook" && target === SHIPPING_WEBHOOK_TARGET) {
    const url = process.env.FEISHU_SHIPPING_WEBHOOK_URL;
    if (!url) throw new FeishuError("FEISHU_SHIPPING_WEBHOOK_URL não configurado.");
    return sendWebhookCard(card, url, process.env.FEISHU_SHIPPING_WEBHOOK_SECRET);
  }
  if (channel === "webhook") return sendWebhookCard(card);
  if (!target) throw new FeishuError("Destino vazio.");
  return sendAppCard(channel === "chat" ? "chat_id" : "open_id", target, card);
}

/** O que está configurado para mensagens. */
export function messagingConfig() {
  const c = feishuConfig();
  return {
    webhook: !!process.env.FEISHU_WEBHOOK_URL,
    shippingWebhook: !!process.env.FEISHU_SHIPPING_WEBHOOK_URL,
    app: !!(c.appId && c.appSecret),
    staffChatId: process.env.FEISHU_STAFF_CHAT_ID || "",
  };
}
