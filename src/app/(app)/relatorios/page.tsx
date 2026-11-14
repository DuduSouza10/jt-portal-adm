import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Download, Hourglass, Package, PackageCheck, Receipt, Timer, TrendingDown, TrendingUp, Truck, Wallet, X } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import { getSlaSettings } from "@/lib/settings";
import { getT } from "@/i18n/server";
import type { Translator } from "@/i18n/translate";
import { formatNumber } from "@/modules/solicitacoes/rules";
import {
  deltaPct,
  durationParts,
  lastMonths,
  lateNow,
  monthKeyOf,
  monthRange,
  spendBy,
  spendByMonth,
  STAGES,
  summarize,
  summarizeBy,
  TARGET_STAGES,
  type StageKey,
  type StageSummary,
} from "@/modules/relatorios/sla";
import { countInPeriod, filtroOptions, openOrders, ordersInPeriod, shippedStats, spendLines, stockValue, type Filtro, type ReportOrder } from "@/modules/relatorios/queries";
import { selectClass } from "@/components/form-field";
import { ChartTooltip } from "@/components/chart-tooltip";
import { Grafico3D } from "@/components/charts/grafico-3d";
import { dayCalendarGrid, spendMonthGrid } from "@/modules/relatorios/graficos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { param } from "@/components/pagination";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("relatorios.titulo") };
}

type Fmt = {
  nf: Intl.NumberFormat;
  money: Intl.NumberFormat;
  /** Duração em horas úteis (min/h). */
  h: (v: number | null) => string;
  /** Duração em horas corridas (min/h/dias). */
  dur: (v: number | null) => string;
  p: (v: number | null) => string;
  tone: (v: number | null) => string;
};

export const VISOES = ["tudo", "consumo", "sla", "separacao", "expedicao"] as const;
type Visao = (typeof VISOES)[number];

export default async function RelatoriosPage(props: PageProps<"/relatorios">) {
  const user = await requirePermission("relatorios.ver");
  const t = await getT();
  const now = new Date();
  const sp = await props.searchParams;
  const { start, end, key } = monthRange(param(sp, "mes"), now);
  const mesAtual = key === monthKeyOf(now);
  const verValores = can(user, "produtos.precos");
  const pedida = param(sp, "visao") as Visao;
  const visao: Visao = VISOES.includes(pedida) && (pedida !== "consumo" || verValores) ? pedida : "tudo";
  const cfg = await getSlaSettings();
  const bh = cfg.businessHours;
  const targets = cfg.targets;

  // Filtros (regional, base, almoxarifado): só aceita o que está no alcance de quem vê.
  const opts = await filtroOptions(user);
  const pick = <T extends { id: string }>(list: T[], id: string | undefined) => (id && list.some((x) => x.id === id) ? id : undefined);
  const filtro: Filtro = { regionalId: pick(opts.regionais, param(sp, "regional")), baseId: pick(opts.bases, param(sp, "base")), almoxId: pick(opts.almoxarifados, param(sp, "almox")) };
  const query = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const all = { mes: key, visao: visao === "tudo" ? undefined : visao, regional: filtro.regionalId, base: filtro.baseId, almox: filtro.almoxId, ...over };
    for (const [k, v] of Object.entries(all)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `?${s}` : "";
  };

  const ver = {
    consumo: verValores && (visao === "tudo" || visao === "consumo"),
    sla: visao === "tudo" || visao === "sla",
    separacao: visao === "separacao",
    expedicao: visao === "expedicao",
  };

  const meses = lastMonths(key, 6);
  const [mesAntes] = lastMonths(key, 2);
  const proximo = key === monthKeyOf(now) ? null : nextMonth(key);
  const inicio6 = monthRange(meses[0], now).start;
  const anterior = monthRange(mesAntes, now);
  // Separação e expedição olham o que foi separado/enviado no mês; o resto, o que foi pedido no mês.
  const campo = visao === "separacao" ? "separatedAt" : visao === "expedicao" ? "shippedAt" : "createdAt";
  const [orders, abertas, linhas6, estoque, contAntes, enviadas, enviadasAntes] = await Promise.all([
    ordersInPeriod(user, start, end, filtro, campo),
    openOrders(user, filtro),
    ver.consumo ? spendLines(user, inicio6, end, filtro) : Promise.resolve([]),
    ver.consumo ? stockValue(user, filtro) : Promise.resolve(null),
    countInPeriod(user, anterior.start, anterior.end, filtro, campo),
    shippedStats(user, start, end, filtro),
    shippedStats(user, anterior.start, anterior.end, filtro),
  ]);
  const linhas = linhas6.filter((l) => monthKeyOf(l.shippedAt) === key);
  const geral = summarize(orders, now, bh, targets);
  const porBase = summarizeBy(orders, (o) => o.base, now, bh, targets);
  const porAlmox = summarizeBy(orders, (o) => o.almoxarifado, now, bh, targets);
  const atrasadasTodas = lateNow(abertas, now, bh, targets);
  const atrasadas = ver.separacao ? atrasadasTodas.filter((a) => a.stage === "separacao") : ver.expedicao ? atrasadasTodas.filter((a) => a.stage === "expedicao") : atrasadasTodas;
  const gasto = ver.consumo ? spendBy(linhas) : null;
  const porMes = ver.consumo ? spendByMonth(linhas6, meses) : [];
  const gastoAntes = porMes[4]?.value ?? 0;
  const topProdutos = gasto ? [...gasto.byProduto].sort((x, y) => y.quantity - x.quantity).slice(0, 10) : [];
  const ticket = gasto && enviadas.count ? gasto.total / enviadas.count : null;
  const ticketAntes = enviadasAntes.count ? gastoAntes / enviadasAntes.count : null;
  const dataDoDia = (o: ReportOrder) => (campo === "separatedAt" ? o.separatedAt! : campo === "shippedAt" ? o.shippedAt! : o.createdAt);
  const fila = {
    separar: abertas.filter((o) => o.status === "APROVADA" || o.status === "EM_SEPARACAO").length,
    enviar: abertas.filter((o) => o.status === "SEPARADA").length,
  };

  const nf = new Intl.NumberFormat(t.locale, { maximumFractionDigits: 1 });
  const money = new Intl.NumberFormat(t.locale, { style: "currency", currency: "BRL" });
  const fmtDur = (v: number | null, d: boolean) => {
    const x = durationParts(v, { dias: d });
    return x ? t(`relatorios.duracao.${x.unit}`, { n: nf.format(x.value) }) : "—";
  };
  const fmt: Fmt = {
    nf,
    money,
    h: (v) => fmtDur(v, false),
    dur: (v) => fmtDur(v, true),
    p: (v) => (v == null ? "—" : `${nf.format(v)}%`),
    tone: (v) => (v == null ? "text-muted-foreground" : v >= 90 ? "text-success" : v >= 70 ? "text-warning" : "text-accent-foreground"),
  };
  const fora = TARGET_STAGES.reduce((s, k) => s + geral[k].late, 0);
  const semDadosSla = TARGET_STAGES.every((k) => geral[k].done === 0 && geral[k].running === 0);
  const mesNome = new Date(`${key}-15T12:00:00Z`).toLocaleDateString(t.locale, { month: "long", year: "numeric" });
  const mesLabel = mesNome.charAt(0).toUpperCase() + mesNome.slice(1);
  const filtroAtivo = [
    filtro.regionalId && opts.regionais.find((r) => r.id === filtro.regionalId)?.code,
    filtro.baseId && opts.bases.find((b) => b.id === filtro.baseId)?.code,
    filtro.almoxId && opts.almoxarifados.find((a) => a.id === filtro.almoxId)?.code,
  ].filter(Boolean);
  const visoes = VISOES.filter((v) => v !== "consumo" || verValores);

  // Gráficos 3D/2D: uma cor por regional.
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const mesCurto = meses.map((k) => cap(new Date(`${k}-15T12:00:00Z`).toLocaleDateString(t.locale, { month: "short", timeZone: "UTC" }).replace(".", "")));
  const metaGrafico = [mesLabel, filtroAtivo.length ? t("relatorios.filtrandoPor", { quais: filtroAtivo.join(", ") }) : null].filter(Boolean).join(" · ");
  const gridMes = ver.consumo ? spendMonthGrid(linhas6, meses) : null;
  const gridDia = dayCalendarGrid(orders.map((o) => ({ date: dataDoDia(o), regional: o.base.regional })), key, now);
  // 01/11/2026 foi domingo: dá os nomes curtos dos dias da semana no idioma da tela.
  const diasSemana = Array.from({ length: 7 }, (_, i) => cap(new Date(Date.UTC(2026, 10, 1 + i, 12)).toLocaleDateString(t.locale, { weekday: "short", timeZone: "UTC" }).replace(".", "")));
  const tituloDia = (k: string, i: number) =>
    new Date(`${k}T12:00:00Z`).toLocaleDateString(t.locale, { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }) + (i === gridDia.todayIndex ? ` · ${t("grafico3d.hoje")}` : "");
  const basesDaRegional = filtro.regionalId ? opts.bases.filter((b) => b.regionalId === filtro.regionalId) : opts.bases;

  const slaPanel = (
    <Panel
      title={t("relatorios.slaPorEtapa")}
      note={t("relatorios.slaPorEtapaNota")}
      aside={
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            fora ? "bg-warning/15 text-warning" : semDadosSla ? "bg-muted text-muted-foreground" : "bg-success/12 text-success",
          )}
        >
          {fora ? t("relatorios.foraNoMes", { n: fora }) : semDadosSla ? t("relatorios.semDadosMes") : t("relatorios.tudoNoPrazo")}
        </span>
      }
    >
      {(ver.separacao ? (["separacao"] as StageKey[]) : ver.expedicao ? (["expedicao", "entrega"] as StageKey[]) : STAGES).map((s) => (
        <StageRow key={s} t={t} fmt={fmt} stage={s} sum={geral[s]} target={s === "entrega" ? null : targets[s]} />
      ))}
    </Panel>
  );
  const atrasadasPanel = (
    <Panel
      title={t("relatorios.atrasadasAgora")}
      note={t("relatorios.atrasadasAgoraNota")}
      aside={<span className={cn("text-2xl font-semibold tabular-nums", atrasadas.length ? "text-warning" : "text-muted-foreground")}>{atrasadas.length}</span>}
    >
      {atrasadas.length === 0 ? (
        <p className="px-[18px] pt-2 pb-6 text-sm text-muted-foreground">{t("relatorios.nenhumaAtrasada")}</p>
      ) : (
        atrasadas.slice(0, 12).map((a) => (
          <Link key={`${a.order.id}:${a.stage}`} href={`/solicitacoes/${a.order.id}`} className="flex items-center gap-3 border-t px-[18px] py-2.5 text-sm first:border-t-0 hover:bg-muted/50">
            <span className="font-mono font-semibold">{formatNumber(a.order.number)}</span>
            <span className="text-muted-foreground">{a.order.base.code}</span>
            <span className="flex-1 truncate">{t(`relatorios.etapa.${a.stage}`)}</span>
            <span className="font-semibold tabular-nums text-accent-foreground">{fmt.h(a.hours)}</span>
            <span className="text-xs text-muted-foreground">/ {fmt.h(a.target)}</span>
          </Link>
        ))
      )}
    </Panel>
  );

  return (
    <>
      <PageHeader
        title={t("relatorios.titulo")}
        description={t("relatorios.descricao")}
        actions={
          <Button asChild variant="outline">
            <a href={`/api/relatorios/sla${query({})}`}>
              <Download /> {t("relatorios.exportar")}
            </a>
          </Button>
        }
      />

      {/* Abas de visão + filtros */}
      <div className="space-y-3">
        <nav className="flex gap-1 overflow-x-auto overflow-y-hidden border-b">
          {visoes.map((v) => (
            <Link
              key={v}
              href={`/relatorios${query({ visao: v === "tudo" ? undefined : v })}`}
              aria-current={visao === v ? "page" : undefined}
              className={cn(
                "relative flex h-10 items-center px-3 font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                visao === v && "text-foreground after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary",
              )}
            >
              {t(`relatorios.visao.${v}`)}
            </Link>
          ))}
        </nav>
        <form className="flex flex-wrap items-center gap-2">
          {visao !== "tudo" && <input type="hidden" name="visao" value={visao} />}
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="icon" aria-label={t("relatorios.mesAnterior")}>
              <Link href={`/relatorios${query({ mes: mesAntes })}`}>
                <ChevronLeft />
              </Link>
            </Button>
            <Input type="month" name="mes" defaultValue={key} max={monthKeyOf(now)} className="w-48" aria-label={t("relatorios.mes")} />
            {proximo ? (
              <Button asChild variant="outline" size="icon" aria-label={t("relatorios.mesSeguinte")}>
                <Link href={`/relatorios${query({ mes: proximo })}`}>
                  <ChevronRight />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="icon" disabled aria-label={t("relatorios.mesSeguinte")}>
                <ChevronRight />
              </Button>
            )}
          </div>
          {opts.regionais.length > 1 && (
            <select name="regional" defaultValue={filtro.regionalId ?? ""} className={`${selectClass} w-auto max-w-52`} aria-label={t("relatorios.filtroRegional")}>
              <option value="">{t("relatorios.todasRegionais")}</option>
              {opts.regionais.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.name}
                </option>
              ))}
            </select>
          )}
          {basesDaRegional.length > 1 && (
            <select name="base" defaultValue={filtro.baseId ?? ""} className={`${selectClass} w-auto max-w-52`} aria-label={t("relatorios.filtroBase")}>
              <option value="">{t("relatorios.todasBases")}</option>
              {basesDaRegional.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.name}
                </option>
              ))}
            </select>
          )}
          {opts.almoxarifados.length > 1 && (
            <select name="almox" defaultValue={filtro.almoxId ?? ""} className={`${selectClass} w-auto max-w-52`} aria-label={t("relatorios.filtroAlmox")}>
              <option value="">{t("relatorios.todosAlmox")}</option>
              {opts.almoxarifados.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          )}
          <Button type="submit" variant="outline">
            {t("comum.filtrar")}
          </Button>
          {filtroAtivo.length > 0 && (
            <Button asChild variant="ghost">
              <Link href={`/relatorios${query({ regional: undefined, base: undefined, almox: undefined })}`}>
                <X /> {t("relatorios.limparFiltros")}
              </Link>
            </Button>
          )}
        </form>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{mesLabel}</span>
          {mesAtual && <> · {t("relatorios.mesEmAndamento", { dia: now.toLocaleDateString(t.locale, { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) })}</>}
          {filtroAtivo.length > 0 && <> · {t("relatorios.filtrandoPor", { quais: filtroAtivo.join(", ") })}</>}
        </p>
      </div>

      {/* ---------------- Visão geral / Consumo */}
      {(visao === "tudo" || visao === "consumo") && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {gasto && (
            <Kpi icon={Wallet} label={t("relatorios.kpiGasto")} value={money.format(gasto.total)} delta={deltaPct(gasto.total, gastoAntes)} t={t} note={gasto.semCusto ? t("relatorios.semCustoNota", { n: gasto.semCusto }) : t("relatorios.kpiGastoNota")} />
          )}
          {visao === "tudo" ? (
            <Kpi icon={ClipboardList} label={t("relatorios.kpiSolicitacoes")} value={nf.format(orders.length)} delta={deltaPct(orders.length, contAntes)} t={t} note={t("relatorios.kpiSolicitacoesNota")} />
          ) : (
            <Kpi icon={Package} label={t("relatorios.kpiItensEnviados")} value={nf.format(gasto?.byProduto.reduce((s, p) => s + p.quantity, 0) ?? 0)} note={t("relatorios.kpiItensEnviadosNota", { n: gasto?.byProduto.length ?? 0 })} />
          )}
          {gasto && <Kpi icon={Receipt} label={t("relatorios.kpiTicket")} value={ticket == null ? "—" : money.format(ticket)} delta={ticket != null && ticketAntes ? deltaPct(ticket, ticketAntes) : null} t={t} note={t("relatorios.kpiTicketNota", { n: enviadas.count })} />}
          {visao === "tudo" ? (
            <Kpi
              icon={Timer}
              label={t("relatorios.kpiPrazoEnvio")}
              value={fmt.dur(enviadas.avgDays == null ? null : enviadas.avgDays * 24)}
              delta={enviadas.avgDays != null && enviadasAntes.avgDays ? deltaPct(enviadas.avgDays, enviadasAntes.avgDays) : null}
              better="down"
              t={t}
              note={t("relatorios.kpiPrazoEnvioNota")}
            />
          ) : (
            <Kpi icon={Truck} label={t("relatorios.kpiEnviadas")} value={nf.format(enviadas.count)} delta={deltaPct(enviadas.count, enviadasAntes.count)} t={t} note={t("relatorios.kpiEnviadasNota")} />
          )}
          {!gasto && (
            <>
              <Kpi icon={AlarmClock} label={t("relatorios.kpiAtrasadas")} value={nf.format(atrasadas.length)} valueClass={atrasadas.length ? "text-warning" : ""} note={t("relatorios.kpiAtrasadasNota", { n: fora })} />
              <Kpi icon={Timer} label={t("relatorios.kpiSeparacao")} value={fmt.p(geral.separacao.okPct)} valueClass={fmt.tone(geral.separacao.okPct)} note={t("relatorios.kpiMedia", { h: fmt.h(geral.separacao.avgHours) })} />
            </>
          )}
        </div>
      )}

      {gasto && gridMes && (
        <Grafico3D
          kind="meses"
          title={t("relatorios.gastoPorMes")}
          note={t("relatorios.gastoPorMesNota")}
          meta={metaGrafico}
          fileName={`gasto-por-mes-${key}`}
          series={gridMes.series}
          cells={gridMes.cells}
          xLabels={mesCurto}
          zLabels={gridMes.series.map((r) => r.code)}
          cellTitles={gridMes.cells.map((c) => `${gridMes.series[c.z].code} · ${mesCurto[c.x]}`)}
          highlightX={meses.length - 1}
          format="money"
          emptyText={t("relatorios.semEnvios")}
        />
      )}

      {/* ---------------- Separação / Expedição: números da etapa */}
      {(ver.separacao || ver.expedicao) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ver.separacao ? (
            <>
              <Kpi icon={PackageCheck} label={t("relatorios.kpiSeparadas")} value={nf.format(orders.length)} delta={deltaPct(orders.length, contAntes)} t={t} note={t("relatorios.kpiParciais", { n: orders.filter((o) => o.partial).length })} />
              <Kpi icon={CheckCircle2} label={t("relatorios.kpiNoPrazoEtapa")} value={fmt.p(geral.separacao.okPct)} valueClass={fmt.tone(geral.separacao.okPct)} note={t("relatorios.prazoNormal", { h: fmt.h(targets.separacao.normal) })} />
              <Kpi icon={Timer} label={t("relatorios.kpiTempoMedio")} value={fmt.h(geral.separacao.avgHours)} note={t("relatorios.etapaAjuda.separacao")} />
              <Kpi icon={Hourglass} label={t("relatorios.kpiAguardandoSeparar")} value={nf.format(fila.separar)} valueClass={atrasadas.length ? "text-warning" : ""} note={t("relatorios.kpiAtrasadasN", { n: atrasadas.length })} />
            </>
          ) : (
            <>
              <Kpi icon={Truck} label={t("relatorios.kpiEnviadas")} value={nf.format(orders.length)} delta={deltaPct(orders.length, contAntes)} t={t} note={t("relatorios.kpiRecebidas", { n: orders.filter((o) => o.receivedAt).length })} />
              <Kpi icon={CheckCircle2} label={t("relatorios.kpiNoPrazoEtapa")} value={fmt.p(geral.expedicao.okPct)} valueClass={fmt.tone(geral.expedicao.okPct)} note={t("relatorios.prazoNormal", { h: fmt.h(targets.expedicao.normal) })} />
              <Kpi icon={Timer} label={t("relatorios.kpiTempoMedio")} value={fmt.h(geral.expedicao.avgHours)} note={t("relatorios.etapaAjuda.expedicao")} />
              <Kpi icon={Hourglass} label={t("relatorios.kpiAguardandoEnvio")} value={nf.format(fila.enviar)} valueClass={atrasadas.length ? "text-warning" : ""} note={t("relatorios.kpiAtrasadasN", { n: atrasadas.length })} />
            </>
          )}
        </div>
      )}

      {/* ---------------- SLA */}
      {(ver.sla || ver.separacao || ver.expedicao) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {slaPanel}
          {atrasadasPanel}
        </div>
      )}

      {/* ---------------- Consumo: por base, estoque e produtos */}
      {(gasto || estoque) && (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {gasto && (
            <Panel title={t("relatorios.gastoPorRegional")} note={t("relatorios.noMes")}>
              <Bars
                empty={t("relatorios.semEnvios")}
                total={gasto.total}
                fmt={fmt}
                labels={{ valor: t("relatorios.valor"), participacao: t("relatorios.participacao") }}
                items={gasto.byRegional.map((r) => ({ key: r.id, label: `${r.code} · ${r.name}`, value: r.value, text: money.format(r.value) }))}
              />
            </Panel>
          )}
          {gasto && (
            <Panel title={t("relatorios.gastoPorBase")} note={t("relatorios.gastoPorBaseNota")}>
              <Bars
                empty={t("relatorios.semEnvios")}
                total={gasto.total}
                fmt={fmt}
                labels={{ valor: t("relatorios.valor"), participacao: t("relatorios.participacao") }}
                items={gasto.byBase.slice(0, 15).map((b) => ({ key: b.id, label: `${b.code} · ${b.name}`, value: b.value, text: money.format(b.value), extra: b.semCusto ? t("relatorios.itensSemCusto", { n: b.semCusto }) : undefined }))}
              />
            </Panel>
          )}
          {estoque && (
            <Panel title={t("relatorios.valorEstoque")} note={t("relatorios.valorEstoqueNota", { total: money.format(estoque.total) })}>
              <Bars
                empty={t("relatorios.semEstoque")}
                total={estoque.total}
                fmt={fmt}
                labels={{ valor: t("relatorios.valor"), participacao: t("relatorios.participacao") }}
                items={estoque.byAlmox.map((a) => ({ key: a.id, label: `${a.code} · ${a.name}`, value: a.value, text: money.format(a.value), extra: a.semCusto ? t("relatorios.produtosSemCustoN", { n: a.semCusto }) : undefined }))}
              />
            </Panel>
          )}
        </div>
      )}

      {gasto && topProdutos.length > 0 && (
        <section className="overflow-hidden rounded-[14px] border bg-card shadow-xs">
          <h2 className="px-[18px] pt-4 pb-2 text-[15px] font-semibold">{t("relatorios.produtosMaisSolicitados")}</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-[18px]">{t("relatorios.produto")}</TableHead>
                <TableHead className="text-right">{t("relatorios.quantidade")}</TableHead>
                <TableHead className="text-right">{t("relatorios.total")}</TableHead>
                <TableHead className="w-1/4 pr-[18px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {topProdutos.map((x) => (
                <TableRow key={x.id}>
                  <TableCell className="pl-[18px]">
                    <span className="font-medium">{x.name}</span> <span className="font-mono text-xs text-muted-foreground">{x.code}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{nf.format(x.quantity)}</TableCell>
                  <TableCell className="text-right tabular-nums">{x.value ? money.format(x.value) : "—"}</TableCell>
                  <TableCell className="pr-[18px]">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(x.quantity / topProdutos[0].quantity) * 100}%` }} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      {/* ---------------- Por dia e tabelas */}
      {visao !== "consumo" && (
        <Grafico3D
          kind="calendario"
          title={t(ver.separacao ? "relatorios.separadasPorDia" : ver.expedicao ? "relatorios.enviadasPorDia" : "relatorios.porDia")}
          note={t(ver.separacao ? "relatorios.separadasPorDiaNota" : ver.expedicao ? "relatorios.enviadasPorDiaNota" : "relatorios.porDiaNota", { n: orders.length })}
          meta={metaGrafico}
          fileName={`${visao === "tudo" ? "solicitacoes" : visao}-por-dia-${key}`}
          series={gridDia.series}
          cells={gridDia.cells}
          xLabels={diasSemana}
          zLabels={Array.from({ length: gridDia.weeks }, (_, i) => t("grafico3d.semana", { n: i + 1 }))}
          cellTitles={gridDia.cells.map((c, i) => tituloDia(c.key, i))}
          todayIndex={gridDia.todayIndex}
          format="count"
          emptyText={t("relatorios.semSolicitacoes")}
        />
      )}

      {ver.sla && <GroupTable t={t} fmt={fmt} title={t("relatorios.porBase")} rows={porBase} stages={["aprovacao", "separacao", "expedicao"]} />}
      {ver.sla && <GroupTable t={t} fmt={fmt} title={t("relatorios.porAlmox")} rows={porAlmox} stages={["separacao", "expedicao"]} />}
      {ver.separacao && <GroupTable t={t} fmt={fmt} title={t("relatorios.porAlmox")} rows={porAlmox} stages={["separacao"]} />}
      {ver.expedicao && <GroupTable t={t} fmt={fmt} title={t("relatorios.porAlmox")} rows={porAlmox} stages={["expedicao", "entrega"]} />}
      {(ver.separacao || ver.expedicao) && <GroupTable t={t} fmt={fmt} title={t("relatorios.porBase")} rows={porBase} stages={ver.separacao ? ["separacao"] : ["expedicao", "entrega"]} />}
      <p className="text-xs text-muted-foreground">{t("relatorios.rodape", { quando: fmtDateTime(now, t.locale) })}</p>
    </>
  );
}

function nextMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ componentes da página

function Panel({ title, note, aside, children }: { title: string; note?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[14px] border bg-card shadow-xs">
      <div className="flex items-start justify-between gap-3 px-[18px] pt-4 pb-2">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
        </div>
        {aside}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  note,
  valueClass,
  delta,
  better,
  t,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  note?: string;
  valueClass?: string;
  /** Variação % contra o mês anterior. */
  delta?: number | null;
  /** Quando subir/descer é bom (cor verde/vermelha). Sem isso, a variação fica neutra (ex.: gasto, volume). */
  better?: "up" | "down";
  t?: Translator;
}) {
  const good = delta == null || !better ? null : better === "up" ? delta >= 0 : delta <= 0;
  return (
    <div className="flex flex-col gap-1.5 rounded-[14px] border bg-card px-[18px] py-4 shadow-xs">
      <div className="flex items-center justify-between gap-2 text-[13px] font-medium text-muted-foreground">
        <span>{label}</span>
        <span className="flex size-[30px] items-center justify-center rounded-[9px] bg-muted">
          <Icon className="size-4" />
        </span>
      </div>
      <p className={cn("text-[28px] leading-tight font-semibold tracking-tight tabular-nums", valueClass)}>{value}</p>
      {t && delta !== undefined && (
        <p className="flex items-center justify-between gap-2 text-xs">
          {delta == null ? (
            <span className="text-muted-foreground">{t("relatorios.semComparacao")}</span>
          ) : (
            <span className={cn("inline-flex items-center gap-1 font-medium", good === null ? "text-foreground" : good ? "text-success" : "text-accent-foreground")}>
              {delta >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
              {`${delta >= 0 ? "+" : ""}${new Intl.NumberFormat(t.locale, { maximumFractionDigits: 1 }).format(delta)}%`}
            </span>
          )}
          <span className="text-muted-foreground">{t("relatorios.vsMesAnterior")}</span>
        </p>
      )}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

/** Linha de uma etapa: % no prazo (barra), tempo médio e prazo. */
function StageRow({ t, fmt, stage, sum, target }: { t: Translator; fmt: Fmt; stage: StageKey; sum: StageSummary; target: { normal: number; urgente: number } | null }) {
  const pct = sum.okPct;
  return (
    <div className="border-t px-[18px] py-3 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{t(`relatorios.etapa.${stage}`)}</span>
        {target ? (
          <span className={cn("tabular-nums font-semibold", fmt.tone(pct))}>{pct == null ? t("relatorios.semDados") : t("relatorios.pctNoPrazo", { p: fmt.p(pct) })}</span>
        ) : (
          <span className="tabular-nums font-semibold">{fmt.dur(sum.avgHours)}</span>
        )}
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
        <span>{t(`relatorios.etapaAjuda.${stage}`)}</span>
        <span>
          {target
            ? t("relatorios.mediaPrazo2", { media: fmt.h(sum.avgHours), normal: fmt.h(target.normal), urgente: fmt.h(target.urgente) })
            : t("relatorios.semPrazo")}
        </span>
      </div>
      {target && (
        <ChartTooltip
          className="mt-2"
          title={t(`relatorios.etapa.${stage}`)}
          rows={[
            { label: t("relatorios.noPrazo"), value: fmt.p(pct) },
            { label: t("relatorios.media"), value: fmt.h(sum.avgHours) },
            { label: t("relatorios.prazo"), value: `${fmt.h(target.normal)} · ${t("configuracoes.urgente").toLowerCase()} ${fmt.h(target.urgente)}` },
            { label: t("relatorios.concluidas"), value: String(sum.done) },
            { label: t("relatorios.foraDoPrazo"), value: String(sum.late) },
            { label: t("relatorios.correndo"), value: String(sum.running) },
          ]}
        >
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", pct == null ? "" : pct >= 90 ? "bg-success" : pct >= 70 ? "bg-warning" : "bg-primary")}
              style={{ width: `${pct ?? 0}%` }}
            />
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}

function Bars({
  items,
  empty,
  total,
  fmt,
  labels,
}: {
  items: { key: string; label: string; value: number; text: string; extra?: string }[];
  empty: string;
  total: number;
  fmt: Fmt;
  labels: { valor: string; participacao: string };
}) {
  if (!items.length) return <p className="px-[18px] pt-2 pb-6 text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="pb-3">
      {items.map((i) => {
        const share = total ? (i.value / total) * 100 : 0;
        return (
          <ChartTooltip key={i.key} title={i.label} rows={[{ label: labels.valor, value: i.text }, { label: labels.participacao, value: `${fmt.nf.format(share)}%` }]} note={i.extra} className="block px-[18px] py-2">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{i.label}</span>
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold">{i.text}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">{fmt.nf.format(share)}%</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary/85" style={{ width: `${(i.value / max) * 100}%` }} />
            </div>
            {i.extra && <p className="mt-0.5 text-[11px] text-muted-foreground">{i.extra}</p>}
          </ChartTooltip>
        );
      })}
    </div>
  );
}

function GroupTable({
  t,
  fmt,
  title,
  rows,
  stages,
}: {
  t: Translator;
  fmt: Fmt;
  title: string;
  rows: { id: string; code: string; name: string; total: number; stages: Record<StageKey, StageSummary> }[];
  stages: StageKey[];
}) {
  if (!rows.length) return null;
  return (
    <section className="overflow-hidden rounded-[14px] border bg-card shadow-xs">
      <h2 className="px-[18px] pt-4 pb-1 text-[15px] font-semibold">{title}</h2>
      <p className="px-[18px] pb-2 text-xs text-muted-foreground">{t("relatorios.tabelaNota")}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-[18px]">{t("relatorios.local")}</TableHead>
            <TableHead className="text-right">{t("relatorios.kpiSolicitacoes")}</TableHead>
            {stages.map((s) => (
              <TableHead key={s} className="text-right">
                {t(`relatorios.etapa.${s}`)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="pl-[18px]">
                <span className="font-medium">{r.code}</span> <span className="text-muted-foreground">{r.name}</span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.total}</TableCell>
              {stages.map((s) => (
                <TableCell key={s} className="text-right tabular-nums">
                  {s === "entrega" ? (
                    <span className="text-muted-foreground">{r.stages[s].done ? fmt.dur(r.stages[s].avgHours) : "—"}</span>
                  ) : r.stages[s].done ? (
                    <>
                      <span className={cn("font-semibold", fmt.tone(r.stages[s].okPct))}>{fmt.p(r.stages[s].okPct)}</span>
                      <span className="ml-1.5 text-xs text-muted-foreground">{fmt.h(r.stages[s].avgHours)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
