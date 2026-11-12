import Link from "next/link";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ClipboardCheck, LayoutList, ScrollText } from "lucide-react";
import { can, type Actor } from "@/lib/permissions/check";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

/** Abas do módulo de estoque, conforme as permissões do usuário. */
export async function EstoqueNav({ user, current }: { user: Actor; current: string }) {
  const t = await getT();
  const items = [
    { href: "/estoque", label: t("estoque.abaSaldos"), icon: LayoutList, show: true },
    { href: "/estoque/movimentacoes", label: t("estoque.abaMovimentacoes"), icon: ScrollText, show: true },
    { href: "/estoque/lancar?tipo=entrada", label: t("estoque.abaEntrada"), icon: ArrowDownToLine, show: can(user, "estoque.movimentar") },
    { href: "/estoque/lancar?tipo=saida", label: t("estoque.abaSaida"), icon: ArrowUpFromLine, show: can(user, "estoque.movimentar") },
    { href: "/estoque/lancar?tipo=transferencia", label: t("estoque.abaTransferencia"), icon: ArrowLeftRight, show: can(user, "estoque.movimentar") },
    { href: "/estoque/inventario", label: t("estoque.abaInventario"), icon: ClipboardCheck, show: can(user, "estoque.inventario") },
  ].filter((i) => i.show);
  return (
    <nav className="-mx-1 overflow-x-auto px-1">
      <div className="inline-flex gap-1 rounded-xl border bg-card p-1 shadow-xs">
        {items.map((i) => {
          const active = current === i.href;
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                active && "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground",
              )}
            >
              <i.icon className="size-4" aria-hidden />
              {i.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
