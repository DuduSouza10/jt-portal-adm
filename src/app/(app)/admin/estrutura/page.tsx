import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { getT } from "@/i18n/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";

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
      <div className="space-y-4">
        {regionals.map((r) => (
          <Card key={r.id} className={r.active ? "" : "opacity-60"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link href={`/admin/estrutura/regionais/${r.id}`} className="hover:underline">
                  {r.code} · {r.name}
                </Link>
                {!r.active && <Badge variant="outline">{t("comum.inativa")}</Badge>}
                <span className="text-sm font-normal text-muted-foreground">{t("estrutura.nBases", { n: r.bases.length })}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {r.bases.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("estrutura.semBases")}</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {r.bases.map((b) => (
                    <Link
                      key={b.id}
                      href={`/admin/estrutura/bases/${b.id}`}
                      className={`rounded-lg border bg-card p-2.5 text-sm transition hover:border-primary/60 hover:shadow-sm ${b.active ? "" : "opacity-50"}`}
                    >
                      <span className="font-medium">{b.code}</span> · {b.name}
                      <span className="block text-xs text-muted-foreground">
                        {t(`tiposBase.${b.type}`)}
                        {b.city && ` · ${b.city}${b.state ? `/${b.state}` : ""}`}
                        {!b.active && ` · ${t("comum.inativa")}`}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
