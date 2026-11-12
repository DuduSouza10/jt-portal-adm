import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Auditoria" };

const PAGE_SIZE = 50;

export default async function AuditPage(props: PageProps<"/admin/auditoria">) {
  await requirePermission("auditoria.ver");
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = Math.max(1, Number(sp.p) || 1);

  const where = q
    ? {
        OR: [
          { summary: { contains: q, mode: "insensitive" as const } },
          { action: { contains: q.toLowerCase() } },
          { actor: { name: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : {};
  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.auditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => `/admin/auditoria?${new URLSearchParams({ ...(q && { q }), p: String(p) })}`;

  return (
    <>
      <PageHeader title="Auditoria" description={`${total} registro(s). Os registros não podem ser editados nem apagados.`} />
      <form className="flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Buscar por pessoa, ação ou texto" className="max-w-sm" />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>
      {logs.length === 0 ? (
        <EmptyState>Nenhum registro.</EmptyState>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Quando</TableHead>
                <TableHead className="w-48">Quem</TableHead>
                <TableHead>O quê</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-muted-foreground">{fmtDateTime(l.createdAt)}</TableCell>
                  <TableCell>{l.actor?.name ?? "Sistema"}</TableCell>
                  <TableCell className="whitespace-normal">
                    {l.summary}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{l.action}</span>
                    {l.data && Object.keys(l.data as object).length > 0 && (
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-muted-foreground">detalhes</summary>
                        <pre className="mt-1 overflow-x-auto rounded bg-muted p-2">{JSON.stringify(l.data, null, 2)}</pre>
                      </details>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={href(page - 1)}>Anterior</Link>
            </Button>
          )}
          <span className="text-muted-foreground">
            Página {page} de {pages}
          </span>
          {page < pages && (
            <Button asChild variant="outline" size="sm">
              <Link href={href(page + 1)}>Próxima</Link>
            </Button>
          )}
        </div>
      )}
    </>
  );
}
