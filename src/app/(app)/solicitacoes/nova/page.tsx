import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { comSaldo, idsComSaldo, basesParaPedir, disponivelPorRegional, produtosParaPedir, almoxarifadosPorRegional } from "@/modules/solicitacoes/queries";
import { db } from "@/lib/db";
import { activeCycle, isExempt, pedidoEmAndamento } from "@/modules/solicitacoes/limites.service";
import { getPedidoSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { can } from "@/lib/permissions/check";
import { PedidoForm } from "./pedido-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("solicitacoes.solicitar") };
}

export default async function NovaSolicitacaoPage() {
  const user = await requirePermission("solicitacoes.criar");
  const t = await getT();
  const lista = await basesParaPedir(user);
  // S13: insumos são só das bases; franquia pede lacres. S19: a base pede insumos e lacres aqui.
  const soFranquia = lista.length > 0 && lista.every((b) => b.type === "FRANQUIA");
  // Franquia com a aba Franquias: o pedido de lacres fica lá. Franquia aprovada como Base (E11) não tem a aba
  // e nunca pode cair numa página sem acesso: o pedido de lacres abre aqui mesmo.
  if (soFranquia && can(user, "franquias.ver")) redirect("/franquias/lacres");
  const listaBases = soFranquia ? lista : lista.filter((b) => b.type !== "FRANQUIA");
  const [produtos, cfg, disponivel, almoxes] = await Promise.all([produtosParaPedir({ lacres: soFranquia ? true : "todos" }), getPedidoSettings(), disponivelPorRegional(), almoxarifadosPorRegional()]);
  // S1: mostra antes de montar o pedido se a base está no ciclo (quem aprova não entra no ciclo).
  const isento = isExempt(user);
  const bases = await Promise.all(
    listaBases.map(async (b) => {
      const c = !isento && cfg.cicloAtivo && b.type === "BASE" ? await activeCycle(db, b.id) : null;
      return { ...b, pedePessoas: b.type === "BASE" && !isento, cicloAte: c ? fmtDateTime(c.blockedUntil, t.locale) : null, emAndamento: isento ? null : await pedidoEmAndamento(db, b.id) };
    }),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t(soFranquia ? "solicitacoes.lacres.titulo" : "solicitacoes.solicitar")}
        description={t("solicitacoes.nova.descricao")}
        back={{ href: "/solicitacoes", label: t("solicitacoes.titulo") }}
      />
      {bases.length === 0 ? (
        <EmptyState>{t("solicitacoes.nova.semBase")}</EmptyState>
      ) : produtos.length === 0 ? (
        <EmptyState>{t(soFranquia ? "solicitacoes.lacres.semLacres" : "solicitacoes.nova.semProdutos")}</EmptyState>
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
