import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { listAlmoxarifados, listSaldos, PAGE_SIZE } from "@/modules/estoque/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { selectClass } from "@/components/form-field";
import { Pagination, pageParam, param } from "@/components/pagination";
import { EstoqueNav } from "./nav";
import { MinimoForm } from "./minimo-form";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("estoque.titulo") };
}

export default async function SaldosPage(props: PageProps<"/estoque">) {
  const user = await requirePermission("estoque.ver");
  const t = await getT();
  const sp = await props.searchParams;
  const almox = await listAlmoxarifados(user);
  const base = param(sp, "base");
  const q = param(sp, "q");
  const min = param(sp, "min") === "1";
  const page = pageParam(sp);
  const baseIds = base && almox.some((a) => a.id === base) ? [base] : almox.map((a) => a.id);
  const { rows, total } = await listSaldos({ baseIds, q, abaixoMinimo: min, page });
  const canEditMin = can(user, "estoque.movimentar");

  return (
    <>
      <PageHeader title={t("estoque.titulo")} description={t("estoque.descricao")} />
      <EstoqueNav user={user} current="/estoque" />
      {almox.length === 0 ? (
        <EmptyState>{t("estoque.semAlmox")}</EmptyState>
      ) : (
        <>
          <form className="flex flex-wrap items-center gap-2">
            <select name="base" defaultValue={base} className={`${selectClass} max-w-64`}>
              <option value="">{t("estoque.todosAlmox", { n: almox.length })}</option>
              {almox.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
            <Input name="q" defaultValue={q} placeholder={t("estoque.produtoBusca")} className="max-w-xs" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="min" value="1" defaultChecked={min} className="size-4" />
              {t("estoque.soAbaixo")}
            </label>
            <Button type="submit" variant="outline">
              {t("comum.filtrar")}
            </Button>
          </form>
          {rows.length === 0 ? (
            <EmptyState>
              {q || min ? t("estoque.nadaFiltros") : t("estoque.vazio")}
            </EmptyState>
          ) : (
            <Card className="py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("estoque.colAlmox")}</TableHead>
                    <TableHead>{t("estoque.colProduto")}</TableHead>
                    <TableHead className="text-right">{t("estoque.colFisico")}</TableHead>
                    <TableHead className="text-right">{t("estoque.colReservado")}</TableHead>
                    <TableHead className="text-right">{t("estoque.colDisponivel")}</TableHead>
                    <TableHead className="text-right">{t("estoque.colMinimo")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const disp = r.quantity - r.reserved;
                    return (
                      <TableRow key={`${r.baseId}:${r.produtoId}`}>
                        <TableCell className="text-muted-foreground">{r.base.code}</TableCell>
                        <TableCell>
                          <span className="font-medium">{r.produto.code}</span> {r.produto.name}
                          <span className="ml-1 text-xs text-muted-foreground">({r.produto.unit})</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{r.reserved || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {disp < 0 ? (
                            <Badge variant="destructive" title={t("estoque.dispNegativo")}>
                              {disp}
                            </Badge>
                          ) : r.minimum > 0 && disp < r.minimum ? (
                            <Badge variant="outline" className="border-warning/60 bg-warning/10 text-warning" title={t("estoque.abaixoMinimo")}>
                              {disp}
                            </Badge>
                          ) : (
                            <span className="font-medium">{disp}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {canEditMin ? (
                            <MinimoForm baseId={r.baseId} produtoId={r.produtoId} minimum={r.minimum} />
                          ) : (
                            <span className="tabular-nums text-muted-foreground">{r.minimum || "—"}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath="/estoque" params={{ base, q, min: min ? "1" : undefined }} />
        </>
      )}
    </>
  );
}
