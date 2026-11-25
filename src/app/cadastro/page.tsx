import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getT } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/session";
import { opcoesCadastro } from "@/modules/acessos/cadastro.service";
import { AuthShell } from "@/components/auth-shell";
import { CadastroForm } from "./cadastro-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("cadastro.titulo") };
}

/** Criar conta (E20): tela pública, só para franquias. Quem já está logado vai para o início. */
export default async function CadastroPage() {
  if (await getCurrentUser()) redirect("/");
  const t = await getT();
  const { regionais, franquias } = await opcoesCadastro();
  return (
    <AuthShell title={t("cadastro.titulo")} subtitle={t("cadastro.subtitulo")} wide>
      <CadastroForm regionais={regionais} franquias={franquias} />
    </AuthShell>
  );
}
