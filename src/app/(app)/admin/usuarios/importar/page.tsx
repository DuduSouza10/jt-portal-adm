import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { isSubsetOf, scopeWithin } from "@/modules/acessos/rules";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Importar usuários" };

export default async function ImportarPage() {
  const me = await requirePermission("usuarios.editar");
  const profiles = await db.accessProfile.findMany({ orderBy: { name: "asc" } });
  // Só os tipos de acesso que quem está importando pode conceder.
  const grantable = profiles
    .filter((p) => isSubsetOf(p.permissions, me.permissions) && scopeWithin(p.scope, me.scope))
    .map((p) => ({ id: p.id, key: p.key, name: p.name }));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="Importar usuários"
        description="Cadastre ou atualize muitos funcionários de uma vez a partir de uma planilha (CSV)."
        back={{ href: "/admin/usuarios", label: "Usuários" }}
      />
      <Card>
        <CardContent>
          <ImportWizard profiles={grantable} />
        </CardContent>
      </Card>
    </div>
  );
}
