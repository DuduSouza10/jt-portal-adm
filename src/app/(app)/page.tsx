import Image from "next/image";
import Link from "next/link";
import { TZDate } from "@date-fns/tz";
import { startOfDay } from "date-fns";
import { AlertTriangle, ArrowRight, ArrowUpRight, Boxes, PackageCheck, Repeat2, Warehouse } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { TZ } from "@/lib/format";
import { can } from "@/lib/permissions/check";
import { navFor, SECTION_LABEL, type NavItem } from "@/lib/navigation";
import { listAlmoxarifados, listSaldos } from "@/modules/estoque/queries";
import { getT } from "@/i18n/server";
import { navText, profileText } from "@/i18n/labels";
import type { Translator } from "@/i18n/translate";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/page-header";
import { NavIcon } from "@/components/nav-icons";

export default async function HomePage() {
  const [user, t] = await Promise.all([requireUser(), getT()]);
  const items = navFor(user);
  const sections = Object.keys(SECTION_LABEL) as NavItem["section"][];
  const now = TZDate.tz(TZ);
  const hour = now.getHours();
  const firstName = user.name.split(" ")[0];
  const greeting =
    hour < 12 ? t("inicio.bomDia", { nome: firstName }) : hour < 18 ? t("inicio.boaTarde", { nome: firstName }) : t("inicio.boaNoite", { nome: firstName });
  const today = new Intl.DateTimeFormat(t.locale, { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(now);

  return (
    <>
      <section className="hero-panel brand-stripes relative overflow-hidden rounded-3xl px-6 py-7 text-white shadow-[0_18px_40px_-24px_oklch(0.45_0.2_27/0.9)] sm:px-8 sm:py-9">
        <div className="relative z-10 max-w-2xl space-y-3">
          <p className="text-sm font-medium text-white/80 first-letter:uppercase">{today}</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{greeting}</h1>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary shadow-sm">{profileText(t, user.profile).name}</span>
            {user.bases.slice(0, 6).map((b) => (
              <span key={b.id} className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium ring-1 ring-white/25" title={b.name}>
                {b.code}
              </span>
            ))}
            {user.bases.length > 6 && <span className="text-xs text-white/80">+{user.bases.length - 6}</span>}
          </div>
        </div>
        <div aria-hidden className="absolute -top-10 -right-10 hidden size-64 rounded-full bg-white/10 sm:block" />
        <div aria-hidden className="absolute top-1/2 right-10 hidden -translate-y-1/2 sm:block">
          <Image
            src="/jt-coelho.png"
            alt=""
            width={120}
            height={120}
            className="size-28 rotate-6 rounded-[28px] shadow-2xl ring-4 ring-white/30 md:size-32"
          />
        </div>
      </section>

      {can(user, "estoque.ver") && <EstoqueResumo user={user} t={t} />}

      {items.length === 0 && <EmptyState>{t("inicio.semAcesso")}</EmptyState>}

      {sections.map((s) => {
        const list = items.filter((i) => i.section === s);
        if (!list.length) return null;
        return (
          <section key={s} className="space-y-3">
            <h2 className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">
              {t.maybe(`secoes.${s}`) ?? SECTION_LABEL[s]}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {list.map((i) => {
                const text = navText(t, i);
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    className="group relative flex h-full items-start gap-4 rounded-2xl border bg-card p-4 shadow-xs transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <NavIcon href={i.href} className="size-5" />
                    </span>
                    <span className="min-w-0 space-y-0.5">
                      <span className="block font-semibold">{text.label}</span>
                      <span className="block text-sm text-muted-foreground">{text.description}</span>
                    </span>
                    <ArrowUpRight className="absolute top-4 right-4 size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

/** Quatro números do estoque no alcance do usuário. */
async function EstoqueResumo({ user, t }: { user: Awaited<ReturnType<typeof requireUser>>; t: Translator }) {
  const almox = await listAlmoxarifados(user);
  if (!almox.length) return null;
  const baseIds = almox.map((a) => a.id);
  const [comSaldo, abaixo, hoje] = await Promise.all([
    db.stockBalance.count({ where: { baseId: { in: baseIds }, quantity: { gt: 0 } } }),
    listSaldos({ baseIds, abaixoMinimo: true, page: 1 }).then((r) => r.total),
    db.stockMovement.count({ where: { baseId: { in: baseIds }, createdAt: { gte: startOfDay(TZDate.tz(TZ)) } } }),
  ]);

  const n = (v: number) => v.toLocaleString(t.locale);
  return (
    <section className="space-y-3" aria-labelledby="estoque-agora">
      <div className="flex items-center justify-between gap-3">
        <h2 id="estoque-agora" className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">
          {t("inicio.estoqueAgora")}
        </h2>
        <Link href="/estoque" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          {t("inicio.verEstoque")} <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Warehouse} label={t("inicio.kpiAlmox")} value={n(almox.length)} />
        <Kpi icon={PackageCheck} label={t("inicio.kpiProdutos")} value={n(comSaldo)} />
        <Kpi
          icon={abaixo ? AlertTriangle : Boxes}
          label={t("inicio.kpiAbaixo")}
          value={n(abaixo)}
          tone={abaixo ? "warning" : "ok"}
          note={abaixo ? t("inicio.kpiAbaixoVer") : t("inicio.kpiAbaixoOk")}
          href={abaixo ? "/estoque?min=1" : undefined}
        />
        <Kpi icon={Repeat2} label={t("inicio.kpiHoje")} value={n(hoje)} />
      </div>
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
  tone?: "warning" | "ok";
  note?: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground",
            tone === "warning" && "bg-warning/15 text-warning",
            tone === "ok" && "bg-success/12 text-success",
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className={cn("text-3xl font-bold tracking-tight tabular-nums", tone === "warning" && "text-warning")}>
        {value}
      </p>
      {note && <p className={cn("text-xs", tone === "warning" ? "font-medium text-warning" : "text-muted-foreground")}>{note}</p>}
    </>
  );
  const cls = cn(
    "flex flex-col gap-2 rounded-2xl border bg-card p-4 shadow-xs",
    tone === "warning" && "border-warning/40",
    href && "transition hover:border-warning hover:shadow-md",
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
