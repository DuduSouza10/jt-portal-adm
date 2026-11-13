import "server-only";
import { db } from "@/lib/db";
import { card, escapeMd, type Template } from "@/lib/feishu/cards";
import { feishuConfig } from "@/lib/feishu/config";
import { destinations, enqueue, processOutbox, type Route } from "@/lib/feishu/outbox";
import { fmtDate } from "@/lib/format";
import { errorInfo, logger } from "@/lib/logger";
import type { Permission } from "@/lib/permissions/catalog";
import { DEFAULT_BUSINESS_HOURS, formatDuration, isWithinBusinessHours } from "@/lib/sla";
import { ABERTOS, formatNumber, STATUS_LABEL } from "@/modules/solicitacoes/rules";
import { canRemindAgain, DEFAULT_REMINDERS, isDailySummaryDue, reminderKind, spDayKey, type ReminderKind } from "./select";

/**
 * Tarefas do agendador (Netlify Scheduled Function → /api/cron/run, a cada 15 min em horário comercial).
 * Trazidas do sistema antigo de insumos. Horário comercial e prazos: DEFAULT_BUSINESS_HOURS e DEFAULT_REMINDERS.
 */

const bh = DEFAULT_BUSINESS_HOURS;
const cfg = DEFAULT_REMINDERS;

/** Quem tem a permissão (qualquer alcance): destino dos lembretes por mensagem direta, se não houver grupo. */
async function idsCom(permission: Permission) {
  const rows = await db.user.findMany({ where: { active: true, profile: { permissions: { has: permission } } }, select: { id: true } });
  return rows.map((r) => r.id);
}

const LEMBRETE: Record<ReminderKind, { titulo: (n: number) => string; cor: Template; rota: Route; perm: Permission; link: string; botao: string }> = {
  pendente: { titulo: (n) => `⏰ ${n} solicitação(ões) aguardando aprovação`, cor: "orange", rota: "equipe", perm: "solicitacoes.aprovar", link: "/solicitacoes", botao: "Abrir solicitações" },
  aprovada: { titulo: (n) => `⏰ ${n} solicitação(ões) aprovada(s) e não separada(s)`, cor: "orange", rota: "equipe", perm: "expedicao.separar", link: "/separacao", botao: "Abrir separação" },
  separada: { titulo: (n) => `⏰ ${n} pedido(s) separado(s) e não enviado(s)`, cor: "violet", rota: "expedicao", perm: "expedicao.enviar", link: "/expedicao", botao: "Abrir expedição" },
};

/** Lembretes de pedidos parados (só em horário comercial), agrupados num cartão por tipo. */
export async function runReminders(now = new Date()) {
  if (!cfg.enabled || !isWithinBusinessHours(now, bh)) return { skipped: true };
  const abertos = await db.solicitacao.findMany({
    where: { status: { in: ["PENDENTE", "APROVADA", "EM_SEPARACAO", "SEPARADA"] } },
    select: { id: true, number: true, status: true, priority: true, statusChangedAt: true, base: { select: { code: true } } },
    orderBy: [{ priority: "desc" }, { statusChangedAt: "asc" }],
    take: 500,
  });
  const logs = await db.reminderLog.findMany({
    where: { refId: { in: abertos.map((o) => o.id) } },
    orderBy: { sentAt: "desc" },
  });
  const last = new Map<string, Date>();
  for (const l of logs) if (!last.has(`${l.refId}:${l.kind}`)) last.set(`${l.refId}:${l.kind}`, l.sentAt);

  const grupos: Record<ReminderKind, typeof abertos> = { pendente: [], aprovada: [], separada: [] };
  for (const o of abertos) {
    const kind = reminderKind(o, now, cfg, bh);
    if (kind && canRemindAgain(last.get(`${o.id}:${kind}`), now, cfg)) grupos[kind].push(o);
  }

  const { appUrl } = feishuConfig();
  const out: Record<string, number> = {};
  for (const kind of Object.keys(grupos) as ReminderKind[]) {
    const itens = grupos[kind];
    out[kind] = itens.length;
    if (!itens.length) continue;
    const l = LEMBRETE[kind];
    const linhas = itens
      .slice(0, 15)
      .map((o) => `${o.priority === "URGENTE" ? "🔥 " : "• "}[${formatNumber(o.number)}](${appUrl}/solicitacoes/${o.id}) · ${escapeMd(o.base.code)} · parado há ${formatDuration(now.getTime() - o.statusChangedAt.getTime())}`);
    if (itens.length > 15) linhas.push(`… e mais ${itens.length - 15}.`);
    await db.$transaction(async (tx) => {
      const dest = await destinations(tx, l.rota, await idsCom(l.perm));
      await enqueue(tx, `lembrete.${kind}`, dest, card(l.titulo(itens.length), l.cor, [linhas.join("\n")], `${appUrl}${l.link}`, l.botao));
      await tx.reminderLog.createMany({ data: itens.map((o) => ({ refId: o.id, kind })) });
    });
  }
  return out;
}

/** Resumo diário das solicitações em aberto (uma vez por dia útil, a partir do horário configurado). */
export async function runDailySummary(now = new Date()) {
  const day = spDayKey(now);
  const sent = await db.reminderLog.findFirst({ where: { kind: "daily", refId: day } });
  if (!isDailySummaryDue(now, cfg, bh, !!sent)) return { sent: false };

  const abertos = await db.solicitacao.findMany({
    where: { status: { in: ABERTOS } },
    select: { status: true, priority: true, base: { select: { code: true } } },
  });
  const total = abertos.length;
  const porStatus = ABERTOS.map((st) => [st, abertos.filter((o) => o.status === st).length] as const).filter(([, n]) => n);
  const porBase = new Map<string, number>();
  for (const o of abertos) porBase.set(o.base.code, (porBase.get(o.base.code) ?? 0) + 1);
  const urgentes = abertos.filter((o) => o.priority === "URGENTE").length;
  const { appUrl } = feishuConfig();
  const linhas = total
    ? [
        `**${total}** solicitação(ões) em aberto${urgentes ? ` · **${urgentes} urgente(s)**` : ""}`,
        `**Por status**\n${porStatus.map(([st, n]) => `• ${STATUS_LABEL[st]}: **${n}**`).join("\n")}`,
        `**Por base**\n${[...porBase].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([b, n]) => `• ${escapeMd(b)}: ${n}`).join("\n")}`,
      ]
    : ["Nenhuma solicitação em aberto. 🎉"];

  await db.$transaction(async (tx) => {
    const dest = await destinations(tx, "equipe", await idsCom("solicitacoes.aprovar"));
    await enqueue(tx, "resumo.diario", dest, card(`📋 Resumo das solicitações · ${fmtDate(now)}`, total ? "blue" : "green", linhas, `${appUrl}/solicitacoes`, "Abrir solicitações"));
    // Marca como enviado mesmo sem destino configurado, para não tentar a cada execução.
    await tx.reminderLog.create({ data: { refId: day, kind: "daily" } });
  });
  return { sent: true, open: total };
}

/** Fotos de envio com mais de 180 dias são apagadas (X5); o pedido continua, sem a foto. */
export const PHOTO_RETENTION_DAYS = 180;
export async function purgeOldShipmentPhotos(now = new Date()) {
  const r = await db.shipmentPhoto.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - PHOTO_RETENTION_DAYS * 86_400_000) } } });
  return { deleted: r.count };
}

/** Notificações do sino lidas há mais de 90 dias são apagadas (a tabela cresce com ~5.000 usuários). */
export async function purgeOldNotifications(now = new Date()) {
  const r = await db.notification.deleteMany({ where: { readAt: { lt: new Date(now.getTime() - 90 * 86_400_000) } } });
  return { deleted: r.count };
}

/** Tudo o que o agendador executa. Uma tarefa que falha não impede as outras. */
export async function runScheduledJobs(now = new Date()) {
  const result: Record<string, unknown> = {};
  for (const [name, job] of [
    ["reminders", () => runReminders(now)],
    ["dailySummary", () => runDailySummary(now)],
    ["outbox", () => processOutbox(50)],
    ["shipmentPhotos", () => purgeOldShipmentPhotos(now)],
    ["notifications", () => purgeOldNotifications(now)],
  ] as const) {
    try {
      result[name] = await job();
    } catch (e) {
      result[name] = { error: true };
      logger.error(`job.${name}.failed`, errorInfo(e));
    }
  }
  logger.info("jobs.run", result);
  return result;
}
