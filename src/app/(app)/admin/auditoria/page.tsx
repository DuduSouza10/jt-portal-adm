import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Pagination, pageParam } from "@/components/pagination";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("auditoria.titulo") };
}

const PAGE_SIZE = 50;

export default async function AuditPage(props: PageProps<"/admin/auditoria">) {
  await requirePermission("auditoria.ver");
  const t = await getT();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = pageParam(sp);

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

  return (
    <>
      <PageHeader title={t("auditoria.titulo")} description={t("auditoria.descricao", { n: total })} />
      <form className="flex gap-2">
        <Input name="q" defaultValue={q} placeholder={t("auditoria.buscar")} className="max-w-sm" />
        <Button type="submit" variant="outline">
          {t("comum.buscar")}
        </Button>
      </form>
      {t.locale !== "pt-BR" && <p className="text-xs text-muted-foreground">{t("auditoria.aviso")}</p>}
      {logs.length === 0 ? (
        <EmptyState>{t("auditoria.vazio")}</EmptyState>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">{t("auditoria.quando")}</TableHead>
                <TableHead className="w-48">{t("auditoria.quem")}</TableHead>
                <TableHead>{t("auditoria.oque")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-muted-foreground">{fmtDateTime(l.createdAt, t.locale)}</TableCell>
                  <TableCell>{l.actor?.name ?? t("comum.sistema")}</TableCell>
                  <TableCell className="whitespace-normal">
                    {l.summary}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{l.action}</span>
                    {l.data && Object.keys(l.data as object).length > 0 && (
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-muted-foreground">{t("comum.detalhes")}</summary>
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
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath="/admin/auditoria" params={{ q }} />
    </>
  );
}
