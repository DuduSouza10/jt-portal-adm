import type { Metadata } from "next";
import type { StockMovementType } from "@/generated/prisma/enums";
import { requirePermission } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { listAlmoxarifados, listMovimentos, PAGE_SIZE } from "@/modules/estoque/queries";
import { MOVEMENT_LABEL } from "@/modules/estoque/schemas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { selectClass } from "@/components/form-field";
import { Pagination, pageParam, param } from "@/components/pagination";
import { EstoqueNav } from "../nav";

export const metadata: Metadata = { title: "Movimentações de estoque" };

const fmtDelta = (n: number) => (n > 0 ? `+${n}` : n === 0 ? "—" : String(n));

export default async function MovimentacoesPage(props: PageProps<"/estoque/movimentacoes">) {
  const user = await requirePermission("estoque.ver");
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
      <PageHeader title="Movimentações" description="Livro-razão do estoque: toda mudança de saldo, com quem fez e por quê." />
      <EstoqueNav user={user} current="/estoque/movimentacoes" />
      <form className="flex flex-wrap gap-2">
        <select name="base" defaultValue={base} className={`${selectClass} max-w-56`}>
          <option value="">Todos os almoxarifados</option>
          {almox.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code}
            </option>
          ))}
        </select>
        <select name="tipo" defaultValue={tipo ?? ""} className={`${selectClass} max-w-56`}>
          <option value="">Todos os tipos</option>
          {Object.entries(MOVEMENT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <Input name="q" defaultValue={q} placeholder="Produto ou documento" className="max-w-xs" />
        {lote && <input type="hidden" name="lote" value={lote} />}
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {lote && (
          <Button asChild variant="ghost">
            <a href="/estoque/movimentacoes">Ver todas (filtrando um lançamento)</a>
          </Button>
        )}
      </form>
      {rows.length === 0 ? (
        <EmptyState>Nenhuma movimentação encontrada.</EmptyState>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Almox.</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Físico</TableHead>
                <TableHead className="text-right">Reservado</TableHead>
                <TableHead className="text-right">Saldo após</TableHead>
                <TableHead>Doc. / motivo</TableHead>
                <TableHead>Quem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-muted-foreground">{fmtDateTime(m.createdAt)}</TableCell>
                  <TableCell>{m.base.code}</TableCell>
                  <TableCell>
                    <a href={`/estoque/movimentacoes?lote=${m.batchId}`} className="hover:underline" title="Ver o lançamento inteiro">
                      {MOVEMENT_LABEL[m.type]}
                    </a>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{m.produto.code}</span> {m.produto.name}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${m.quantity < 0 ? "text-destructive" : m.quantity > 0 ? "text-emerald-700" : ""}`}>
                    {fmtDelta(m.quantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{fmtDelta(m.reservedDelta)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.balanceAfter}
                    {m.reservedAfter > 0 && <span className="text-xs text-muted-foreground"> ({m.reservedAfter} res.)</span>}
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground" title={[m.document, m.reason].filter(Boolean).join(" · ")}>
                    {[m.document, m.reason, m.refType === "solicitacao" ? `solicitação ${m.refId}` : null].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.actor?.name ?? "Sistema"}</TableCell>
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
