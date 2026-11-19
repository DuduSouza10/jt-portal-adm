import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { BasesImportWizard } from "./wizard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("importacao.bases.titulo") };
}

export default async function ImportarBasesPage() {
  await requirePermission("estrutura.editar");
  const t = await getT();
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title={t("importacao.bases.titulo")} description={t("importacao.bases.descricao")} back={{ href: "/admin/estrutura", label: t("nav.estrutura.label") }} />
      <Card>
        <CardContent>
          <BasesImportWizard
            instructions={
              <ul className="list-disc space-y-1 pl-5">
                <li>{t("importacao.bases.ajuda1")}</li>
                <li>{t("importacao.bases.ajuda2")}</li>
                <li>{t("importacao.bases.ajuda3")}</li>
              </ul>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
