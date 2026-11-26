import { getT } from "@/i18n/server";
import type { CurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getPedidoSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";
import { comSaldo, idsComSaldo, basesParaPedir, disponivelPorRegional, produtosParaPedir, almoxarifadosPorRegional } from "@/modules/solicitacoes/queries";
import { avisosDoPedido, isExempt } from "@/modules/solicitacoes/limites.service";
import type { TipoPedido } from "@/modules/solicitacoes/rules";
import { PedidoForm } from "../solicitacoes/nova/pedido-form";
import { FranquiasNav } from "./nav";

/** Franquias › Solicitar insumos / Solicitar lacres (S20): o mesmo formulário, com os produtos de cada tipo. */
export async function PedidoFranquia({ user, tipo, current }: { user: CurrentUser; tipo: TipoPedido; current: string }) {
  const t = await getT();
  const lacres = tipo === "LACRES";
  const [lista, produtos, cfg, disponivel, almoxes] = await Promise.all([
    basesParaPedir(user).then((l) => l.filter((b) => b.type === "FRANQUIA")),
    produtosParaPedir({ lacres }),
    getPedidoSettings(),
    disponivelPorRegional(),
    almoxarifadosPorRegional(),
  ]);
  const isento = isExempt(user);
  const bases = await Promise.all(
    lista.map(async (b) => {
      const a = isento ? null : await avisosDoPedido(db, b, tipo, cfg);
      return { ...b, pedePessoas: false, cicloAte: a?.cicloAte ? fmtDateTime(a.cicloAte, t.locale) : null, emAndamento: a?.emAndamento ?? null, jaFez: a?.jaFez ? tipo : null };
    }),
  );

  return (
    <div className="space-y-4">
      <FranquiasNav user={user} current={current} />
      {bases.length === 0 ? (
        <EmptyState>{t("solicitacoes.nova.semBase")}</EmptyState>
      ) : produtos.length === 0 ? (
        <EmptyState>{t(lacres ? "solicitacoes.lacres.semLacres" : "solicitacoes.nova.semProdutos")}</EmptyState>
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
