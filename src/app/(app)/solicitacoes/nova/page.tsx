import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { comSaldo, idsComSaldo, basesParaPedir, disponivelPorRegional, produtosParaPedir, almoxarifadosPorRegional } from "@/modules/solicitacoes/queries";
import { db } from "@/lib/db";
import { avisosDoPedido, isExempt } from "@/modules/solicitacoes/limites.service";
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
  // S19/S20: a base pede insumos e lacres aqui. A franquia pede em Franquias › Solicitar insumos / Solicitar lacres;
  // franquia sem a aba Franquias (conta antiga, tipo Base) pede insumos aqui mesmo, sem cair numa página sem acesso.
  const soFranquia = lista.length > 0 && lista.every((b) => b.type === "FRANQUIA");
  if (soFranquia && can(user, "franquias.ver")) redirect("/franquias/insumos");
  const listaBases = soFranquia ? lista : lista.filter((b) => b.type !== "FRANQUIA");
  const [produtos, cfg, disponivel, almoxes] = await Promise.all([produtosParaPedir({ lacres: soFranquia ? false : "todos" }), getPedidoSettings(), disponivelPorRegional(), almoxarifadosPorRegional()]);
  // S1/S20: mostra antes de montar o pedido se a base está no ciclo (quem aprova não entra no ciclo).
  const isento = isExempt(user);
  const bases = await Promise.all(
    listaBases.map(async (b) => {
      const a = isento ? null : await avisosDoPedido(db, b, b.type === "FRANQUIA" ? "INSUMOS" : undefined, cfg);
      return {
        ...b,
        pedePessoas: b.type === "BASE" && !isento,
        cicloAte: a?.cicloAte ? fmtDateTime(a.cicloAte, t.locale) : null,
        emAndamento: a?.emAndamento ?? null,
        jaFez: a?.jaFez ? ("INSUMOS" as const) : null,
        foraDoDia: a?.foraDoDia ?? false,
      };
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
            <PedidoForm bases={bases} produtos={comSaldo(produtos, disponivel)} disponivel={idsComSaldo(disponivel)} almoxes={almoxes} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
