import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Paginação por query string (?p=2), mantendo os outros filtros. */
export function Pagination({
  page,
  total,
  pageSize,
  basePath,
  params,
}: {
  page: number;
  total: number;
  pageSize: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("p", String(p));
    return `${basePath}?${sp}`;
  };
  return (
    <div className="flex items-center justify-center gap-2 text-sm">
      {page > 1 && (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page - 1)}>Anterior</Link>
        </Button>
      )}
      <span className="text-muted-foreground">
        Página {page} de {pages} · {total} registro(s)
      </span>
      {page < pages && (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page + 1)}>Próxima</Link>
        </Button>
      )}
    </div>
  );
}

/** Lê um parâmetro de texto de searchParams. */
export const param = (sp: Record<string, string | string[] | undefined>, k: string) =>
  typeof sp[k] === "string" ? (sp[k] as string).trim() : "";

export const pageParam = (sp: Record<string, string | string[] | undefined>) => Math.max(1, Number(sp.p) || 1);
