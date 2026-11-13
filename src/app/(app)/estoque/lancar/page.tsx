import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { listAllAlmoxarifados, listAlmoxarifados, listProdutosAtivos } from "@/modules/estoque/queries";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { param } from "@/components/pagination";
import { EstoqueNav } from "../nav";
import { LancamentoForm } from "./lancamento-form";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("lancar.tituloPagina") };
}

export default async function LancarPage(props: PageProps<"/estoque/lancar">) {
  const user = await requirePermission("estoque.movimentar");
  const t = await getT();
  const tipo = param(await props.searchParams, "tipo");
  if (tipo !== "entrada" && tipo !== "saida" && tipo !== "transferencia") notFound();

  const [almox, destinos, produtos] = await Promise.all([
    listAlmoxarifados(user),
    tipo === "transferencia" ? listAllAlmoxarifados() : Promise.resolve([]),
    listProdutosAtivos(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title={t(`lancar.${tipo}Titulo`)} description={t(`lancar.${tipo}Descricao`)} />
      <EstoqueNav user={user} current={`/estoque/lancar?tipo=${tipo}`} />
      {almox.length === 0 ? (
        <EmptyState>{t("estoque.semAlmoxCurto")}</EmptyState>
      ) : produtos.length === 0 ? (
        <EmptyState>{t("lancar.semProdutos")}</EmptyState>
      ) : (
        <Card className="max-w-4xl">
          <CardContent>
            <LancamentoForm
              key={tipo}
              tipo={tipo}
              almoxarifados={almox.map(({ id, code, name }) => ({ id, code, name }))}
              destinos={destinos}
              produtos={produtos}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
