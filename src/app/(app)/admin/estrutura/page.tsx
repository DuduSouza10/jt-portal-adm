import type { Metadata } from "next";
import Link from "next/link";
import { Download, Network, Plus, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { isFeishuLoginEnabled } from "@/lib/feishu/config";
import { getT } from "@/i18n/server";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ListaBases } from "./lista-bases";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("estrutura.titulo") };
}

export default async function StructurePage() {
  const me = await requirePermission("estrutura.ver");
  const editable = can(me, "estrutura.editar");
  const t = await getT();
  const regionals = await db.regional.findMany({
    orderBy: [{ active: "desc" }, { code: "asc" }],
    include: { bases: { orderBy: [{ active: "desc" }, { code: "asc" }] } },
  });

  return (
    <>
      <PageHeader
        title={t("estrutura.titulo")}
        description={t("estrutura.descricao")}
        actions={
          editable && (
            <>
              {isFeishuLoginEnabled() && (
                <Button asChild variant="outline">
                  <Link href="/admin/estrutura/feishu">
                    <Network /> {t("estrutura.feishu.botao")}
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <a href="/api/modelos/bases" download>
                  <Download /> {t("importacao.baixarModelo")}
                </a>
              </Button>
              <Button asChild variant="outline">
                <Link href="/admin/estrutura/importar">
                  <Upload /> {t("usuarios.importar")}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/admin/estrutura/regionais/novo">
                  <Plus /> {t("estrutura.regional")}
                </Link>
              </Button>
              <Button asChild disabled={regionals.length === 0}>
                <Link href="/admin/estrutura/bases/novo">
                  <Plus /> {t("estrutura.base")}
                </Link>
              </Button>
            </>
          )
        }
      />
      {regionals.length === 0 && <EmptyState>{t("estrutura.vazio")}</EmptyState>}
      <ListaBases regionals={regionals} editable={editable} />
    </>
  );
}
