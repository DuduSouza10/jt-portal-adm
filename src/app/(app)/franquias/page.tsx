import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { getT } from "@/i18n/server";
import { Button } from "@/components/ui/button";
import { SolicitacoesLista } from "../solicitacoes/lista";
import { FranquiasNav } from "./nav";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("franquias.titulo") };
}

/** Franquias → Solicitações: só pedidos de franquias (cada franquia vê só os dela). */
export default async function FranquiasPage(props: PageProps<"/franquias">) {
  const user = await requirePermission("franquias.ver");
  const t = await getT();
  return (
    <div className="space-y-4">
      <FranquiasNav user={user} current="/franquias" />
      <SolicitacoesLista
        user={user}
        sp={await props.searchParams}
        soFranquias
        basePath="/franquias"
        header={
          can(user, "solicitacoes.criar") ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button asChild variant="outline">
                <Link href="/franquias/insumos">{t("franquias.abas.insumos")}</Link>
              </Button>
              <Button asChild>
                <Link href="/franquias/lacres">{t("solicitacoes.lacres.titulo")}</Link>
              </Button>
            </div>
          ) : (
            <></>
          )
        }
      />
    </div>
  );
}
