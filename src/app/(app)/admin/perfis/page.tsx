import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { ALL } from "@/lib/permissions/catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { getT } from "@/i18n/server";
import { profileText } from "@/i18n/labels";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("perfis.titulo") };
}

export default async function ProfilesPage() {
  await requirePermission("perfis.gerenciar");
  const t = await getT();
  const profiles = await db.accessProfile.findMany({
    orderBy: [{ system: "desc" }, { name: "asc" }],
    include: { _count: { select: { users: true } } },
  });

  return (
    <>
      <PageHeader
        title={t("perfis.titulo")}
        description={t("perfis.descricao")}
        actions={
          <Button asChild>
            <Link href="/admin/perfis/novo">
              <Plus /> {t("perfis.novo")}
            </Link>
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {profiles.map((p) => {
          const text = profileText(t, p);
          return (
            <Link key={p.id} href={`/admin/perfis/${p.id}`} className="group">
              <Card className="h-full transition group-hover:-translate-y-0.5 group-hover:border-primary/50 group-hover:shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {text.name}
                    {p.system && <Badge variant="secondary">{t("comum.padrao")}</Badge>}
                  </CardTitle>
                  <CardDescription>{text.description}</CardDescription>
                  <p className="pt-1 text-xs text-muted-foreground">
                    {t(`alcance.${p.scope}`)} ·{" "}
                    {p.permissions.includes(ALL) ? t("perfis.todasPermissoes") : t("perfis.nPermissoes", { n: p.permissions.length })} ·{" "}
                    {t("perfis.nUsuarios", { n: p._count.users })}
                  </p>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
