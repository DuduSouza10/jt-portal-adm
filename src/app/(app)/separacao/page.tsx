import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { getT } from "@/i18n/server";
import { formatNumber } from "@/modules/solicitacoes/rules";
import { filaSeparacao } from "@/modules/solicitacoes/queries";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { PriorityBadge, StatusBadge } from "../solicitacoes/badges";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("nav.separacao.label") };
}

export default async function SeparacaoPage() {
  const user = await requirePermission("expedicao.separar");
  const t = await getT();
  const fila = await filaSeparacao(user);

  return (
    <>
      <PageHeader
        title={t("nav.separacao.label")}
        description={t("solicitacoes.separacao.descricao")}
      />
      {fila.length === 0 ? (
        <EmptyState>{t("solicitacoes.separacao.vazio")}</EmptyState>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("solicitacoes.col.num")}</TableHead>
                <TableHead>{t("solicitacoes.separacao.col.destino")}</TableHead>
                <TableHead>{t("solicitacoes.separacao.col.almox")}</TableHead>
                <TableHead>{t("solicitacoes.col.status")}</TableHead>
                <TableHead className="text-right">{t("solicitacoes.col.itens")}</TableHead>
                <TableHead>{t("solicitacoes.separacao.col.aprovada")}</TableHead>
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
                  <TableCell className="text-muted-foreground">{fmtDateTime(s.approvedAt, t.locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
