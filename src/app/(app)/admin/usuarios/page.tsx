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

export const metadata: Metadata = { title: "Usuários" };

export default async function UsersPage(props: PageProps<"/admin/usuarios">) {
  const me = await requirePermission("usuarios.ver");
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const perfil = typeof sp.perfil === "string" ? sp.perfil : "";

  const [users, profiles] = await Promise.all([
    db.user.findMany({
      where: {
        ...(q && {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { login: { contains: q.toLowerCase() } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }),
        ...(perfil && { profileId: perfil }),
      },
      include: { profile: true, bases: { include: { base: true } }, regionals: { include: { regional: true } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      take: 500,
    }),
    db.accessProfile.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Usuários"
        description={`${users.length} usuário(s)`}
        actions={
          can(me, "usuarios.editar") && (
            <Button asChild>
              <Link href="/admin/usuarios/novo">
                <Plus /> Novo usuário
              </Link>
            </Button>
          )
        }
      />
      <form className="flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="Buscar por nome, login ou e-mail" className="max-w-xs" />
        <select name="perfil" defaultValue={perfil} className={`${selectClass} max-w-56`}>
          <option value="">Todos os tipos de acesso</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>
      {users.length === 0 ? (
        <EmptyState>Nenhum usuário encontrado.</EmptyState>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Login</TableHead>
                <TableHead>Tipo de acesso</TableHead>
                <TableHead>Bases / regionais</TableHead>
                <TableHead>Último acesso</TableHead>
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
                        inativo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{u.login}</TableCell>
                  <TableCell>{u.profile.name}</TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground">
                    {[...u.regionals.map((r) => r.regional.code), ...u.bases.map((b) => b.base.code)].join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmtDateTime(u.lastLoginAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
