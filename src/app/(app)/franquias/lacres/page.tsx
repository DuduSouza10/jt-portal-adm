import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { PedidoFranquia } from "../pedido-franquia";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("solicitacoes.lacres.titulo") };
}

export default async function FranquiasLacresPage() {
  const user = await requirePermission("franquias.ver");
  return <PedidoFranquia user={user} tipo="LACRES" current="/franquias/lacres" />;
}
