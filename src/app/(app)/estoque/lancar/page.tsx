import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { listAllAlmoxarifados, listAlmoxarifados, listProdutosAtivos } from "@/modules/estoque/queries";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { param } from "@/components/pagination";
import { EstoqueNav } from "../nav";
import { LancamentoForm } from "./lancamento-form";

export const metadata: Metadata = { title: "Lançamento de estoque" };

const INFO = {
  entrada: { title: "Entrada de materiais", description: "Recebimento de compra ou devolução, com nota fiscal." },
  saida: { title: "Saída de materiais", description: "Consumo, avaria ou descarte. Não usa o que está reservado para solicitações." },
  transferencia: { title: "Transferência entre almoxarifados", description: "Tira da origem e coloca no destino na mesma operação." },
} as const;

export default async function LancarPage(props: PageProps<"/estoque/lancar">) {
  const user = await requirePermission("estoque.movimentar");
  const tipo = param(await props.searchParams, "tipo");
  if (tipo !== "entrada" && tipo !== "saida" && tipo !== "transferencia") notFound();

  const [almox, destinos, produtos] = await Promise.all([
    listAlmoxarifados(user),
    tipo === "transferencia" ? listAllAlmoxarifados() : Promise.resolve([]),
    listProdutosAtivos(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title={INFO[tipo].title} description={INFO[tipo].description} />
      <EstoqueNav user={user} current={`/estoque/lancar?tipo=${tipo}`} />
      {almox.length === 0 ? (
        <EmptyState>Nenhum almoxarifado no seu alcance.</EmptyState>
      ) : produtos.length === 0 ? (
        <EmptyState>Nenhum produto ativo cadastrado ainda.</EmptyState>
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
