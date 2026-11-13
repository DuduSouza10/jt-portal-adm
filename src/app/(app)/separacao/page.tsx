import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { formatNumber } from "@/modules/solicitacoes/rules";
import { filaSeparacao } from "@/modules/solicitacoes/queries";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { PriorityBadge, StatusBadge } from "../solicitacoes/badges";

export const metadata: Metadata = { title: "Separação" };

export default async function SeparacaoPage() {
  const user = await requirePermission("expedicao.separar");
  const fila = await filaSeparacao(user);

  return (
    <>
      <PageHeader
        title="Separação"
        description="Solicitações aprovadas para os seus almoxarifados. Urgentes primeiro. Imprima a guia, separe e conclua: o pedido vai para a expedição."
      />
      {fila.length === 0 ? (
        <EmptyState>Nada para separar agora.</EmptyState>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Almox.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead>Aprovada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fila.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/solicitacoes/${s.id}`} className="font-mono font-semibold hover:underline">
                      {formatNumber(s.number)}
                    </Link>{" "}
                    <PriorityBadge priority={s.priority} />
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{s.base.code}</span> <span className="text-muted-foreground">{s.base.name}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.almoxarifado?.code}</TableCell>
                  <TableCell>
                    <StatusBadge status={s.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s._count.itens}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDateTime(s.approvedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
