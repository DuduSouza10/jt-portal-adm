import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { basesParaPedir, disponivelPorRegional, produtosParaPedir } from "@/modules/solicitacoes/queries";
import { db } from "@/lib/db";
import { activeCycle, isExempt } from "@/modules/solicitacoes/limites.service";
import { getPedidoSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { PedidoForm } from "../nova/pedido-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("solicitacoes.lacres.titulo") };
}

export default async function LacresPage() {
  const user = await requirePermission("solicitacoes.criar");
  const t = await getT();
  const [lista, produtos, cfg, disponivel] = await Promise.all([basesParaPedir(user), produtosParaPedir({ lacres: true }), getPedidoSettings(), disponivelPorRegional()]);
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
        title={t("solicitacoes.lacres.titulo")}
        description={t("solicitacoes.lacres.descricao")}
        back={{ href: "/solicitacoes", label: t("solicitacoes.titulo") }}
      />
      {bases.length === 0 ? (
        <EmptyState>{t("solicitacoes.nova.semBase")}</EmptyState>
      ) : produtos.length === 0 ? (
        <EmptyState>{t("solicitacoes.lacres.semLacres")}</EmptyState>
      ) : (
        <Card className="max-w-4xl">
          <CardContent>
            <PedidoForm bases={bases} produtos={produtos} disponivel={disponivel} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
