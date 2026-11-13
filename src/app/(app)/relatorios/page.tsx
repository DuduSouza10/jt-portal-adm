import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, CheckCircle2, ClipboardList, Download, Receipt, Timer, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import { getSlaSettings } from "@/lib/settings";
import { getT } from "@/i18n/server";
import type { Translator } from "@/i18n/translate";
import { formatNumber } from "@/modules/solicitacoes/rules";
import { deltaPct, lastMonths, lateNow, monthKeyOf, monthRange, spendBy, spendByMonth, STAGES, summarize, summarizeBy, TARGET_STAGES, type StageKey, type StageSummary } from "@/modules/relatorios/sla";
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

export default async function RelatoriosPage(props: PageProps<"/relatorios">) {
  const user = await requirePermission("relatorios.ver");
  const t = await getT();
  const now = new Date();
  const { start, end, key } = monthRange(param(await props.searchParams, "mes"), now);
  const verValores = can(user, "produtos.precos");
  const cfg = await getSlaSettings();
  const bh = cfg.businessHours;
  const targets = cfg.targets;

  // Gasto por mês: os 6 meses terminando no mês escolhido (como no protótipo). Mês anterior: para as comparações.
  const meses = lastMonths(key, 6);
  const inicio6 = monthRange(meses[0], now).start;
  const anterior = monthRange(meses[4], now);
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
  const maxMes = Math.max(1, ...porMes.map((x) => x.value));
  const topProdutos = gasto ? [...gasto.byProduto].sort((x, y) => y.quantity - x.quantity).slice(0, 10) : [];
  const maxQtd = Math.max(1, ...topProdutos.map((x) => x.quantity));
  const ticket = gasto && enviadas.count ? gasto.total / enviadas.count : null;
  const ticketAntes = enviadasAntes.count ? gastoAntes / enviadasAntes.count : null;

  const nf = new Intl.NumberFormat(t.locale, { maximumFractionDigits: 1 });
  const money = new Intl.NumberFormat(t.locale, { style: "currency", currency: "BRL" });
  const h = (v: number | null) => (v == null ? "—" : t("relatorios.horas", { h: nf.format(v) }));
  const p = (v: number | null) => (v == null ? "—" : `${nf.format(v)}%`);
  const tone = (v: number | null) => (v == null ? "" : v >= 90 ? "text-success" : v >= 70 ? "text-warning" : "text-accent-foreground");
  const fora = TARGET_STAGES.reduce((s, k) => s + geral[k].late, 0);
  const diasNoMes = new Map<string, number>();
  for (const o of orders) {
    const d = o.createdAt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    diasNoMes.set(d, (diasNoMes.get(d) ?? 0) + 1);
  }
  const maxDia = Math.max(1, ...diasNoMes.values());

  return (
    <>
      <PageHeader
        title={t("relatorios.titulo")}
        description={t("relatorios.descricao")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex items-center gap-2">
              <Input type="month" name="mes" defaultValue={key} className="w-40" aria-label={t("relatorios.mes")} />
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

      {/* Visão geral do mês (como no protótipo), comparada com o mês anterior */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {gasto && (
          <Kpi icon={Wallet} label={t("relatorios.kpiGasto")} value={money.format(gasto.total)} delta={deltaPct(gasto.total, gastoAntes)} t={t} note={gasto.semCusto ? t("relatorios.semCustoNota", { n: gasto.semCusto }) : undefined} />
        )}
        <Kpi icon={ClipboardList} label={t("relatorios.kpiSolicitacoes")} value={nf.format(orders.length)} delta={deltaPct(orders.length, criadasAntes)} t={t} />
        {gasto && <Kpi icon={Receipt} label={t("relatorios.kpiTicket")} value={ticket == null ? "—" : money.format(ticket)} delta={ticket != null && ticketAntes ? deltaPct(ticket, ticketAntes) : null} t={t} />}
        <Kpi
          icon={Timer}
          label={t("relatorios.kpiPrazoEnvio")}
          value={enviadas.avgDays == null ? "—" : t("relatorios.dias", { n: nf.format(enviadas.avgDays) })}
          delta={enviadas.avgDays != null && enviadasAntes.avgDays ? deltaPct(enviadas.avgDays, enviadasAntes.avgDays) : null}
          inverse
          t={t}
        />
      </div>

      {gasto && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Panel title={t("relatorios.gastoPorMes")} note={t("relatorios.gastoPorMesNota")}>
            <div className="flex h-48 items-end gap-3 px-[18px] pt-2 pb-2">
              {porMes.map((m) => (
                <ChartTooltip
                  key={m.key}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                  title={m.key.split("-").reverse().join("/")}
                  rows={[{ label: t("relatorios.gasto"), value: money.format(m.value) }]}
                >
                  <div className={cn("w-full max-w-14 rounded-t", m.key === key ? "bg-primary" : "bg-muted-foreground/25 hover:bg-muted-foreground/40")} style={{ height: `${Math.max(2, (m.value / maxMes) * 100)}%` }} />
                  <span className="text-xs text-muted-foreground">{new Date(`${m.key}-15T12:00:00Z`).toLocaleDateString(t.locale, { month: "short" })}</span>
                </ChartTooltip>
              ))}
            </div>
          </Panel>
          <Panel title={t("relatorios.gastoPorRegional")}>
            <Bars
              empty={t("relatorios.semEnvios")}
              items={gasto.byRegional.map((r) => ({ key: r.id, label: `${r.code} · ${r.name}`, value: r.value, text: money.format(r.value), rows: [{ label: t("relatorios.gasto"), value: money.format(r.value) }] }))}
            />
          </Panel>
        </div>
      )}

      {/* SLA das solicitações */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TARGET_STAGES.map((st) => (
          <Kpi
            key={st}
            icon={CheckCircle2}
            label={t("relatorios.kpiNoPrazo", { etapa: t(`relatorios.etapa.${st}`) })}
            value={p(geral[st].okPct)}
            valueClass={tone(geral[st].okPct)}
            note={t("relatorios.kpiMedia", { h: h(geral[st].avgHours) })}
          />
        ))}
        <Kpi icon={AlarmClock} label={t("relatorios.kpiAtrasadas")} value={nf.format(atrasadas.length)} valueClass={atrasadas.length ? "text-warning" : ""} note={t("relatorios.kpiAtrasadasNota", { n: fora })} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("relatorios.slaPorEtapa")} note={t("relatorios.slaPorEtapaNota")}>
          {STAGES.map((s) => (
            <StageBar key={s} t={t} stage={s} sum={geral[s]} target={s === "entrega" ? null : targets[s].normal} h={h} p={p} tone={tone} />
          ))}
        </Panel>

        <Panel title={t("relatorios.atrasadasAgora")} note={t("relatorios.atrasadasAgoraNota")}>
          {atrasadas.length === 0 ? (
            <p className="px-[18px] py-6 text-sm text-muted-foreground">{t("relatorios.nenhumaAtrasada")}</p>
          ) : (
            atrasadas.slice(0, 12).map((a) => (
              <Link key={`${a.order.id}:${a.stage}`} href={`/solicitacoes/${a.order.id}`} className="flex items-center gap-3 border-t px-[18px] py-2.5 text-sm first:border-t-0 hover:bg-muted/50">
                <span className="font-mono font-semibold">{formatNumber(a.order.number)}</span>
                <span className="text-muted-foreground">{a.order.base.code}</span>
                <span className="flex-1 truncate">{t(`relatorios.etapa.${a.stage}`)}</span>
                <span className="font-semibold tabular-nums text-accent-foreground">{h(a.hours)}</span>
                <span className="text-xs text-muted-foreground">/ {h(a.target)}</span>
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
                items={gasto.byBase.slice(0, 15).map((b) => ({
                  key: b.id,
                  label: `${b.code} · ${b.name}`,
                  value: b.value,
                  text: money.format(b.value),
                  rows: [{ label: t("relatorios.gasto"), value: money.format(b.value) }, ...(b.semCusto ? [{ label: t("relatorios.semCusto"), value: nf.format(b.semCusto) }] : [])],
                }))}
              />
            </Panel>
          )}
          {estoque && (
            <Panel title={t("relatorios.valorEstoque")} note={t("relatorios.valorEstoqueNota", { total: money.format(estoque.total) })}>
              <Bars
                empty={t("relatorios.semEstoque")}
                items={estoque.byAlmox.map((a) => ({
                  key: a.id,
                  label: `${a.code} · ${a.name}`,
                  value: a.value,
                  text: money.format(a.value),
                  rows: [{ label: t("relatorios.valor"), value: money.format(a.value) }, ...(a.semCusto ? [{ label: t("relatorios.produtosSemCusto"), value: nf.format(a.semCusto) }] : [])],
                }))}
              />
            </Panel>
          )}
        </div>
      )}

      {gasto && gasto.byProduto.length > 0 && (
        <section className="overflow-hidden rounded-[14px] border bg-card shadow-xs">
          <h2 className="px-[18px] pt-4 pb-2 text-[15px] font-semibold">{t("relatorios.produtosMaisSolicitados")}</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-[18px]">{t("relatorios.produto")}</TableHead>
                <TableHead className="text-right">{t("relatorios.quantidade")}</TableHead>
                <TableHead className="text-right">{t("relatorios.total")}</TableHead>
                <TableHead className="w-1/4" />
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
                  <TableCell>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(x.quantity / maxQtd) * 100}%` }} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      <Panel title={t("relatorios.porDia")}>
        {diasNoMes.size === 0 ? (
          <p className="px-[18px] py-6 text-sm text-muted-foreground">{t("relatorios.semSolicitacoes")}</p>
        ) : (
          <div className="flex h-36 items-end gap-1 px-[18px] pt-2 pb-4">
            {[...diasNoMes.entries()].sort().map(([d, n]) => (
              <ChartTooltip key={d} className="flex h-full flex-1 items-end" title={d.split("-").reverse().join("/")} rows={[{ label: t("relatorios.kpiSolicitacoes"), value: nf.format(n) }]}>
                <div className="w-full rounded-t bg-primary/80 hover:bg-primary" style={{ height: `${Math.max(4, (n / maxDia) * 100)}%` }} />
              </ChartTooltip>
            ))}
          </div>
        )}
      </Panel>

      <GroupTable t={t} title={t("relatorios.porBase")} rows={porBase} stages={["aprovacao", "separacao", "expedicao"]} h={h} p={p} tone={tone} />
      <GroupTable t={t} title={t("relatorios.porAlmox")} rows={porAlmox} stages={["separacao", "expedicao"]} h={h} p={p} tone={tone} />
      <p className="text-xs text-muted-foreground">{t("relatorios.rodape", { quando: fmtDateTime(now, t.locale) })}</p>
    </>
  );
}

// ------------------------------------------------------------------ componentes da página

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[14px] border bg-card shadow-xs">
      <div className="px-[18px] pt-4 pb-2">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
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
  inverse,
  t,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  note?: string;
  valueClass?: string;
  /** Variação % contra o mês anterior. `inverse`: subir é ruim (ex.: prazo). */
  delta?: number | null;
  inverse?: boolean;
  t?: Translator;
}) {
  const good = delta != null && (inverse ? delta <= 0 : delta >= 0);
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
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className={cn("inline-flex items-center gap-1 font-medium", good ? "text-success" : "text-accent-foreground")}>
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

function StageBar({
  t,
  stage,
  sum,
  target,
  h,
  p,
  tone,
}: {
  t: Translator;
  stage: StageKey;
  sum: StageSummary;
  target: number | null;
  h: (v: number | null) => string;
  p: (v: number | null) => string;
  tone: (v: number | null) => string;
}) {
  // A barra mostra o tempo médio em relação ao prazo normal (100% = no limite).
  const ratio = target && sum.avgHours != null ? sum.avgHours / target : null;
  const width = ratio == null ? 0 : Math.min(100, ratio * 100);
  return (
    <div className="border-t px-[18px] py-3 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{t(`relatorios.etapa.${stage}`)}</span>
        <span className={cn("tabular-nums font-semibold", tone(sum.okPct))}>{stage === "entrega" ? h(sum.avgHours) : p(sum.okPct)}</span>
      </div>
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{t(`relatorios.etapaAjuda.${stage}`)}</span>
        <span>{target ? t("relatorios.mediaPrazo", { media: h(sum.avgHours), prazo: h(target) }) : t("relatorios.semPrazo")}</span>
      </div>
      {target && (
        <ChartTooltip
          className="mt-2"
          title={t(`relatorios.etapa.${stage}`)}
          rows={[
            { label: t("relatorios.media"), value: h(sum.avgHours) },
            { label: t("relatorios.prazo"), value: h(target) },
            { label: t("relatorios.noPrazo"), value: p(sum.okPct) },
            { label: t("relatorios.concluidas"), value: String(sum.done) },
            { label: t("relatorios.foraDoPrazo"), value: String(sum.late) },
            { label: t("relatorios.correndo"), value: String(sum.running) },
          ]}
        >
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", ratio != null && ratio > 1 ? "bg-primary" : ratio != null && ratio > 0.8 ? "bg-warning" : "bg-success")} style={{ width: `${width}%` }} />
          </div>
        </ChartTooltip>
      )}
    </div>
  );
}

function Bars({ items, empty }: { items: { key: string; label: string; value: number; text: string; rows: { label: string; value: string }[] }[]; empty: string }) {
  if (!items.length) return <p className="px-[18px] py-6 text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="pb-2">
      {items.map((i) => (
        <ChartTooltip key={i.key} title={i.label} rows={i.rows} className="block px-[18px] py-2">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{i.label}</span>
            <span className="font-semibold tabular-nums">{i.text}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary/80" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </ChartTooltip>
      ))}
    </div>
  );
}

function GroupTable({
  t,
  title,
  rows,
  stages,
  h,
  p,
  tone,
}: {
  t: Translator;
  title: string;
  rows: { id: string; code: string; name: string; total: number; stages: Record<StageKey, StageSummary> }[];
  stages: StageKey[];
  h: (v: number | null) => string;
  p: (v: number | null) => string;
  tone: (v: number | null) => string;
}) {
  if (!rows.length) return null;
  return (
    <section className="overflow-hidden rounded-[14px] border bg-card shadow-xs">
      <h2 className="px-[18px] pt-4 pb-2 text-[15px] font-semibold">{title}</h2>
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
                  <span className={cn("font-semibold", tone(r.stages[s].okPct))}>{p(r.stages[s].okPct)}</span>
                  <span className="ml-1 text-xs text-muted-foreground">{h(r.stages[s].avgHours)}</span>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
