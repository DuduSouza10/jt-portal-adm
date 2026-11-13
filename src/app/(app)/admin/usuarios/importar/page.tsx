import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getT } from "@/i18n/server";
import { requirePermission } from "@/lib/auth/session";
import { isSubsetOf, scopeWithin } from "@/modules/acessos/rules";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { ImportWizard } from "./import-wizard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("importacao.usuarios.titulo") };
}

export default async function ImportarPage() {
  const me = await requirePermission("usuarios.editar");
  const t = await getT();
  const profiles = await db.accessProfile.findMany({ orderBy: { name: "asc" } });
  // Só os tipos de acesso que quem está importando pode conceder.
  const grantable = profiles
    .filter((p) => isSubsetOf(p.permissions, me.permissions) && scopeWithin(p.scope, me.scope))
    .map((p) => ({ id: p.id, key: p.key, name: p.name }));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title={t("importacao.usuarios.titulo")}
        description={t("importacao.usuarios.descricao")}
        back={{ href: "/admin/usuarios", label: t("usuarios.titulo") }}
      />
      <Card>
        <CardContent>
          <ImportWizard profiles={grantable} />
        </CardContent>
      </Card>
    </div>
  );
}
