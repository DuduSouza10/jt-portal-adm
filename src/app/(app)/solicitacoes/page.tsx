import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { SolicitacoesLista } from "./lista";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("solicitacoes.titulo") };
}

export default async function SolicitacoesPage(props: PageProps<"/solicitacoes">) {
  const user = await requirePermission("solicitacoes.ver");
  return <SolicitacoesLista user={user} sp={await props.searchParams} />;
}
