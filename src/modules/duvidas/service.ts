import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { card } from "@/lib/feishu/cards";
import { destinations, enqueue } from "@/lib/feishu/outbox";

/**
 * Dúvidas (balão de ajuda, E15): cada usuário tem UMA conversa com a equipe do portal. Quem tem
 * `duvidas.responder` (Dev, Administrador) recebe o aviso no sino e no Feishu (mensagem direta) e responde
 * em Administração → Dúvidas; a resposta chega ao usuário no sino, no Feishu e no próprio balão.
 */

type Tx = Prisma.TransactionClient;
const MAX = 1000;
const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const cut = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

function limpar(texto: string) {
  const t = texto.trim();
  if (!t) throw new DomainError("Escreva a mensagem.");
  if (t.length > MAX) throw new DomainError("Mensagem muito longa (até 1000 caracteres).");
  return t;
}

/** Quem responde as dúvidas: usuários ativos com duvidas.responder (ou "*"). */
async function equipe(tx: Tx) {
  return tx.user.findMany({
    where: { active: true, profile: { OR: [{ permissions: { has: "duvidas.responder" } }, { permissions: { has: "*" } }] } },
    select: { id: true },
  });
}

async function avisar(tx: Tx, userIds: string[], titulo: string, corpo: string, link: string, evento: string) {
  if (!userIds.length) return;
  await tx.notification.createMany({ data: userIds.map((userId) => ({ userId, title: titulo, body: cut(corpo), link, refType: "duvida" })) });
  await enqueue(tx, evento, await destinations(tx, "base", userIds), card(titulo, "blue", [cut(corpo)], `${appUrl()}${link}`));
}

/** O usuário manda uma dúvida (vai para a equipe). */
export async function enviarDuvida(user: CurrentUser, texto: string) {
  const t = limpar(texto);
  await db.$transaction(async (tx) => {
    await tx.duvidaMensagem.create({ data: { solicitanteId: user.id, autorId: user.id, texto: t } });
    const ids = (await equipe(tx)).map((u) => u.id).filter((id) => id !== user.id);
    await avisar(tx, ids, `Dúvida de ${user.name}`, t, `/admin/duvidas?u=${user.id}`, "duvida.nova");
  });
}

/** A equipe responde a conversa de um usuário. */
export async function responderDuvida(actor: CurrentUser, solicitanteId: string, texto: string) {
  if (!can(actor, "duvidas.responder")) throw new DomainError("Sem permissão.");
  const t = limpar(texto);
  await db.$transaction(async (tx) => {
    const quem = await tx.user.findUnique({ where: { id: solicitanteId }, select: { id: true, login: true } });
    if (!quem) throw new DomainError("Usuário não encontrado.");
    await tx.duvidaMensagem.create({ data: { solicitanteId, autorId: actor.id, texto: t, daEquipe: true } });
    await avisar(tx, [solicitanteId], "Resposta da equipe do Supply Dock", `${actor.name}: ${t}`, "/?duvidas=1", "duvida.resposta");
    await audit({ actorId: actor.id, action: "duvida.responder", entity: "User", entityId: solicitanteId, summary: `Respondeu a dúvida de ${quem.login}` }, tx);
  });
}

/** Conversa de um usuário (para o balão e para a tela da equipe). */
export function conversa(solicitanteId: string) {
  return db.duvidaMensagem.findMany({
    where: { solicitanteId },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, texto: true, daEquipe: true, createdAt: true, autor: { select: { name: true } } },
  });
}

/** Conversas para a equipe: uma linha por usuário, a mais recente primeiro; "pendente" = última mensagem é do usuário. */
export async function conversas() {
  const ultimas = await db.duvidaMensagem.findMany({
    distinct: ["solicitanteId"],
    orderBy: [{ solicitanteId: "asc" }, { createdAt: "desc" }],
    select: { solicitanteId: true, texto: true, daEquipe: true, createdAt: true, solicitante: { select: { name: true, login: true } } },
  });
  return ultimas.sort((a, b) => Number(!b.daEquipe) - Number(!a.daEquipe) || b.createdAt.getTime() - a.createdAt.getTime());
}

/** Janela em que o navegador ainda avisa o que chegou enquanto estava parado (aba dormindo, notebook fechado). */
export const AVISO_JANELA_MIN = 10;
/** Folga na "última checagem": uma mensagem gravada por uma transação lenta pode aparecer um pouco depois da hora dela. */
export const AVISO_FOLGA_S = 20;

/**
 * Avisos de dúvida (E21) ainda não lidos e mais novos que `desde`, para o navegador mostrar como notificação do sistema.
 * Só a aba de suporte: nada de outros avisos do sino. `desde` vazio = só devolve a hora do servidor (primeira checagem).
 */
export async function novosAvisosDuvida(userId: string, desde: Date | null) {
  const agora = new Date();
  if (!desde) return { agora, itens: [] };
  const limite = new Date(agora.getTime() - AVISO_JANELA_MIN * 60_000);
  const itens = await db.notification.findMany({
    where: { userId, refType: "duvida", readAt: null, createdAt: { gt: desde > limite ? desde : limite } },
    orderBy: { createdAt: "asc" },
    take: 5,
    select: { id: true, title: true, body: true, link: true },
  });
  return { agora, itens };
}
