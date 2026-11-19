import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { getSlaSettings } from "@/lib/settings";
import { createTranslator } from "@/i18n/translate";
import { getLocale } from "@/i18n/server";
import { formatNumber, STATUS_LABEL } from "@/modules/solicitacoes/rules";
import { monthRange, stageTime, STAGES } from "@/modules/relatorios/sla";
import { filtroOptions, ordersInPeriod, spendLines, type Filtro } from "@/modules/relatorios/queries";
import { db } from "@/lib/db";

// Relatório do mês em CSV (abre no Excel). Segue a aba e os filtros da tela:
// - consumo: uma linha por insumo enviado (base, produto, quantidade, custo, total);
// - separação/expedição: solicitações separadas/enviadas no mês; demais: criadas no mês.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || !can(user, "relatorios.ver")) return new Response("Sem permissão", { status: 403 });
  const t = createTranslator(await getLocale());
  const now = new Date();
  const sp = new URL(req.url).searchParams;
  const { start, end, key } = monthRange(sp.get("mes") ?? undefined, now);
  const verValores = can(user, "produtos.precos");
  const visao = sp.get("visao") ?? "tudo";
  const opts = await filtroOptions(user);
  const pick = <T extends { id: string }>(list: T[], id: string | null) => (id && list.some((x) => x.id === id) ? id : undefined);
  const filtro: Filtro = { regionalId: pick(opts.regionais, sp.get("regional")), baseId: pick(opts.bases, sp.get("base")), almoxId: pick(opts.almoxarifados, sp.get("almox")) };

  const dt = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
  const num = (v: number | null, digits = 1) => (v == null ? "" : v.toFixed(digits).replace(".", ","));
  let header: string[];
  let rows: (string | number)[][];
  let nome: string;

  if (visao === "consumo" && verValores) {
    const linhas = await spendLines(user, start, end, filtro);
    header = [t("relatorios.csv.enviada"), t("relatorios.csv.base"), t("relatorios.csv.produto"), t("relatorios.csv.quantidade"), t("relatorios.csv.custoUnit"), t("relatorios.csv.valor")];
    rows = linhas
      .sort((a, b) => a.shippedAt.getTime() - b.shippedAt.getTime())
      .map((l) => [dt(l.shippedAt), l.base.code, `${l.produto.code} ${l.produto.name}`, l.quantity, num(l.unitCost, 2), l.unitCost == null ? "" : num(l.quantity * l.unitCost, 2)]);
    nome = `relatorio-consumo-${key}.csv`;
  } else {
    const campo = visao === "separacao" ? "separatedAt" : visao === "expedicao" ? "shippedAt" : "createdAt";
    const [orders, cfg] = await Promise.all([ordersInPeriod(user, start, end, filtro, campo), getSlaSettings()]);
    const valores = new Map<string, number>();
    if (verValores && orders.length) {
      const itens = await db.solicitacaoItem.findMany({ where: { solicitacaoId: { in: orders.map((o) => o.id) }, separated: { gt: 0 } }, select: { solicitacaoId: true, separated: true, unitCost: true } });
      for (const i of itens) if (i.unitCost != null) valores.set(i.solicitacaoId, (valores.get(i.solicitacaoId) ?? 0) + i.separated! * Number(i.unitCost));
    }
    header = [
      t("relatorios.csv.numero"), t("relatorios.csv.base"), t("relatorios.csv.almox"), t("relatorios.csv.prioridade"), t("relatorios.csv.status"),
      t("relatorios.csv.criada"), t("relatorios.csv.aprovada"), t("relatorios.csv.separada"), t("relatorios.csv.enviada"), t("relatorios.csv.recebida"),
      ...STAGES.flatMap((s) => [t("relatorios.csv.horas", { etapa: t(`relatorios.etapa.${s}`) }), ...(s === "entrega" ? [] : [t("relatorios.csv.noPrazo", { etapa: t(`relatorios.etapa.${s}`) })])]),
      ...(verValores ? [t("relatorios.csv.valor")] : []),
    ];
    rows = orders.map((o) => {
      const times = STAGES.map((s) => stageTime(o, s, now, cfg.businessHours, cfg.targets));
      return [
        formatNumber(o.number), o.base.code, o.almoxarifado?.code ?? "", o.priority === "URGENTE" ? "Urgente" : "Normal", STATUS_LABEL[o.status],
        dt(o.createdAt), dt(o.approvedAt), dt(o.separatedAt), dt(o.shippedAt), dt(o.receivedAt),
        ...times.flatMap((x, i) => [num(x.hours), ...(STAGES[i] === "entrega" ? [] : [x.ok == null ? (x.running ? t("relatorios.csv.correndo") : "") : x.ok ? t("relatorios.csv.sim") : t("relatorios.csv.nao")])]),
        ...(verValores ? [valores.has(o.id) ? num(valores.get(o.id)!, 2) : ""] : []),
      ];
    });
    nome = `relatorio-${visao === "tudo" ? "sla" : visao}-${key}.csv`;
  }
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}"`, "Cache-Control": "no-store" } });
}
