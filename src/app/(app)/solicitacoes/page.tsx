import type { Metadata } from "next";
import Link from "next/link";
import type { SolicitacaoStatus } from "@/generated/prisma/enums";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { fmtDateTime } from "@/lib/format";
import { formatNumber, STATUS_LABEL } from "@/modules/solicitacoes/rules";
import { basesParaPedir, listSolicitacoes, PAGE_SIZE } from "@/modules/solicitacoes/queries";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { selectClass } from "@/components/form-field";
import { Pagination, pageParam, param } from "@/components/pagination";
import { PriorityBadge, StatusBadge } from "./badges";

export const metadata: Metadata = { title: "Solicitações" };

const STATUSES = Object.keys(STATUS_LABEL) as SolicitacaoStatus[];

export default async function SolicitacoesPage(props: PageProps<"/solicitacoes">) {
  const user = await requirePermission("solicitacoes.ver");
  const sp = await props.searchParams;
  const statusParam = param(sp, "status");
  const status = STATUSES.includes(statusParam as SolicitacaoStatus) ? (statusParam as SolicitacaoStatus) : undefined;
  const abertas = !status && param(sp, "todas") !== "1";
  const baseId = param(sp, "base");
  const qRaw = param(sp, "q");
  const q = Number(qRaw?.replace(/\D/g, "")) || undefined;
  const page = pageParam(sp);
  const [bases, { rows, total }] = await Promise.all([
    basesParaPedir(user),
    listSolicitacoes(user, { status, abertas, baseId, q, page }),
  ]);

  return (
    <>
      <PageHeader
        title="Solicitações"
        description="Pedidos de insumos e o andamento de cada um: aprovado, separado, na expedição, enviado."
        actions={
          can(user, "solicitacoes.criar") && (
            <Button asChild>
              <Link href="/solicitacoes/nova">Solicitar insumos</Link>
            </Button>
          )
        }
      />
      <form className="flex flex-wrap items-center gap-2">
        <select name="status" defaultValue={status ?? ""} className={`${selectClass} max-w-56`}>
          <option value="">Em aberto</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {bases.length > 1 && (
          <select name="base" defaultValue={baseId} className={`${selectClass} max-w-56`}>
            <option value="">Todas as bases</option>
            {bases.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} · {b.name}
              </option>
            ))}
          </select>
        )}
        <Input name="q" defaultValue={qRaw} placeholder="Nº (ex.: SOL-000123)" className="max-w-48" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="todas" value="1" defaultChecked={!abertas && !status} className="size-4" />
          Incluir finalizadas
        </label>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>
      {rows.length === 0 ? (
        <EmptyState>Nenhuma solicitação encontrada.</EmptyState>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Base</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead>Criada</TableHead>
                <TableHead>Última mudança</TableHead>
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
                    {r.partial && <span className="ml-1 text-xs text-muted-foreground">parcial</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r._count.itens}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDateTime(r.createdAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDateTime(r.statusChangedAt)}</TableCell>
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
        basePath="/solicitacoes"
        params={{ status, base: baseId, q: qRaw, todas: abertas ? undefined : "1" }}
      />
    </>
  );
}
