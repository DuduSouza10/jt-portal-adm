// Envio de mensagens pelo app/bot da J&T (Open Platform). Webhooks de grupo não são mais usados (2026-11-25):
// só o app consegue editar o cartão já enviado, que é o que o portal faz a cada mudança de status.
import { FeishuError, getTenantAccessToken } from "@/lib/feishu/client";
import { botConfig, feishuConfig, isBotEnabled } from "@/lib/feishu/config";
import type { Card } from "@/lib/feishu/cards";

export type Channel = "chat" | "user";

type Envelope<T> = { code?: number; msg?: string; data?: T };

async function botCall<T>(path: string, init: { method: "POST" | "PATCH"; body: unknown }): Promise<T | undefined> {
  const token = await getTenantAccessToken("bot");
  const { baseUrl } = botConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    method: init.method,
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
    body: JSON.stringify(init.body),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!json || json.code !== 0) throw new FeishuError(`Mensagem Feishu: ${json?.msg ?? `HTTP ${res.status}`} (código ${json?.code})`, json?.code);
  return json.data;
}

/** Envia um cartão (grupo: chat_id; pessoa: open_id ou union_id) e devolve o message_id, que serve para editá-lo depois. */
export async function sendAppCard(receiveIdType: "chat_id" | "open_id" | "union_id", receiveId: string, card: Card): Promise<string> {
  const data = await botCall<{ message_id?: string }>(`/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`, {
    method: "POST",
    body: { receive_id: receiveId, msg_type: "interactive", content: JSON.stringify(card) },
  });
  if (!data?.message_id) throw new FeishuError("O Feishu aceitou a mensagem mas não devolveu o message_id.");
  return data.message_id;
}

/**
 * Edita um cartão que o bot já enviou. Regras do Feishu: o cartão precisa ter `config.update_multi: true` (antes e depois),
 * só vale até 14 dias do envio e o limite é de 5 edições por segundo na mesma mensagem.
 */
export async function updateAppCard(messageId: string, card: Card): Promise<void> {
  await botCall(`/open-apis/im/v1/messages/${encodeURIComponent(messageId)}`, { method: "PATCH", body: { content: JSON.stringify(card) } });
}

/** O Feishu só deixa editar cartão com até 14 dias; usamos 13 para não esbarrar no limite por diferença de relógio. */
export const DIAS_PARA_EDITAR = 13;
export const podeEditar = (enviadoEm: Date, agora = new Date()) => agora.getTime() - enviadoEm.getTime() < DIAS_PARA_EDITAR * 86_400_000;

// O open_id é "por app": o que o login guardou (app do Entrar com Feishu) não vale para o bot. O union_id é o mesmo
// nos apps da mesma empresa, então a pessoa é achada pelo app do login e a mensagem vai pelo union_id.
const unionIds = new Map<string, string>();
export async function unionIdDe(openId: string): Promise<string> {
  const guardado = unionIds.get(openId);
  if (guardado) return guardado;
  const token = await getTenantAccessToken("login");
  const { baseUrl } = feishuConfig();
  const res = await fetch(`${baseUrl}/open-apis/contact/v3/users/${encodeURIComponent(openId)}?user_id_type=open_id`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => null)) as Envelope<{ user?: { union_id?: string } }> | null;
  const union = json?.data?.user?.union_id;
  if (!json || json.code !== 0 || !union)
    throw new FeishuError(`Não achei o union_id da pessoa no Feishu: ${json?.msg ?? `HTTP ${res.status}`} (código ${json?.code}). O app do login precisa da permissão de contatos.`, json?.code);
  unionIds.set(openId, union);
  return union;
}

export type Entrega = { messageId: string; acao: "enviado" | "editado" };

/**
 * Entrega um cartão. Com `messageId` (cartão já enviado antes para este destino) e dentro do prazo, edita o mesmo cartão;
 * senão envia um novo. Se a edição falhar, o erro sobe (a fila tenta de novo); `enviarSeFalharEdicao` troca a
 * edição por um cartão novo na última tentativa, para a pessoa nunca ficar sem saber da mudança.
 */
export async function deliver(
  channel: Channel,
  target: string | null,
  card: Card,
  anterior?: { messageId: string; enviadoEm: Date } | null,
  opts: { enviarSeFalharEdicao?: boolean } = {},
): Promise<Entrega> {
  if (!target) throw new FeishuError("Destino vazio.");
  if (!isBotEnabled()) throw new FeishuError("App do bot não configurado (FEISHU_BOT_APP_ID e FEISHU_BOT_APP_SECRET).");
  if (anterior && podeEditar(anterior.enviadoEm)) {
    try {
      await updateAppCard(anterior.messageId, card);
      return { messageId: anterior.messageId, acao: "editado" };
    } catch (e) {
      if (!opts.enviarSeFalharEdicao) throw e;
    }
  }
  const messageId = channel === "chat" ? await sendAppCard("chat_id", target, card) : await sendAppCard("union_id", await unionIdDe(target), card);
  return { messageId, acao: "enviado" };
}

/** O que está configurado para mensagens. */
export function messagingConfig() {
  const c = botConfig();
  return { app: isBotEnabled(), staffChatId: c.staffChatId };
}
