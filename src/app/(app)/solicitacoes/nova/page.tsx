import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { basesParaPedir, produtosParaPedir } from "@/modules/solicitacoes/queries";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { PedidoForm } from "./pedido-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("solicitacoes.solicitar") };
}

export default async function NovaSolicitacaoPage() {
  const user = await requirePermission("solicitacoes.criar");
  const t = await getT();
  const [bases, produtos] = await Promise.all([basesParaPedir(user), produtosParaPedir()]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("solicitacoes.solicitar")}
        description={t("solicitacoes.nova.descricao")}
        back={{ href: "/solicitacoes", label: t("solicitacoes.titulo") }}
      />
      {bases.length === 0 ? (
        <EmptyState>{t("solicitacoes.nova.semBase")}</EmptyState>
      ) : produtos.length === 0 ? (
        <EmptyState>{t("solicitacoes.nova.semProdutos")}</EmptyState>
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
