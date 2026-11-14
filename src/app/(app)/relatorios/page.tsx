import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, ChevronLeft, ChevronRight, ClipboardList, Download, Receipt, Timer, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import { getSlaSettings } from "@/lib/settings";
import { getT } from "@/i18n/server";
import type { Translator } from "@/i18n/translate";
import { formatNumber } from "@/modules/solicitacoes/rules";
import {
  countByDay,
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
import { countCreated, openOrders, ordersInPeriod, shippedStats, spendLines, stockValue } from "@/modules/relatorios/queries";
import { ChartTooltip } from "@/components/chart-tooltip";
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

export default async function RelatoriosPage(props: PageProps<"/relatorios">) {
  const user = await requirePermission("relatorios.ver");
  const t = await getT();
  const now = new Date();
  const { start, end, key } = monthRange(param(await props.searchParams, "mes"), now);
  const mesAtual = key === monthKeyOf(now);
  const verValores = can(user, "produtos.precos");
  const cfg = await getSlaSettings();
  const bh = cfg.businessHours;
  const targets = cfg.targets;

  // Gasto por mês: os 6 meses terminando no mês escolhido (como no protótipo). Mês anterior: para as comparações.
  const meses = lastMonths(key, 6);
  const [mesAntes] = lastMonths(key, 2);
  const proximo = lastMonths(key, 1)[0] === monthKeyOf(now) ? null : nextMonth(key);
  const inicio6 = monthRange(meses[0], now).start;
  const anterior = monthRange(mesAntes, now);
  const [orders, abertas, linhas6, estoque, criadasAntes, enviadas, enviadasAntes] = await Promise.all([
    ordersInPeriod(user, start, end),
    openOrders(user),
    verValores ? spendLines(user, inicio6, end) : Promise.resolve([]),
    verValores ? stockValue(user) : Promise.resolve(null),
    countCreated(user, anterior.start, anterior.end),
    shippedStats(user, start, end),
    shippedStats(user, anterior.start, anterior.end),
  ]);
  const linhas = linhas6.filter((l) => monthKeyOf(l.shippedAt) === key);
  const geral = summarize(orders, now, bh, targets);
  const porBase = summarizeBy(orders, (o) => o.base, now, bh, targets);
  const porAlmox = summarizeBy(orders, (o) => o.almoxarifado, now, bh, targets);
  const atrasadas = lateNow(abertas, now, bh, targets);
  const gasto = verValores ? spendBy(linhas) : null;
  const porMes = verValores ? spendByMonth(linhas6, meses) : [];
  const gastoAntes = porMes[4]?.value ?? 0;
  const topProdutos = gasto ? [...gasto.byProduto].sort((x, y) => y.quantity - x.quantity).slice(0, 10) : [];
  const ticket = gasto && enviadas.count ? gasto.total / enviadas.count : null;
  const ticketAntes = enviadasAntes.count ? gastoAntes / enviadasAntes.count : null;
  const dias = countByDay(
    orders.map((o) => o.createdAt),
    key,
    now,
  );

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

  return (
    <>
      <PageHeader
        title={t("relatorios.titulo")}
        description={t("relatorios.descricao")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex items-center gap-1">
              <Button asChild variant="outline" size="icon" aria-label={t("relatorios.mesAnterior")}>
                <Link href={`/relatorios?mes=${mesAntes}`}>
                  <ChevronLeft />
                </Link>
              </Button>
              <Input type="month" name="mes" defaultValue={key} max={monthKeyOf(now)} className="w-48" aria-label={t("relatorios.mes")} />
              {proximo ? (
                <Button asChild variant="outline" size="icon" aria-label={t("relatorios.mesSeguinte")}>
                  <Link href={`/relatorios?mes=${proximo}`}>
                    <ChevronRight />
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="icon" disabled aria-label={t("relatorios.mesSeguinte")}>
                  <ChevronRight />
                </Button>
              )}
              <Button type="submit" variant="outline">
                {t("comum.filtrar")}
              </Button>
            </form>
            <Button asChild variant="outline">
              <a href={`/api/relatorios/sla?mes=${key}`}>
                <Download /> {t("relatorios.exportar")}
              </a>
            </Button>
          </div>
        }
      />
      <p className="-mt-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{mesLabel}</span>
        {mesAtual && <> · {t("relatorios.mesEmAndamento", { dia: now.toLocaleDateString(t.locale, { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) })}</>}
      </p>

      {/* Visão geral do mês (como no protótipo), comparada com o mês anterior */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {gasto && (
          <Kpi
            icon={Wallet}
            label={t("relatorios.kpiGasto")}
            value={money.format(gasto.total)}
            delta={deltaPct(gasto.total, gastoAntes)}
            t={t}
            note={gasto.semCusto ? t("relatorios.semCustoNota", { n: gasto.semCusto }) : t("relatorios.kpiGastoNota")}
          />
        )}
        <Kpi icon={ClipboardList} label={t("relatorios.kpiSolicitacoes")} value={nf.format(orders.length)} delta={deltaPct(orders.length, criadasAntes)} t={t} note={t("relatorios.kpiSolicitacoesNota")} />
        {gasto && (
          <Kpi
            icon={Receipt}
            label={t("relatorios.kpiTicket")}
            value={ticket == null ? "—" : money.format(ticket)}
            delta={ticket != null && ticketAntes ? deltaPct(ticket, ticketAntes) : null}
            t={t}
            note={t("relatorios.kpiTicketNota", { n: enviadas.count })}
          />
        )}
        <Kpi
          icon={Timer}
          label={t("relatorios.kpiPrazoEnvio")}
          value={fmt.dur(enviadas.avgDays == null ? null : enviadas.avgDays * 24)}
          delta={enviadas.avgDays != null && enviadasAntes.avgDays ? deltaPct(enviadas.avgDays, enviadasAntes.avgDays) : null}
          better="down"
          t={t}
          note={t("relatorios.kpiPrazoEnvioNota")}
        />
        {!gasto && (
          <>
            <Kpi icon={AlarmClock} label={t("relatorios.kpiAtrasadas")} value={nf.format(atrasadas.length)} valueClass={atrasadas.length ? "text-warning" : ""} note={t("relatorios.kpiAtrasadasNota", { n: fora })} />
            <Kpi icon={Timer} label={t("relatorios.kpiSeparacao")} value={fmt.p(geral.separacao.okPct)} valueClass={fmt.tone(geral.separacao.okPct)} note={t("relatorios.kpiMedia", { h: fmt.h(geral.separacao.avgHours) })} />
          </>
        )}
      </div>

      {gasto && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Panel title={t("relatorios.gastoPorMes")} note={t("relatorios.gastoPorMesNota")}>
            <MonthBars t={t} fmt={fmt} items={porMes} current={key} />
          </Panel>
          <Panel title={t("relatorios.gastoPorRegional")} note={t("relatorios.noMes")}>
            <Bars
              empty={t("relatorios.semEnvios")}
              total={gasto.total}
              fmt={fmt}
              labels={{ valor: t("relatorios.valor"), participacao: t("relatorios.participacao") }}
              items={gasto.byRegional.map((r) => ({ key: r.id, label: `${r.code} · ${r.name}`, value: r.value, text: money.format(r.value) }))}
            />
          </Panel>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
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
          {STAGES.map((s) => (
            <StageRow key={s} t={t} fmt={fmt} stage={s} sum={geral[s]} target={s === "entrega" ? null : targets[s]} />
          ))}
        </Panel>

        <Panel
          title={t("relatorios.atrasadasAgora")}
          note={t("relatorios.atrasadasAgoraNota")}
          aside={<span className={cn("text-2xl font-semibold tabular-nums", atrasadas.length ? "text-warning" : "text-muted-foreground")}>{atrasadas.length}</span>}
        >
          {atrasadas.length === 0 ? (
            <p className="px-[18px] pt-2 pb-6 text-sm text-muted-foreground">{t("relatorios.nenhumaAtrasada")}</p>
          ) : (
            atrasadas.slice(0, 12).map((a) => (
              <Link
                key={`${a.order.id}:${a.stage}`}
                href={`/solicitacoes/${a.order.id}`}
                className="flex items-center gap-3 border-t px-[18px] py-2.5 text-sm first:border-t-0 hover:bg-muted/50"
              >
                <span className="font-mono font-semibold">{formatNumber(a.order.number)}</span>
                <span className="text-muted-foreground">{a.order.base.code}</span>
                <span className="flex-1 truncate">{t(`relatorios.etapa.${a.stage}`)}</span>
                <span className="font-semibold tabular-nums text-accent-foreground">{fmt.h(a.hours)}</span>
                <span className="text-xs text-muted-foreground">/ {fmt.h(a.target)}</span>
              </Link>
            ))
          )}
        </Panel>
      </div>

      {(gasto || estoque) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {gasto && (
            <Panel title={t("relatorios.gastoPorBase")} note={t("relatorios.gastoPorBaseNota")}>
              <Bars
                empty={t("relatorios.semEnvios")}
                total={gasto.total}
                fmt={fmt}
                labels={{ valor: t("relatorios.valor"), participacao: t("relatorios.participacao") }}
                items={gasto.byBase.slice(0, 15).map((b) => ({
                  key: b.id,
                  label: `${b.code} · ${b.name}`,
                  value: b.value,
                  text: money.format(b.value),
                  extra: b.semCusto ? t("relatorios.itensSemCusto", { n: b.semCusto }) : undefined,
                }))}
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
                items={estoque.byAlmox.map((a) => ({
                  key: a.id,
                  label: `${a.code} · ${a.name}`,
                  value: a.value,
                  text: money.format(a.value),
                  extra: a.semCusto ? t("relatorios.produtosSemCustoN", { n: a.semCusto }) : undefined,
                }))}
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

      <Panel title={t("relatorios.porDia")} note={t("relatorios.porDiaNota", { n: orders.length })}>
        <DayBars t={t} items={dias} />
      </Panel>

      <GroupTable t={t} fmt={fmt} title={t("relatorios.porBase")} rows={porBase} stages={["aprovacao", "separacao", "expedicao"]} />
      <GroupTable t={t} fmt={fmt} title={t("relatorios.porAlmox")} rows={porAlmox} stages={["separacao", "expedicao"]} />
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

/** Colunas dos 6 meses, com o valor em cima e o mês escolhido em destaque. */
function MonthBars({ t, fmt, items, current }: { t: Translator; fmt: Fmt; items: { key: string; value: number }[]; current: string }) {
  const max = Math.max(1, ...items.map((x) => x.value));
  const compact = new Intl.NumberFormat(t.locale, { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
  return (
    <div className="flex h-56 items-end gap-3 px-[18px] pt-2 pb-3">
      {items.map((m) => (
        <ChartTooltip key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={m.key.split("-").reverse().join("/")} rows={[{ label: t("relatorios.gasto"), value: fmt.money.format(m.value) }]}>
          <span className={cn("text-[11px] tabular-nums", m.key === current ? "font-semibold text-foreground" : "text-muted-foreground")}>{m.value ? compact.format(m.value) : "—"}</span>
          <div
            className={cn("w-full max-w-14 rounded-t-md transition-colors", m.key === current ? "bg-primary" : "bg-muted-foreground/25 hover:bg-muted-foreground/40")}
            style={{ height: `${m.value ? Math.max(3, (m.value / max) * 82) : 1}%` }}
          />
          <span className={cn("text-xs capitalize", m.key === current ? "font-semibold text-foreground" : "text-muted-foreground")}>
            {new Date(`${m.key}-15T12:00:00Z`).toLocaleDateString(t.locale, { month: "short" })}
          </span>
        </ChartTooltip>
      ))}
    </div>
  );
}

/** Uma coluna fina por dia do mês (inclusive os sem pedido), com os dias marcados embaixo. */
function DayBars({ t, items }: { t: Translator; items: { key: string; day: number; count: number; future: boolean }[] }) {
  if (!items.some((d) => d.count)) return <p className="px-[18px] pt-2 pb-6 text-sm text-muted-foreground">{t("relatorios.semSolicitacoes")}</p>;
  const max = Math.max(1, ...items.map((d) => d.count));
  const weekday = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString(t.locale, { weekday: "short", day: "2-digit", month: "2-digit" });
  return (
    <div className="px-[18px] pt-2 pb-3">
      <div className="flex h-32 items-end gap-[3px] border-b border-border">
        {items.map((d) => (
          <ChartTooltip key={d.key} className="flex h-full flex-1 items-end" title={weekday(d.key)} rows={[{ label: t("relatorios.kpiSolicitacoes"), value: String(d.count) }]}>
            <div
              className={cn("w-full rounded-t-sm", d.count ? "bg-primary/80 hover:bg-primary" : d.future ? "bg-transparent" : "bg-muted-foreground/30")}
              style={{ height: d.count ? `${Math.max(6, (d.count / max) * 100)}%` : "3px" }}
            />
          </ChartTooltip>
        ))}
      </div>
      <div className="mt-1 flex gap-[3px] text-[10px] text-muted-foreground tabular-nums">
        {items.map((d) => (
          <span key={d.key} className="flex-1 text-center">
            {d.day === 1 || d.day % 5 === 0 ? d.day : ""}
          </span>
        ))}
      </div>
      <p className="mt-1 text-right text-[11px] text-muted-foreground">{t("relatorios.maxDia", { n: max })}</p>
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
                  {r.stages[s].done ? (
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
