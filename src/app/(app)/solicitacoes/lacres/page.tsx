import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";

/**
 * S19: a página de lacres é só da franquia e fica na aba Franquias. Quem chegar pelo endereço antigo vai para lá;
 * a base (que pede lacres em Solicitar insumos) vai para o pedido, em vez de cair num 404.
 */
export default async function LacresPage() {
  const user = await requirePermission("solicitacoes.criar");
  redirect(can(user, "franquias.ver") ? "/franquias/lacres" : "/solicitacoes/nova");
}
