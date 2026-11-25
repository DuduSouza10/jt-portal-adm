import Link from "next/link";
import { cn } from "@/lib/utils";
import { AbasNav } from "@/components/abas-nav";

export type Aba = {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** Número ao lado do nome (ex.: pedidos pendentes). */
  count?: number;
  /** "alerta" pinta o número de aviso (há coisa esperando ação). */
  tone?: "alerta";
  ativa: boolean;
};

/** Abas de uma tela (links, cada uma com a sua URL): sublinhado na ativa, número opcional ao lado. */
export function Abas({ items, label }: { items: Aba[]; label?: string }) {
  return (
    <AbasNav label={label}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.ativa ? "page" : undefined}
          className={cn(
            "relative flex h-10 items-center gap-1.5 px-2.5 font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
            i.ativa && "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary",
          )}
        >
          {i.icon && <i.icon className="size-4" aria-hidden />}
          {i.label}
          {i.count !== undefined && (
            <span
              className={cn(
                "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs leading-none font-semibold tabular-nums",
                i.tone === "alerta" && i.count > 0 ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
              )}
            >
              {i.count}
            </span>
          )}
        </Link>
      ))}
    </AbasNav>
  );
}
