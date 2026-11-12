import Image from "next/image";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { navFor } from "@/lib/navigation";
import { getT } from "@/i18n/server";
import { navText, profileText } from "@/i18n/labels";
import { MobileNav, NavLinks, UserMenu } from "@/components/app-nav";
import { LanguageSwitch, ThemeToggle } from "@/components/preferences";

export async function AppHeader() {
  const [user, t] = await Promise.all([requireUser({ allowPendingPasswordChange: true }), getT()]);
  const items = navFor(user).map((i) => ({ href: i.href, label: navText(t, i).label }));
  const subtitle = [profileText(t, user.profile).name, user.bases.map((b) => b.code).join(", ")].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4">
      <MobileNav items={items} />
      <Brand name={t("app.nome")} company={t("app.empresa")} />
      <NavLinks items={items} label={t("menu.principal")} />
      <div className="ml-auto flex items-center gap-1.5">
        <LanguageSwitch className="hidden sm:inline-flex" />
        <ThemeToggle className="text-header-foreground hover:bg-[var(--header-hover)] focus-visible:outline-white" />
        <UserMenu name={user.name} subtitle={subtitle} />
      </div>
    </div>
  );
}

/** Coelho da J&T + nome do sistema. */
function Brand({ name, company }: { name: string; company: string }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-lg pr-2 focus-visible:outline-2 focus-visible:outline-white">
      <Image
        src="/jt-coelho.png"
        alt=""
        width={36}
        height={36}
        className="size-9 rounded-lg shadow-sm ring-1 ring-white/50 dark:ring-white/10"
        priority
      />
      <span className="leading-none">
        <span className="block text-[15px] font-bold tracking-tight">{name}</span>
        <span className="mt-1 hidden text-[11px] font-medium text-[var(--header-muted)] sm:block">{company}</span>
      </span>
    </Link>
  );
}

export async function AppHeaderSkeleton() {
  const t = await getT();
  return (
    <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4">
      <Brand name={t("app.nome")} company={t("app.empresa")} />
    </div>
  );
}
