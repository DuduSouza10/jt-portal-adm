import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { comSaldo, idsComSaldo, basesParaPedir, disponivelPorRegional, produtosParaPedir, almoxarifadosPorRegional } from "@/modules/solicitacoes/queries";
import { db } from "@/lib/db";
import { activeCycle, isExempt } from "@/modules/solicitacoes/limites.service";
import { getPedidoSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";
import { FranquiasNav } from "../nav";
import { PedidoForm } from "../../solicitacoes/nova/pedido-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("solicitacoes.lacres.titulo") };
}

export default async function FranquiasLacresPage() {
  const user = await requirePermission("franquias.ver");
  const t = await getT();
  const [lista, produtos, cfg, disponivel, almoxes] = await Promise.all([basesParaPedir(user).then((l) => l.filter((b) => b.type === "FRANQUIA")), produtosParaPedir({ lacres: true }), getPedidoSettings(), disponivelPorRegional(), almoxarifadosPorRegional()]);
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
      <FranquiasNav user={user} current="/franquias/lacres" />
      {bases.length === 0 ? (
        <EmptyState>{t("solicitacoes.nova.semBase")}</EmptyState>
      ) : produtos.length === 0 ? (
        <EmptyState>{t("solicitacoes.lacres.semLacres")}</EmptyState>
      ) : (
        <Card className="max-w-4xl">
          <CardContent>
            <PedidoForm bases={bases} produtos={comSaldo(produtos, disponivel)} disponivel={idsComSaldo(disponivel)} almoxes={almoxes} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
