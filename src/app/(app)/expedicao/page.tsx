import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { formatNumber } from "@/modules/solicitacoes/rules";
import { filaExpedicao } from "@/modules/solicitacoes/queries";
import { PageHeader } from "@/components/page-header";
import { ShippingBoard, type ReadyOrder, type ShippedOrder } from "./shipping-board";

export const metadata: Metadata = { title: "Expedição" };

/** Expedição (vinda do sistema antigo): só precisa de expedicao.enviar (perfil Expedição, regra E9). */
export default async function ExpedicaoPage(props: PageProps<"/expedicao">) {
  const user = await requirePermission("expedicao.enviar");
  const { pedido } = await props.searchParams;
  const { ready, shipped } = await filaExpedicao(user);

  const readyRows: ReadyOrder[] = ready.map((o) => ({
    id: o.id,
    number: formatNumber(o.number),
    priority: o.priority,
    partial: o.partial,
    separatedAt: o.separatedAt?.toISOString() ?? null,
    baseCode: o.base.code,
    baseName: o.base.name,
    baseCity: o.base.city,
    items: o._count.itens,
  }));
  const shippedRows: ShippedOrder[] = shipped.map((o) => ({
    id: o.id,
    number: formatNumber(o.number),
    shippedAt: o.shippedAt!.toISOString(),
    tripId: o.tripId,
    volumes: o.volumes,
    baseCode: o.base.code,
  }));

  return (
    <div className="space-y-4">
      <PageHeader title="Expedição" description="Pedidos já separados pelo almoxarifado. Carregue no caminhão, bipe a guia e confirme o envio." />
      <div className="max-w-4xl">
        <ShippingBoard ready={readyRows} shipped={shippedRows} preselect={typeof pedido === "string" ? pedido : undefined} />
      </div>
    </div>
  );
}
