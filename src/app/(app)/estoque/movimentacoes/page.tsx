import type { Metadata } from "next";
import type { StockMovementType } from "@/generated/prisma/enums";
import { requirePermission } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { listAlmoxarifados, listMovimentos, PAGE_SIZE } from "@/modules/estoque/queries";
import { MOVEMENT_LABEL } from "@/modules/estoque/schemas";
import { getT } from "@/i18n/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { selectClass } from "@/components/form-field";
import { Pagination, pageParam, param } from "@/components/pagination";
import { EstoqueNav } from "../nav";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("movimentacoes.tituloPagina") };
}

const fmtDelta = (n: number) => (n > 0 ? `+${n}` : n === 0 ? "—" : String(n));

export default async function MovimentacoesPage(props: PageProps<"/estoque/movimentacoes">) {
  const user = await requirePermission("estoque.ver");
  const t = await getT();
  const sp = await props.searchParams;
  const almox = await listAlmoxarifados(user, { includeInactive: true });
  const base = param(sp, "base");
  const tipoRaw = param(sp, "tipo");
  const tipo = tipoRaw in MOVEMENT_LABEL ? (tipoRaw as StockMovementType) : undefined;
  const q = param(sp, "q");
  const lote = param(sp, "lote");
  const page = pageParam(sp);
  const baseIds = base && almox.some((a) => a.id === base) ? [base] : almox.map((a) => a.id);
  const { rows, total } = await listMovimentos({ baseIds, type: tipo, q, batchId: lote || undefined, page });

  return (
    <>
      <PageHeader title={t("movimentacoes.titulo")} description={t("movimentacoes.descricao")} />
      <EstoqueNav user={user} current="/estoque/movimentacoes" />
      <form className="flex flex-wrap gap-2">
        <select name="base" defaultValue={base} className={`${selectClass} max-w-56`}>
          <option value="">{t("movimentacoes.todosAlmox")}</option>
          {almox.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code}
            </option>
          ))}
        </select>
        <select name="tipo" defaultValue={tipo ?? ""} className={`${selectClass} max-w-56`}>
          <option value="">{t("movimentacoes.todosTipos")}</option>
          {(Object.keys(MOVEMENT_LABEL) as StockMovementType[]).map((k) => (
            <option key={k} value={k}>
              {t(`tiposMovimento.${k}`)}
            </option>
          ))}
        </select>
        <Input name="q" defaultValue={q} placeholder={t("movimentacoes.busca")} className="max-w-xs" />
        {lote && <input type="hidden" name="lote" value={lote} />}
        <Button type="submit" variant="outline">
          {t("comum.filtrar")}
        </Button>
        {lote && (
          <Button asChild variant="ghost">
            <a href="/estoque/movimentacoes">{t("movimentacoes.verTodas")}</a>
          </Button>
        )}
      </form>
      {rows.length === 0 ? (
        <EmptyState>{t("movimentacoes.vazio")}</EmptyState>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("movimentacoes.colQuando")}</TableHead>
                <TableHead>{t("movimentacoes.colAlmox")}</TableHead>
                <TableHead>{t("movimentacoes.colTipo")}</TableHead>
                <TableHead>{t("movimentacoes.colProduto")}</TableHead>
                <TableHead className="text-right">{t("movimentacoes.colFisico")}</TableHead>
                <TableHead className="text-right">{t("movimentacoes.colReservado")}</TableHead>
                <TableHead className="text-right">{t("movimentacoes.colSaldo")}</TableHead>
                <TableHead>{t("movimentacoes.colDoc")}</TableHead>
                <TableHead>{t("movimentacoes.colQuem")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-muted-foreground">{fmtDateTime(m.createdAt, t.locale)}</TableCell>
                  <TableCell>{m.base.code}</TableCell>
                  <TableCell>
                    <a href={`/estoque/movimentacoes?lote=${m.batchId}`} className="hover:underline" title={t("movimentacoes.verLote")}>
                      {t(`tiposMovimento.${m.type}`)}
                    </a>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{m.produto.code}</span> {m.produto.name}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${m.quantity < 0 ? "text-destructive" : m.quantity > 0 ? "text-success" : ""}`}>
                    {fmtDelta(m.quantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{fmtDelta(m.reservedDelta)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.balanceAfter}
                    {m.reservedAfter > 0 && <span className="text-xs text-muted-foreground"> {t("movimentacoes.reservadoApos", { n: m.reservedAfter })}</span>}
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground" title={[m.document, m.reason].filter(Boolean).join(" · ")}>
                    {[m.document, m.reason, m.refType === "solicitacao" ? t("movimentacoes.solicitacao", { id: m.refId ?? "" }) : null].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.actor?.name ?? t("comum.sistema")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        basePath="/estoque/movimentacoes"
        params={{ base, tipo: tipo ?? undefined, q, lote }}
      />
    </>
  );
}
