import Link from "next/link";
import { can, type Actor } from "@/lib/permissions/check";
import { Button } from "@/components/ui/button";

/** Abas do módulo de estoque, conforme as permissões do usuário. */
export function EstoqueNav({ user, current }: { user: Actor; current: string }) {
  const items = [
    { href: "/estoque", label: "Saldos", show: true },
    { href: "/estoque/movimentacoes", label: "Movimentações", show: true },
    { href: "/estoque/lancar?tipo=entrada", label: "Entrada", show: can(user, "estoque.movimentar") },
    { href: "/estoque/lancar?tipo=saida", label: "Saída", show: can(user, "estoque.movimentar") },
    { href: "/estoque/lancar?tipo=transferencia", label: "Transferência", show: can(user, "estoque.movimentar") },
    { href: "/estoque/inventario", label: "Inventário", show: can(user, "estoque.inventario") },
  ].filter((i) => i.show);
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <Button key={i.href} asChild size="sm" variant={current === i.href ? "default" : "outline"}>
          <Link href={i.href}>{i.label}</Link>
        </Button>
      ))}
    </div>
  );
}
