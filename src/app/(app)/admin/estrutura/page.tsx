import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { BASE_TYPE_LABEL } from "@/modules/estrutura/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Regionais e bases" };

export default async function StructurePage() {
  const me = await requirePermission("estrutura.ver");
  const editable = can(me, "estrutura.editar");
  const regionals = await db.regional.findMany({
    orderBy: [{ active: "desc" }, { code: "asc" }],
    include: { bases: { orderBy: [{ active: "desc" }, { code: "asc" }] } },
  });

  return (
    <>
      <PageHeader
        title="Regionais e bases"
        description="Toda base pertence a uma regional. Os acessos dos usuários seguem esta estrutura."
        actions={
          editable && (
            <>
              <Button asChild variant="outline">
                <Link href="/admin/estrutura/regionais/novo">
                  <Plus /> Regional
                </Link>
              </Button>
              <Button asChild disabled={regionals.length === 0}>
                <Link href="/admin/estrutura/bases/novo">
                  <Plus /> Base
                </Link>
              </Button>
            </>
          )
        }
      />
      {regionals.length === 0 && <EmptyState>Nenhuma regional cadastrada. Comece criando uma regional.</EmptyState>}
      <div className="space-y-4">
        {regionals.map((r) => (
          <Card key={r.id} className={r.active ? "" : "opacity-60"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link href={`/admin/estrutura/regionais/${r.id}`} className="hover:underline">
                  {r.code} · {r.name}
                </Link>
                {!r.active && <Badge variant="outline">inativa</Badge>}
                <span className="text-sm font-normal text-muted-foreground">{r.bases.length} base(s)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {r.bases.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma base nesta regional.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {r.bases.map((b) => (
                    <Link
                      key={b.id}
                      href={`/admin/estrutura/bases/${b.id}`}
                      className={`rounded-md border p-2 text-sm hover:border-primary ${b.active ? "" : "opacity-50"}`}
                    >
                      <span className="font-medium">{b.code}</span> · {b.name}
                      <span className="block text-xs text-muted-foreground">
                        {BASE_TYPE_LABEL[b.type]}
                        {b.city && ` · ${b.city}${b.state ? `/${b.state}` : ""}`}
                        {!b.active && " · inativa"}
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
