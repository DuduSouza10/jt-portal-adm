import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { getT } from "@/i18n/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { selectClass } from "@/components/form-field";
import { Pagination, pageParam } from "@/components/pagination";
import { listProdutos, PRODUTOS_PAGE_SIZE, type ProdutoFiltro } from "@/modules/produtos/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("produtos.titulo") };
}

export default async function ProdutosPage(props: PageProps<"/produtos">) {
  const me = await requirePermission("produtos.ver");
  const t = await getT();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status: ProdutoFiltro["status"] = sp.status === "ativos" || sp.status === "inativos" ? sp.status : "";
  const page = pageParam(sp);
  const editavel = can(me, "produtos.editar");
  const comCusto = can(me, "produtos.precos");

  const { produtos, total, custos } = await listProdutos({ q, status, page }, comCusto);
  const money = new Intl.NumberFormat(t.locale, { style: "currency", currency: "BRL" });
  const nf = new Intl.NumberFormat(t.locale);
  const limite = (v: number | null) => (v == null ? <span className="text-muted-foreground">{t("produtos.semLimite")}</span> : nf.format(v));

  return (
    <>
      <PageHeader
        title={t("produtos.titulo")}
        description={`${t("produtos.descricao")} ${t("produtos.total", { n: total })}`}
        actions={
          editavel && (
            <>
              <Button asChild variant="outline">
                <Link href="/estoque/importar?tipo=produtos">
                  <Upload /> {t("produtos.importar")}
                </Link>
              </Button>
              <Button asChild>
                <Link href="/produtos/novo">
                  <Plus /> {t("produtos.novo")}
                </Link>
              </Button>
            </>
          )
        }
      />
      <form className="flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder={t("produtos.buscar")} className="max-w-xs" />
        <select name="status" defaultValue={status} className={`${selectClass} max-w-40`} aria-label={t("produtos.todos")}>
          <option value="">{t("produtos.todos")}</option>
          <option value="ativos">{t("produtos.ativos")}</option>
          <option value="inativos">{t("produtos.inativos")}</option>
        </select>
        <Button type="submit" variant="outline">
          {t("comum.filtrar")}
        </Button>
      </form>
      {produtos.length === 0 ? (
        <EmptyState>{t("produtos.vazio")}</EmptyState>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("produtos.colCodigo")}</TableHead>
                <TableHead>{t("produtos.colNome")}</TableHead>
                <TableHead>{t("produtos.colUnidade")}</TableHead>
                <TableHead className="text-right">{t("produtos.colLimiteBase")}</TableHead>
                <TableHead className="text-right">{t("produtos.colLimiteFranquia")}</TableHead>
                <TableHead className="text-right">{t("produtos.colPeriodo")}</TableHead>
                {comCusto && <TableHead className="text-right">{t("produtos.colCusto")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {produtos.map((p) => (
                <TableRow key={p.id} className={p.active ? "" : "opacity-50"}>
                  <TableCell className="font-mono text-[13px]">
                    {editavel ? (
                      <Link href={`/produtos/${p.id}`} className="hover:underline">
                        {p.code}
                      </Link>
                    ) : (
                      p.code
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {p.name}
                    {!p.active && (
                      <Badge variant="outline" className="ml-2">
                        {t("comum.inativo")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.unit}</TableCell>
                  <TableCell className="text-right tabular-nums">{limite(p.limitBase)}</TableCell>
                  <TableCell className="text-right tabular-nums">{limite(p.limitFranquia)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{t("produtos.dias", { n: p.limitBlockDays })}</TableCell>
                  {comCusto && (
                    <TableCell className="text-right tabular-nums">
                      {custos.has(p.id) ? money.format(custos.get(p.id)!) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination page={page} total={total} pageSize={PRODUTOS_PAGE_SIZE} basePath="/produtos" params={{ q, status }} />
    </>
  );
}
