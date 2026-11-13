import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { getSlaSettings } from "@/lib/settings";
import { createTranslator } from "@/i18n/translate";
import { getLocale } from "@/i18n/server";
import { formatNumber, STATUS_LABEL } from "@/modules/solicitacoes/rules";
import { monthRange, stageTime, STAGES } from "@/modules/relatorios/sla";
import { ordersInPeriod } from "@/modules/relatorios/queries";
import { db } from "@/lib/db";

// Relatório do mês em CSV (abre no Excel): uma linha por solicitação, com o tempo de cada etapa e se ficou no prazo.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || !can(user, "relatorios.ver")) return new Response("Sem permissão", { status: 403 });
  const t = createTranslator(await getLocale());
  const now = new Date();
  const { start, end, key } = monthRange(new URL(req.url).searchParams.get("mes") ?? undefined, now);
  const [orders, cfg] = await Promise.all([ordersInPeriod(user, start, end), getSlaSettings()]);
  const verValores = can(user, "produtos.precos");
  const valores = new Map<string, number>();
  if (verValores && orders.length) {
    const itens = await db.solicitacaoItem.findMany({ where: { solicitacaoId: { in: orders.map((o) => o.id) }, separated: { gt: 0 } }, select: { solicitacaoId: true, separated: true, unitCost: true } });
    for (const i of itens) if (i.unitCost != null) valores.set(i.solicitacaoId, (valores.get(i.solicitacaoId) ?? 0) + i.separated! * Number(i.unitCost));
  }

  const dt = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
  const num = (v: number | null) => (v == null ? "" : v.toFixed(1).replace(".", ","));
  const header = [
    t("relatorios.csv.numero"), t("relatorios.csv.base"), t("relatorios.csv.almox"), t("relatorios.csv.prioridade"), t("relatorios.csv.status"),
    t("relatorios.csv.criada"), t("relatorios.csv.aprovada"), t("relatorios.csv.separada"), t("relatorios.csv.enviada"), t("relatorios.csv.recebida"),
    ...STAGES.flatMap((s) => [t("relatorios.csv.horas", { etapa: t(`relatorios.etapa.${s}`) }), ...(s === "entrega" ? [] : [t("relatorios.csv.noPrazo", { etapa: t(`relatorios.etapa.${s}`) })])]),
    ...(verValores ? [t("relatorios.csv.valor")] : []),
  ];
  const rows = orders.map((o) => {
    const times = STAGES.map((s) => stageTime(o, s, now, cfg.businessHours, cfg.targets));
    return [
      formatNumber(o.number), o.base.code, o.almoxarifado?.code ?? "", o.priority === "URGENTE" ? "Urgente" : "Normal", STATUS_LABEL[o.status],
      dt(o.createdAt), dt(o.approvedAt), dt(o.separatedAt), dt(o.shippedAt), dt(o.receivedAt),
      ...times.flatMap((x, i) => [num(x.hours), ...(STAGES[i] === "entrega" ? [] : [x.ok == null ? (x.running ? t("relatorios.csv.correndo") : "") : x.ok ? t("relatorios.csv.sim") : t("relatorios.csv.nao")])]),
      ...(verValores ? [valores.has(o.id) ? valores.get(o.id)!.toFixed(2).replace(".", ",") : ""] : []),
    ];
  });
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="relatorio-sla-${key}.csv"`, "Cache-Control": "no-store" },
  });
}
