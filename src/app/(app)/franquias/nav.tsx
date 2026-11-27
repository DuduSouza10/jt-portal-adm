import Link from "next/link";
import { BarChart3, ClipboardList, Package, ShoppingCart, Tag } from "lucide-react";
import { can, type Actor } from "@/lib/permissions/check";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { PageHeader } from "@/components/page-header";

/** Cabeçalho e sub-abas da aba Franquias: Solicitações, Solicitar insumos, Solicitar lacres, Estoque e Relatórios. */
export async function FranquiasNav({ user, current }: { user: Actor; current: string }) {
  const t = await getT();
  const items = [
    { href: "/franquias", label: t("franquias.abas.solicitacoes"), icon: ClipboardList, show: can(user, "solicitacoes.ver") },
    { href: "/franquias/insumos", label: t("franquias.abas.insumos"), icon: ShoppingCart, show: can(user, "solicitacoes.criar") },
    { href: "/franquias/lacres", label: t("franquias.abas.lacres"), icon: Tag, show: can(user, "solicitacoes.criar") },
    { href: "/franquias/estoque", label: t("franquias.abas.estoque"), icon: Package, show: true },
    { href: "/franquias/relatorios", label: t("franquias.abas.relatorios"), icon: BarChart3, show: true },
  ].filter((i) => i.show);
  return (
    <>
      <PageHeader title={t("franquias.titulo")} description={t("franquias.descricao")} />
      <nav className="flex gap-1 overflow-x-auto border-b">
        {items.map((i) => {
          const active = current === i.href;
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-10 items-center gap-2 px-3 font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                active && "text-foreground after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary",
              )}
            >
              <i.icon className="size-4" aria-hidden />
              {i.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
