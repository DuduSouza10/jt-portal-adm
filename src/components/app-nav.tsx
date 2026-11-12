"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { KeyRound, LogOut, Menu, User } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { logoutAction } from "@/app/login/actions";
type NavItem = { href: string; label: string };

const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");

export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="ml-6 hidden gap-1 md:flex">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium text-white/85 hover:bg-white/15 hover:text-white",
            isActive(path, i.href) && "bg-white text-primary hover:bg-white hover:text-primary",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/15 hover:text-white md:hidden" aria-label="Menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-4">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-md px-3 py-2.5 font-medium hover:bg-muted",
                isActive(path, i.href) && "bg-accent text-accent-foreground",
              )}
            >
              {i.label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function UserMenu({ name, subtitle }: { name: string; subtitle: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 text-white hover:bg-white/15 hover:text-white" aria-label="Minha conta">
          <User className="size-4" />
          <span className="hidden max-w-40 truncate sm:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="truncate">{name}</div>
          <div className="truncate text-xs font-normal text-muted-foreground">{subtitle}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/conta/senha">
            <KeyRound /> Trocar senha
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => logoutAction()}>
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
