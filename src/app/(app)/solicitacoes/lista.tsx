import Link from "next/link";
import type { SolicitacaoStatus } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { fmtDateTime } from "@/lib/format";
import { getT } from "@/i18n/server";
import { statusText } from "@/i18n/labels";
import { formatNumber, STATUS_LABEL } from "@/modules/solicitacoes/rules";
import { basesParaPedir, listSolicitacoes, PAGE_SIZE } from "@/modules/solicitacoes/queries";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/page-header";
import type { ReactNode } from "react";
import { selectClass } from "@/components/form-field";
import { Pagination, pageParam, param } from "@/components/pagination";
import { PriorityBadge, StatusBadge } from "./badges";

const STATUSES = Object.keys(STATUS_LABEL) as SolicitacaoStatus[];

/**
 * Lista de solicitações com filtros. Usada em /solicitacoes e, só com as franquias, em /franquias
 * (soFranquias: filtra pedidos de bases do tipo Franquia; basePath: para onde vão os filtros e a paginação).
 */
export async function SolicitacoesLista({
  user,
  sp,
  soFranquias = false,
  basePath = "/solicitacoes",
  header,
}: {
  user: CurrentUser;
  sp: Record<string, string | string[] | undefined>;
  soFranquias?: boolean;
  basePath?: string;
  header?: ReactNode;
}) {
  const t = await getT();
  const statusParam = param(sp, "status");
  const status = STATUSES.includes(statusParam as SolicitacaoStatus) ? (statusParam as SolicitacaoStatus) : undefined;
  const abertas = !status && param(sp, "todas") !== "1";
  const baseId = param(sp, "base");
  const qRaw = param(sp, "q");
  const q = Number(qRaw?.replace(/\D/g, "")) || undefined;
  const page = pageParam(sp);
  const [bases, { rows, total }] = await Promise.all([
    basesParaPedir(user).then((l) => (soFranquias ? l.filter((b) => b.type === "FRANQUIA") : l)),
    listSolicitacoes(user, { status, abertas, baseId, q, page, soFranquias }),
  ]);

  return (
    <>
      {header ?? (
        <PageHeader
          title={t("solicitacoes.titulo")}
          description={t("solicitacoes.descricao")}
          actions={
            <>
              {can(user, "solicitacoes.aprovar") && (
                <Button asChild variant="outline">
                  <Link href="/solicitacoes/ciclos">{t("ciclos.titulo")}</Link>
                </Button>
              )}
              {can(user, "solicitacoes.criar") && (
                <Button asChild>
                  <Link href="/solicitacoes/nova">{t("solicitacoes.solicitar")}</Link>
                </Button>
              )}
            </>
          }
        />
      )}
      <form className="flex flex-wrap items-center gap-2">
        <select name="status" defaultValue={status ?? ""} className={`${selectClass} max-w-56`}>
          <option value="">{t("solicitacoes.emAberto")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusText(t, s)}
            </option>
          ))}
        </select>
        {bases.length > 1 && (
          <select name="base" defaultValue={baseId} className={`${selectClass} max-w-56`}>
            <option value="">{t("solicitacoes.todasBases")}</option>
            {bases.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} · {b.name}
              </option>
            ))}
          </select>
        )}
        <Input name="q" defaultValue={qRaw} placeholder={t("solicitacoes.numPh")} className="max-w-48" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="todas" value="1" defaultChecked={!abertas && !status} className="size-4" />
          {t("solicitacoes.incluirFinalizadas")}
        </label>
        <Button type="submit" variant="outline">
          {t("comum.filtrar")}
        </Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState>{t("solicitacoes.vazio")}</EmptyState>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("solicitacoes.col.num")}</TableHead>
                <TableHead>{t("solicitacoes.col.base")}</TableHead>
                <TableHead>{t("solicitacoes.col.status")}</TableHead>
                <TableHead className="text-right">{t("solicitacoes.col.itens")}</TableHead>
                <TableHead>{t("solicitacoes.col.criada")}</TableHead>
                <TableHead>{t("solicitacoes.col.ultima")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/solicitacoes/${r.id}`} className="font-mono font-semibold hover:underline">
                      {formatNumber(r.number)}
                    </Link>{" "}
                    <PriorityBadge priority={r.priority} />
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{r.base.code}</span> <span className="text-muted-foreground">{r.base.name}</span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                    {r.partial && <span className="ml-1 text-xs text-muted-foreground">{t("solicitacoes.parcial")}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r._count.itens}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDateTime(r.createdAt, t.locale)}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDateTime(r.statusChangedAt, t.locale)}</TableCell>
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
        basePath={basePath}
        params={{ status, base: baseId, q: qRaw, todas: abertas ? undefined : "1" }}
      />
    </>
  );
}
