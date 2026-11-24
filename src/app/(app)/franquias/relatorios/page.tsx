import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { RelatoriosView } from "../../relatorios/view";
import { FranquiasNav } from "../nav";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("franquias.abas.relatorios") };
}

/** Franquias → Relatórios: os mesmos relatórios, só com as franquias (cada franquia vê só os dela). */
export default async function FranquiasRelatoriosPage(props: PageProps<"/franquias/relatorios">) {
  const user = await requirePermission("franquias.ver");
  return (
    <div className="space-y-4">
      <FranquiasNav user={user} current="/franquias/relatorios" />
      <RelatoriosView user={user} sp={await props.searchParams} soFranquias basePath="/franquias/relatorios" header={<></>} />
    </div>
  );
}
