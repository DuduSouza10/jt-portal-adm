import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { fmtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { selectClass } from "@/components/form-field";
import { Pagination, pageParam } from "@/components/pagination";
import { usersScopeWhere } from "@/modules/acessos/queries";
import type { Prisma } from "@/generated/prisma/client";
import { getT } from "@/i18n/server";
import { profileText } from "@/i18n/labels";

const PAGE_SIZE = 50;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("usuarios.titulo") };
}

export default async function UsersPage(props: PageProps<"/admin/usuarios">) {
  const me = await requirePermission("usuarios.ver");
  const t = await getT();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const perfil = typeof sp.perfil === "string" ? sp.perfil : "";
  const page = pageParam(sp);

  const scope = usersScopeWhere(me);
  const where: Prisma.UserWhereInput = {
    ...(scope && { AND: [scope] }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { login: { contains: q.toLowerCase() } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    }),
    ...(perfil && { profileId: perfil }),
  };
  const [users, total, profiles] = await Promise.all([
    db.user.findMany({
      where,
      include: { profile: true, bases: { include: { base: true } }, regionals: { include: { regional: true } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.user.count({ where }),
    db.accessProfile.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title={t("usuarios.titulo")}
        description={t("usuarios.total", { n: total })}
        actions={
          can(me, "usuarios.editar") && (
            <Button asChild>
              <Link href="/admin/usuarios/novo">
                <Plus /> {t("usuarios.novo")}
              </Link>
            </Button>
          )
        }
      />
      <form className="flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder={t("usuarios.buscar")} className="max-w-xs" />
        <select name="perfil" defaultValue={perfil} className={`${selectClass} max-w-56`}>
          <option value="">{t("usuarios.todosTipos")}</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {profileText(t, p).name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          {t("comum.filtrar")}
        </Button>
      </form>
      {users.length === 0 ? (
        <EmptyState>{t("usuarios.vazio")}</EmptyState>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("usuarios.colNome")}</TableHead>
                <TableHead>{t("usuarios.colLogin")}</TableHead>
                <TableHead>{t("usuarios.colTipo")}</TableHead>
                <TableHead>{t("usuarios.colBases")}</TableHead>
                <TableHead>{t("usuarios.colUltimoAcesso")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className={u.active ? "" : "opacity-50"}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/usuarios/${u.id}`} className="hover:underline">
                      {u.name}
                    </Link>
                    {!u.active && (
                      <Badge variant="outline" className="ml-2">
                        {t("comum.inativo")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{u.login}</TableCell>
                  <TableCell>{profileText(t, u.profile).name}</TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground">
                    {[...u.regionals.map((r) => r.regional.code), ...u.bases.map((b) => b.base.code)].join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmtDateTime(u.lastLoginAt, t.locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath="/admin/usuarios" params={{ q, perfil }} />
    </>
  );
}
