import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { basesParaPedir, produtosParaPedir } from "@/modules/solicitacoes/queries";
import { db } from "@/lib/db";
import { activeCycle, isExempt } from "@/modules/solicitacoes/limites.service";
import { getPedidoSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/format";
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
  const [lista, produtos, cfg] = await Promise.all([basesParaPedir(user), produtosParaPedir(), getPedidoSettings()]);
  // S1: mostra antes de montar o pedido se a base está no ciclo (quem aprova não entra no ciclo).
  const isento = isExempt(user);
  const bases = await Promise.all(
    lista.map(async (b) => {
      const c = !isento && cfg.cicloAtivo && b.type === "BASE" ? await activeCycle(db, b.id) : null;
      return { ...b, pedePessoas: b.type === "BASE" && !isento, cicloAte: c ? fmtDateTime(c.blockedUntil, t.locale) : null };
    }),
  );

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
