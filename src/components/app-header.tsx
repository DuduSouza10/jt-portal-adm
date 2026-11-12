import Image from "next/image";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { navFor, SECTION_LABEL, type NavItem } from "@/lib/navigation";
import { getT } from "@/i18n/server";
import { navText, profileText } from "@/i18n/labels";
import { Breadcrumb, MobileNav, SidebarNav, UserCard, type NavGroup } from "@/components/app-nav";
import { LanguageSwitch, ThemeToggle } from "@/components/preferences";

/**
 * Casca do portal: barra lateral (desktop), barra superior com o caminho da página e,
 * no celular, o menu em gaveta. Os itens vêm de src/lib/navigation.ts (com "Início" no topo).
 */
async function loadNav() {
  const [user, t] = await Promise.all([requireUser({ allowPendingPasswordChange: true }), getT()]);
  const items = navFor(user);
  const sections = Object.keys(SECTION_LABEL) as NavItem["section"][];
  const groups: NavGroup[] = [
    { label: "", items: [{ href: "/", label: navText(t, { href: "/", label: "Início", description: "" }).label }] },
    ...sections
      .map((s) => ({
        label: t.maybe(`secoes.${s}`) ?? SECTION_LABEL[s],
        items: items.filter((i) => i.section === s).map((i) => ({ href: i.href, label: navText(t, i).label })),
      }))
      .filter((g) => g.items.length),
  ];
  const profile = profileText(t, user.profile).name;
  const subtitle = [profile, user.bases.map((b) => b.code).join(", ")].filter(Boolean).join(" · ");
  return { user, t, groups, subtitle };
}

export async function AppSidebar() {
  const { user, t, groups, subtitle } = await loadNav();
  return (
    <div className="flex h-full flex-col gap-1 px-3 py-4">
      <Brand name={t("app.nome")} company={t("app.empresa")} />
      <SidebarNav groups={groups} label={t("menu.principal")} />
      <div className="mt-auto flex flex-col gap-2.5 pt-3">
        <div className="flex items-center justify-between gap-2">
          <LanguageSwitch tone="plain" />
          <ThemeToggle className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-ring" />
        </div>
        <UserCard name={user.name} subtitle={subtitle} />
      </div>
    </div>
  );
}

export async function AppTopbar() {
  const { user, t, groups, subtitle } = await loadNav();
  return (
    <div className="flex h-15 items-center gap-3 px-4 sm:px-7">
      <MobileNav
        groups={groups}
        label={t("menu.abrir")}
        brand={<Brand name={t("app.nome")} company={t("app.empresa")} />}
        user={{ name: user.name, subtitle }}
      />
      <Breadcrumb groups={groups} />
      <div className="ml-auto flex items-center gap-1.5 lg:hidden">
        <ThemeToggle className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-ring" />
      </div>
    </div>
  );
}

/** Coelho da J&T + nome do sistema. */
export function Brand({ name, company }: { name: string; company: string }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-lg px-2 pb-4 focus-visible:outline-2 focus-visible:outline-ring">
      <Image src="/jt-coelho.png" alt="" width={34} height={34} className="size-[34px] rounded-[10px]" priority />
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight">{name}</span>
        <span className="block text-xs text-muted-foreground">{company}</span>
      </span>
    </Link>
  );
}

export function AppSidebarSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-3 py-4">
      <div className="h-9 w-36 animate-pulse rounded-lg bg-muted" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-8 animate-pulse rounded-lg bg-muted/70" />
      ))}
    </div>
  );
}
