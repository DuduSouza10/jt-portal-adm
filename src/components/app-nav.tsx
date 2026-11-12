"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { KeyRound, LogOut, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NavIcon } from "@/components/nav-icons";
import { LanguageSwitch } from "@/components/preferences";
import { logoutAction } from "@/app/login/actions";

type NavItem = { href: string; label: string };

/** Item ativo: a rota exata ou uma sub-rota. "/solicitacoes" não acende em "/solicitacoes/nova". */
function activeHref(path: string, items: NavItem[]) {
  const matches = items.filter((i) => path === i.href || path.startsWith(i.href + "/"));
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function NavLinks({ items, label }: { items: NavItem[]; label: string }) {
  const path = usePathname();
  const active = activeHref(path, items);
  return (
    <nav aria-label={label} className="ml-4 hidden items-center gap-0.5 lg:flex">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.href === active ? "page" : undefined}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-[var(--header-muted)] transition-colors",
            "hover:bg-[var(--header-hover)] hover:text-header-foreground focus-visible:outline-2 focus-visible:outline-white",
            i.href === active &&
              "bg-[var(--header-active-bg)] text-[var(--header-active-fg)] shadow-sm hover:bg-[var(--header-active-bg)] hover:text-[var(--header-active-fg)]",
          )}
        >
          <NavIcon href={i.href} className="size-4" />
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const t = useT();
  const path = usePathname();
  const active = activeHref(path, items);
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-header-foreground hover:bg-[var(--header-hover)] hover:text-header-foreground lg:hidden"
          aria-label={t("menu.titulo")}
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle>{t("menu.titulo")}</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-3">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              onClick={() => setOpen(false)}
              aria-current={i.href === active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium hover:bg-muted",
                i.href === active && "bg-accent text-accent-foreground",
              )}
            >
              <NavIcon href={i.href} className="size-4.5 text-primary" />
              {i.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t p-4">
          <LanguageSwitch tone="plain" />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function UserMenu({ name, subtitle }: { name: string; subtitle: string }) {
  const t = useT();
  const initials = name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-10 gap-2 rounded-full pr-3 pl-1 text-header-foreground hover:bg-[var(--header-hover)] hover:text-header-foreground"
          aria-label={t("menu.minhaConta")}
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-white/95 text-xs font-bold text-primary dark:bg-primary dark:text-primary-foreground">
            {initials}
          </span>
          <span className="hidden max-w-36 truncate text-sm sm:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <div className="truncate">{name}</div>
          <div className="truncate text-xs font-normal text-muted-foreground">{subtitle}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/conta/senha">
            <KeyRound /> {t("menu.trocarSenha")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => logoutAction()}>
          <LogOut /> {t("menu.sair")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
