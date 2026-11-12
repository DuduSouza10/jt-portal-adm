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
import { SCOPE_LABEL } from "./scope";

export const metadata: Metadata = { title: "Tipos de acesso" };

export default async function ProfilesPage() {
  await requirePermission("perfis.gerenciar");
  const profiles = await db.accessProfile.findMany({
    orderBy: [{ system: "desc" }, { name: "asc" }],
    include: { _count: { select: { users: true } } },
  });

  return (
    <>
      <PageHeader
        title="Tipos de acesso"
        description="Cada usuário tem um tipo de acesso, que define o que ele pode fazer e quais bases enxerga."
        actions={
          <Button asChild>
            <Link href="/admin/perfis/novo">
              <Plus /> Novo tipo de acesso
            </Link>
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {profiles.map((p) => (
          <Link key={p.id} href={`/admin/perfis/${p.id}`} className="group">
            <Card className="h-full transition group-hover:border-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {p.name}
                  {p.system && <Badge variant="secondary">padrão</Badge>}
                </CardTitle>
                <CardDescription>{p.description}</CardDescription>
                <p className="text-xs text-muted-foreground">
                  {SCOPE_LABEL[p.scope]} ·{" "}
                  {p.permissions.includes(ALL) ? "todas as permissões" : `${p.permissions.length} permissão(ões)`} ·{" "}
                  {p._count.users} usuário(s)
                </p>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
