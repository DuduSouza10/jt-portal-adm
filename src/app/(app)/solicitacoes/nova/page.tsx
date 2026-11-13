import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { basesParaPedir, produtosParaPedir } from "@/modules/solicitacoes/queries";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { PedidoForm } from "./pedido-form";

export const metadata: Metadata = { title: "Solicitar insumos" };

export default async function NovaSolicitacaoPage() {
  const user = await requirePermission("solicitacoes.criar");
  const [bases, produtos] = await Promise.all([basesParaPedir(user), produtosParaPedir()]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Solicitar insumos"
        description="Monte o pedido. Depois de aprovado, você acompanha a separação, a expedição e o envio."
        back={{ href: "/solicitacoes", label: "Solicitações" }}
      />
      {bases.length === 0 ? (
        <EmptyState>Seu usuário não está vinculado a nenhuma base. Fale com o administrador.</EmptyState>
      ) : produtos.length === 0 ? (
        <EmptyState>Nenhum insumo disponível para pedido ainda.</EmptyState>
      ) : (
        <Card className="max-w-4xl">
          <CardContent>
            <PedidoForm bases={bases} produtos={produtos} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
