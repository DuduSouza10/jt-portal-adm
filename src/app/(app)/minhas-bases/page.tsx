import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getT } from "@/i18n/server";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { EscolhaBases } from "./escolha";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("minhasBases.titulo") };
}

/** Minhas bases (E17): o RM/supervisor marca as bases e franquias que acompanha. */
export default async function MinhasBasesPage() {
  const user = await requirePermission("bases.escolher");
  const t = await getT();
  const regionais = await db.regional.findMany({
    where: { active: true },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      bases: { where: { active: true, type: { not: "ALMOXARIFADO" } }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, type: true } },
    },
  });
  return (
    <>
      <PageHeader title={t("minhasBases.titulo")} description={t("minhasBases.descricao")} />
      <Card>
        <CardContent>
          <EscolhaBases regionais={regionais.filter((r) => r.bases.length)} marcadas={[...user.baseIds]} />
        </CardContent>
      </Card>
    </>
  );
}
