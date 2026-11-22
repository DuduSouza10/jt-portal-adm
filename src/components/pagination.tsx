import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getT } from "@/i18n/server";
import { Button } from "@/components/ui/button";

/** Paginação por query string (?p=2), mantendo os outros filtros. */
export async function Pagination({
  page,
  total,
  pageSize,
  basePath,
  params,
}: {
  page: number;
  /** Total de registros (aparece ao lado do número da página). */
  total: number;
  pageSize: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const t = await getT();
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("p", String(p));
    return `${basePath}?${sp}`;
  };
  return (
    <nav className="flex flex-wrap items-center justify-center gap-3 text-sm" aria-label={t("comum.pagina", { page, pages })}>
      {page > 1 && (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page - 1)}>
            <ChevronLeft /> {t("comum.anterior")}
          </Link>
        </Button>
      )}
      <span className="text-muted-foreground tabular-nums">
        {t("comum.pagina", { page, pages })} · {t("comum.registros", { n: total })}
      </span>
      {page < pages && (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page + 1)}>
            {t("comum.proxima")} <ChevronRight />
          </Link>
        </Button>
      )}
    </nav>
  );
}

/** Lê um parâmetro de texto de searchParams. */
export const param = (sp: Record<string, string | string[] | undefined>, k: string) =>
  typeof sp[k] === "string" ? (sp[k] as string).trim() : "";

export const pageParam = (sp: Record<string, string | string[] | undefined>) => Math.max(1, Number(sp.p) || 1);
