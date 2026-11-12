import Link from "next/link";
import { TZDate } from "@date-fns/tz";
import { startOfDay } from "date-fns";
import { ArrowDownToLine, ArrowRight, ArrowUpRight, PackageCheck, Repeat2, TriangleAlert, Warehouse } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { fmtDateTime, TZ } from "@/lib/format";
import { can } from "@/lib/permissions/check";
import { navFor, SECTION_LABEL, type NavItem } from "@/lib/navigation";
import { listAlmoxarifados, listSaldos } from "@/modules/estoque/queries";
import { getT } from "@/i18n/server";
import { navText } from "@/i18n/labels";
import type { Translator } from "@/i18n/translate";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/page-header";
import { NavIcon } from "@/components/nav-icons";

type User = Awaited<ReturnType<typeof requireUser>>;

export default async function HomePage() {
  const [user, t] = await Promise.all([requireUser(), getT()]);
  const items = navFor(user);
  const sections = Object.keys(SECTION_LABEL) as NavItem["section"][];
  const now = TZDate.tz(TZ);
  const hour = now.getHours();
  const nome = user.name.split(" ")[0];
  const greeting = t(hour < 12 ? "inicio.bomDia" : hour < 18 ? "inicio.boaTarde" : "inicio.boaNoite", { nome });
  const today = new Intl.DateTimeFormat(t.locale, { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(now);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[22px] font-semibold tracking-tight sm:text-[26px]">{greeting}</h1>
          <p className="text-muted-foreground first-letter:uppercase">{t("inicio.resumo", { data: today })}</p>
        </div>
        {can(user, "estoque.movimentar") && (
          <Button asChild>
            <Link href="/estoque/lancar?tipo=entrada">
              <ArrowDownToLine /> {t("inicio.lancarEntrada")}
            </Link>
          </Button>
        )}
      </div>

      {can(user, "estoque.ver") && <EstoqueResumo user={user} t={t} />}

      {items.length === 0 && <EmptyState>{t("inicio.semAcesso")}</EmptyState>}

      {items.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold">{t("inicio.acessoRapido")}</h2>
          {sections.map((s) => {
            const list = items.filter((i) => i.section === s);
            if (!list.length) return null;
            return (
              <div key={s} className="space-y-2">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                  {t.maybe(`secoes.${s}`) ?? SECTION_LABEL[s]}
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {list.map((i) => {
                    const text = navText(t, i);
                    return (
                      <Link
                        key={i.href}
                        href={i.href}
                        className="group relative flex h-full items-start gap-3.5 rounded-[14px] border bg-card p-4 shadow-xs transition hover:border-input hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-muted text-muted-foreground transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
                          <NavIcon href={i.href} className="size-[18px]" />
                        </span>
                        <span className="min-w-0 space-y-0.5 pr-4">
                          <span className="block font-semibold">{text.label}</span>
                          <span className="block text-[13px] text-muted-foreground">{text.description}</span>
                        </span>
                        <ArrowUpRight className="absolute top-4 right-4 size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}

/** Números, estoque crítico e últimas movimentações, no alcance do usuário. */
async function EstoqueResumo({ user, t }: { user: User; t: Translator }) {
  const almox = await listAlmoxarifados(user);
  if (!almox.length) return null;
  const baseIds = almox.map((a) => a.id);
  const [comSaldo, abaixo, hoje, criticos, movs] = await Promise.all([
    db.stockBalance.count({ where: { baseId: { in: baseIds }, quantity: { gt: 0 } } }),
    listSaldos({ baseIds, abaixoMinimo: true, page: 1 }),
    db.stockMovement.count({ where: { baseId: { in: baseIds }, createdAt: { gte: startOfDay(TZDate.tz(TZ)) } } }),
    db.stockBalance.findMany({
      where: { baseId: { in: baseIds }, minimum: { gt: 0 } },
      include: { produto: { select: { code: true, name: true } }, base: { select: { code: true } } },
      take: 200,
    }),
    db.stockMovement.findMany({
      where: { baseId: { in: baseIds } },
      include: { produto: { select: { code: true, name: true } }, base: { select: { code: true } }, actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);
  const n = (v: number) => v.toLocaleString(t.locale);
  // Os 5 mais perto (ou abaixo) do mínimo.
  const top = criticos
    .map((c) => ({ ...c, disp: c.quantity - c.reserved, ratio: (c.quantity - c.reserved) / c.minimum }))
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 5);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={Warehouse} label={t("inicio.kpiAlmox")} value={n(almox.length)} href="/estoque" />
        <Kpi icon={PackageCheck} label={t("inicio.kpiProdutos")} value={n(comSaldo)} href="/estoque" />
        <Kpi
          icon={TriangleAlert}
          label={t("inicio.kpiAbaixo")}
          value={n(abaixo.total)}
          tone={abaixo.total ? "warning" : undefined}
          note={abaixo.total ? t("inicio.kpiAbaixoVer") : t("inicio.kpiAbaixoOk")}
          href={abaixo.total ? "/estoque?min=1" : "/estoque"}
        />
        <Kpi icon={Repeat2} label={t("inicio.kpiHoje")} value={n(hoje)} href="/estoque/movimentacoes" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title={t("inicio.estoqueCritico")} href="/estoque?min=1" link={t("inicio.verEstoque")}>
          {top.length === 0 ? (
            <p className="px-[18px] py-6 text-sm text-muted-foreground">{t("inicio.semCritico")}</p>
          ) : (
            top.map((c) => {
              const low = c.disp < c.minimum;
              const pct = Math.max(0, Math.min(100, (c.disp / (c.minimum * 2)) * 100));
              return (
                <div key={`${c.baseId}:${c.produtoId}`} className="border-t px-[18px] py-3 first:border-t-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-semibold">{c.produto.name}</span>
                    <span className={cn("tabular-nums", low ? "font-semibold text-accent-foreground" : "text-muted-foreground")}>{n(c.disp)}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                    <span>
                      {c.base.code} · <span className="font-mono">{c.produto.code}</span>
                    </span>
                    <span>{t("inicio.minimo", { n: c.minimum })}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", low ? (c.disp < c.minimum / 2 ? "bg-primary" : "bg-warning") : "bg-success")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </Panel>

        <Panel title={t("inicio.ultimasMov")} href="/estoque/movimentacoes" link={t("inicio.verTodas")}>
          {movs.length === 0 ? (
            <p className="px-[18px] py-6 text-sm text-muted-foreground">{t("inicio.semMov")}</p>
          ) : (
            movs.map((m) => (
              <div key={m.id} className="flex items-center gap-3 border-t px-[18px] py-3 first:border-t-0">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    m.quantity > 0 ? "bg-success/12 text-success" : m.quantity < 0 ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden
                >
                  <Repeat2 className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    <span className="font-semibold">{t(`tiposMovimento.${m.type}`)}</span> · {m.produto.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.base.code} · {m.actor?.name ?? t("comum.sistema")} · {fmtDateTime(m.createdAt, t.locale)}
                  </p>
                </div>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    m.quantity > 0 ? "text-success" : m.quantity < 0 ? "text-accent-foreground" : "text-muted-foreground",
                  )}
                >
                  {m.quantity > 0 ? `+${n(m.quantity)}` : m.quantity ? n(m.quantity) : "—"}
                </span>
              </div>
            ))
          )}
        </Panel>
      </div>
    </>
  );
}

function Panel({ title, href, link, children }: { title: string; href: string; link: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[14px] border bg-card shadow-xs">
      <div className="flex items-center justify-between gap-3 px-[18px] pt-4 pb-2">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-foreground hover:underline">
          {link} <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
  note,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "warning";
  note?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1.5 rounded-[14px] border bg-card px-[18px] py-4 shadow-xs transition hover:border-input hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="flex items-center justify-between gap-2 text-[13px] font-medium text-muted-foreground">
        <span>{label}</span>
        <span className={cn("flex size-[30px] items-center justify-center rounded-[9px] bg-muted", tone === "warning" && "bg-warning/15 text-warning")}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className={cn("text-[28px] leading-tight font-semibold tracking-tight tabular-nums", tone === "warning" && "text-warning")}>{value}</p>
      {note && <p className={cn("text-xs", tone === "warning" ? "font-medium text-warning" : "text-muted-foreground")}>{note}</p>}
    </Link>
  );
}
