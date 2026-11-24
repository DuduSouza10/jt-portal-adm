import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { getSolicitacao } from "@/modules/solicitacoes/queries";
import { allowed } from "@/modules/solicitacoes/service";
import { EtiquetaEnvio } from "./etiqueta";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("solicitacoes.etiqueta.titulo") };
}

/**
 * Papel de envio (pedido do Diogo, 2026-11-24): folha A4 deitada, igual ao modelo usado hoje —
 * "DE: <quem envia> (<local>)", "PARA", "<quem pediu> (<base>)", em letra grande. Vem preenchido
 * (quem separou e quem pediu) e todo campo pode ser mudado antes de imprimir.
 */
export default async function EtiquetaPage(props: PageProps<"/solicitacoes/[id]/etiqueta">) {
  const user = await requirePermission("expedicao.separar");
  const { id } = await props.params;
  const s = await getSolicitacao(id);
  if (!s || !s.almoxarifado || !allowed(user, "separar", s)) notFound();

  // Quem separou: o último evento que levou o pedido a "Separada"; se ainda não separou, quem está imprimindo.
  const separou = [...s.eventos].reverse().find((e) => e.toStatus === "SEPARADA")?.actor?.name;
  return (
    <EtiquetaEnvio
      inicial={{
        deNome: (separou ?? user.name).toUpperCase(),
        deLocal: s.almoxarifado.name.toUpperCase(),
        paraNome: s.createdBy.name.toUpperCase(),
        paraLocal: s.base.name.toUpperCase(),
      }}
    />
  );
}
