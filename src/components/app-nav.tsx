"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronRight, KeyRound, LogOut, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NavIcon } from "@/components/nav-icons";
import { LanguageSwitch } from "@/components/preferences";
import { logoutAction } from "@/app/login/actions";

type NavItem = { href: string; label: string };
export type NavGroup = { label: string; items: NavItem[] };

/** Item ativo: a rota exata ou uma sub-rota; o mais específico ganha. "/" só acende na própria home. */
function activeHref(path: string, groups: NavGroup[]) {
  const all = groups.flatMap((g) => g.items);
  const matches = all.filter((i) => path === i.href || (i.href !== "/" && path.startsWith(i.href + "/")));
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

function NavList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const path = usePathname();
  const active = activeHref(path, groups);
  return (
    <>
      {groups.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-0.5">
          {g.label && (
            <p className="px-2.5 pt-4 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{g.label}</p>
          )}
          {g.items.map((i) => {
            const on = i.href === active;
            return (
              <Link
                key={i.href}
                href={i.href}
                onClick={onNavigate}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-2.5 rounded-[9px] px-2.5 font-medium text-muted-foreground transition-colors",
                  "hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                  on && "bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <NavIcon href={i.href} className="size-[18px]" />
                {i.label}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

export function SidebarNav({ groups, label }: { groups: NavGroup[]; label: string }) {
  return (
    <nav aria-label={label} className="flex flex-col">
      <NavList groups={groups} />
    </nav>
  );
}

/** "Seção › Página" na barra superior. */
export function Breadcrumb({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const active = activeHref(path, groups);
  const group = groups.find((g) => g.items.some((i) => i.href === active));
  const item = group?.items.find((i) => i.href === active);
  if (!item) return null;
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
      {group?.label && (
        <>
          <span className="truncate">{group.label}</span>
          <ChevronRight className="size-3.5 shrink-0" aria-hidden />
        </>
      )}
      <span className="truncate font-medium text-foreground">{item.label}</span>
    </div>
  );
}

export function MobileNav({
  groups,
  label,
  brand,
  user,
  credits,
}: {
  groups: NavGroup[];
  label: string;
  brand: React.ReactNode;
  user: { name: string; subtitle: string };
  credits: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="-ml-1 text-muted-foreground lg:hidden" aria-label={label}>
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>{t("menu.titulo")}</SheetTitle>
        </SheetHeader>
        <div className="flex h-full flex-col gap-1 overflow-y-auto px-3 py-4">
          {brand}
          <nav aria-label={t("menu.principal")} className="flex flex-col">
            <NavList groups={groups} onNavigate={() => setOpen(false)} />
          </nav>
          <div className="mt-auto flex flex-col gap-2.5 pt-3">
            <LanguageSwitch tone="plain" />
            <UserCard {...user} />
            <p className="px-1 text-center text-[11px] leading-snug text-muted-foreground">{credits}</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Cartão do usuário no pé da barra lateral: trocar senha e sair. */
export function UserCard({ name, subtitle }: { name: string; subtitle: string }) {
  const t = useT();
  const initials = name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <div className="flex items-center gap-2.5 rounded-xl border bg-surface-2 p-2.5">
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-accent-foreground">
        {initials}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13px] font-semibold">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <Link
        href="/conta/senha"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={t("menu.trocarSenha")}
        title={t("menu.trocarSenha")}
      >
        <KeyRound className="size-4" />
      </Link>
      <form action={logoutAction}>
        <button
          type="submit"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("menu.sair")}
          title={t("menu.sair")}
        >
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}
