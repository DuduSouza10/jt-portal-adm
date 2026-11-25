import { FiltroForm } from "@/components/filtro-form";
import { SelectBox } from "@/components/ui/combobox";
import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Plus, Search, Upload, UserCheck, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Pagination, pageParam } from "@/components/pagination";
import { Abas } from "@/components/abas";
import { AutoAtualizar } from "@/components/auto-atualizar";
import { usersScopeWhere } from "@/modules/acessos/queries";
import type { Prisma } from "@/generated/prisma/client";
import { getT } from "@/i18n/server";
import { profileText } from "@/i18n/labels";
import { AprovarButton } from "./aprovar-button";

const PAGE_SIZE = 50;
const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000);
const MAX_CHIPS = 3;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("usuarios.titulo") };
}

/** Iniciais para o círculo do avatar: primeira letra do primeiro e do último nome. */
function iniciais(nome: string) {
  // Sem o que vem entre parênteses (ex.: "(exemplo)").
  const p = nome.replace(/\(.*?\)/g, " ").trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? (p.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

function Avatar({ nome, tom = "padrao" }: { nome: string; tom?: "padrao" | "alerta" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold",
        tom === "alerta" ? "bg-warning/15 text-warning" : "bg-accent text-accent-foreground",
      )}
    >
      {iniciais(nome)}
    </span>
  );
}

/** Siglas das bases e regionais como etiquetas; passando de 3, o resto vira "+n" (o nome completo fica no título). */
function Siglas({ itens, vazio }: { itens: { codigo: string; nome: string; regional?: boolean }[]; vazio?: React.ReactNode }) {
  if (itens.length === 0) return <span className="text-muted-foreground">{vazio ?? "—"}</span>;
  const mostrar = itens.slice(0, MAX_CHIPS);
  return (
    <span className="flex flex-wrap items-center gap-1">
      {mostrar.map((i) => (
        <span
          key={i.codigo}
          title={i.nome}
          className={cn("rounded-md border px-1.5 py-0.5 text-xs font-medium", i.regional ? "border-primary/30 bg-primary/5 text-primary" : "bg-muted/60 text-foreground")}
        >
          {i.codigo}
        </span>
      ))}
      {itens.length > MAX_CHIPS && (
        <span title={itens.slice(MAX_CHIPS).map((i) => i.codigo).join(", ")} className="text-xs text-muted-foreground">
          +{itens.length - MAX_CHIPS}
        </span>
      )}
    </span>
  );
}

export default async function UsersPage(props: PageProps<"/admin/usuarios">) {
  const me = await requirePermission("usuarios.ver");
  const t = await getT();
  const sp = await props.searchParams;
  const aba = sp.aba === "pendentes" ? "pendentes" : "usuarios";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const perfil = typeof sp.perfil === "string" ? sp.perfil : "";
  const status = sp.status === "ativos" || sp.status === "inativos" ? sp.status : "";
  const regional = typeof sp.regional === "string" ? sp.regional : "";
  const baseId = typeof sp.base === "string" ? sp.base : "";
  const acesso = sp.acesso === "recente" || sp.acesso === "parado" || sp.acesso === "nunca" ? sp.acesso : "";
  const page = pageParam(sp);

  const scope = usersScopeWhere(me);
  // Quem entrou pelo Feishu e espera liberação tem aba própria: não entra na lista de usuários.
  const pendente: Prisma.UserWhereInput = { active: true, profile: { key: "aguardando" } };
  const where: Prisma.UserWhereInput = {
    AND: [
      ...(scope ? [scope] : []),
      { NOT: pendente },
      ...(q
        ? [
            {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { login: { contains: q.toLowerCase() } },
                { email: { contains: q, mode: "insensitive" as const } },
                { registration: { contains: q } },
              ],
            },
          ]
        : []),
      ...(perfil ? [{ profileId: perfil }] : []),
      ...(status ? [{ active: status === "ativos" }] : []),
      // Regional: quem está vinculado a ela ou a alguma base dela.
      ...(regional ? [{ OR: [{ regionals: { some: { regionalId: regional } } }, { bases: { some: { base: { regionalId: regional } } } }] }] : []),
      ...(baseId ? [{ bases: { some: { baseId } } }] : []),
      ...(acesso === "nunca" ? [{ lastLoginAt: null }] : []),
      ...(acesso === "recente" ? [{ lastLoginAt: { gte: diasAtras(7) } }] : []),
      ...(acesso === "parado" ? [{ lastLoginAt: { lt: diasAtras(30) } }] : []),
    ],
  };
  const wherePendentes: Prisma.UserWhereInput = { AND: [...(scope ? [scope] : []), pendente] };
  const include = { profile: true, bases: { include: { base: true } }, regionals: { include: { regional: true } } } as const;

  const [users, total, profiles, nPendentes, pendentes, regionais, bases] = await Promise.all([
    aba === "usuarios"
      ? db.user.findMany({ where, include, orderBy: [{ active: "desc" }, { name: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE })
      : Promise.resolve([]),
    db.user.count({ where: { AND: [...(scope ? [scope] : []), { NOT: pendente }] } }),
    db.accessProfile.findMany({ where: { key: { not: "aguardando" } }, orderBy: { name: "asc" } }),
    db.user.count({ where: wherePendentes }),
    aba === "pendentes" ? db.user.findMany({ where: wherePendentes, include, orderBy: { createdAt: "asc" }, take: 100 }) : Promise.resolve([]),
    aba === "usuarios" ? db.regional.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }) : Promise.resolve([]),
    aba === "usuarios" ? db.base.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }) : Promise.resolve([]),
  ]);
  const filtrando = !!(q || perfil || status || regional || baseId || acesso);
  const totalFiltrado = aba === "usuarios" ? await db.user.count({ where }) : total;
  const podeEditar = can(me, "usuarios.editar");

  return (
    <>
      <AutoAtualizar segundos={15} />
      <PageHeader
        title={t("usuarios.titulo")}
        description={aba === "pendentes" ? t("usuarios.pendentes.descricao") : t("usuarios.total", { n: total })}
        actions={
          podeEditar && (
            <>
              <Button asChild variant="outline">
                <Link href="/admin/usuarios/importar">
                  <Upload /> {t("usuarios.importar")}
                </Link>
              </Button>
              <Button asChild>
                <Link href="/admin/usuarios/novo">
                  <Plus /> {t("usuarios.novo")}
                </Link>
              </Button>
            </>
          )
        }
      />
      <Abas
        label={t("usuarios.titulo")}
        items={[
          { href: "/admin/usuarios", label: t("usuarios.abas.usuarios"), icon: Users, count: total, ativa: aba === "usuarios" },
          { href: "/admin/usuarios?aba=pendentes", label: t("usuarios.abas.pendentes"), icon: UserCheck, count: nPendentes, tone: "alerta", ativa: aba === "pendentes" },
        ]}
      />

      {aba === "pendentes" ? (
        pendentes.length === 0 ? (
          <EmptyState>
            <span className="block font-medium text-foreground">{t("usuarios.pendentes.vazio")}</span>
            <span className="block">{t("usuarios.pendentes.vazioDica")}</span>
          </EmptyState>
        ) : (
          <Card className="py-0">
            <ul className="divide-y">
              {pendentes.map((u) => {
                const bases = u.bases.map((b) => ({ codigo: b.base.code, nome: `${b.base.code} · ${b.base.name}` }));
                return (
                  <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
                    <Avatar nome={u.name} tom="alerta" />
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="truncate font-medium">{u.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{[u.login, u.email].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="basis-48 text-sm">
                      <p className="text-xs text-muted-foreground">{t("usuarios.pendentes.baseFeishu")}</p>
                      <Siglas itens={bases} vazio={<span className="text-warning">{t("usuarios.pendentes.semBase")}</span>} />
                    </div>
                    <p className="basis-36 text-sm text-muted-foreground">
                      <span className="block text-xs">{t("usuarios.pendentes.entrouEm")}</span>
                      {fmtDateTime(u.createdAt, t.locale)}
                    </p>
                    {podeEditar && (
                      <div className="ml-auto flex items-center gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/admin/usuarios/${u.id}`}>
                            <ExternalLink /> {t("usuarios.cardAprovar.abrir")}
                          </Link>
                        </Button>
                        <AprovarButton
                          pessoa={{ id: u.id, name: u.name, login: u.login, email: u.email, bases: u.bases.map((b) => `${b.base.code} · ${b.base.name}`), criadoEm: fmtDateTime(u.createdAt, t.locale) }}
                          podeExcluir={can(me, "usuarios.excluir")}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )
      ) : (
        <>
          <FiltroForm className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-2.5 shadow-xs">
            <label className="relative min-w-60 flex-1">
              <span className="sr-only">{t("usuarios.buscar")}</span>
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                name="q"
                defaultValue={q}
                placeholder={t("usuarios.buscar")}
                autoComplete="off"
                className="h-10 rounded-xl border-transparent bg-muted pr-3 pl-10 text-sm focus-visible:bg-card"
              />
            </label>
            {/* Os seletores ficam numa grade, numa linha só abaixo da busca (order-last: o botão "Limpar filtros" fica ao lado da busca). */}
            <div className="order-last grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <SelectBox name="perfil" defaultValue={perfil} className="w-full">
              <option value="">{t("usuarios.todosTipos")}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {profileText(t, p).name}
                </option>
              ))}
              </SelectBox>
              <SelectBox name="regional" defaultValue={regional} className="w-full">
              <option value="">{t("usuarios.todasRegionais")}</option>
              {regionais.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.name}
                </option>
              ))}
              </SelectBox>
              <SelectBox name="base" defaultValue={baseId} searchable className="w-full">
              <option value="">{t("usuarios.todasBases")}</option>
              {bases.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.name}
                </option>
              ))}
              </SelectBox>
              <SelectBox name="status" defaultValue={status} className="w-full">
              <option value="">{t("usuarios.status.todos")}</option>
              <option value="ativos">{t("usuarios.status.ativos")}</option>
              <option value="inativos">{t("usuarios.status.inativos")}</option>
              </SelectBox>
              <SelectBox name="acesso" defaultValue={acesso} className="w-full">
              <option value="">{t("usuarios.acesso.todos")}</option>
              <option value="recente">{t("usuarios.acesso.recente")}</option>
              <option value="parado">{t("usuarios.acesso.parado")}</option>
              <option value="nunca">{t("usuarios.acesso.nunca")}</option>
              </SelectBox>
            </div>
          </FiltroForm>
          {filtrando && <p className="-mt-1 px-1 text-sm text-muted-foreground">{t("usuarios.resultados", { n: totalFiltrado, total })}</p>}
          {users.length === 0 ? (
            <EmptyState>{t("usuarios.vazio")}</EmptyState>
          ) : (
            <Card className="py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">{t("usuarios.colNome")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("usuarios.colLogin")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("usuarios.colTipo")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("usuarios.colBases")}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t("usuarios.colUltimoAcesso")}</TableHead>
                    <TableHead className="hidden pr-4 text-right sm:table-cell">{t("usuarios.colSituacao")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const siglas = [
                      ...u.regionals.map((r) => ({ codigo: r.regional.code, nome: r.regional.name, regional: true })),
                      ...u.bases.map((b) => ({ codigo: b.base.code, nome: b.base.name })),
                    ];
                    return (
                      <TableRow key={u.id} className={cn("group", !u.active && "bg-muted/20")}>
                        <TableCell className="py-3 pl-4">
                          <Link href={`/admin/usuarios/${u.id}`} className="flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-ring">
                            <span className={cn(!u.active && "opacity-50")}>
                              <Avatar nome={u.name} />
                            </span>
                            <span className="min-w-0">
                              <span className={cn("block truncate font-medium group-hover:underline", !u.active && "text-muted-foreground")}>{u.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">{u.email ?? u.login}</span>
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground sm:hidden">
                                {profileText(t, u.profile).name} · <span className={u.active ? "text-success" : ""}>{u.active ? t("usuarios.situacaoAtivo") : t("comum.inativo")}</span>
                              </span>
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">{u.login}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="secondary">{profileText(t, u.profile).name}</Badge>
                        </TableCell>
                        <TableCell className="hidden max-w-64 sm:table-cell">
                          <Siglas itens={siglas} />
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">
                          {u.lastLoginAt ? fmtDateTime(u.lastLoginAt, t.locale) : <span className="text-xs">{t("usuarios.nuncaEntrou")}</span>}
                        </TableCell>
                        <TableCell className="hidden pr-4 text-right sm:table-cell">
                          <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", u.active ? "text-success" : "text-muted-foreground")}>
                            <span aria-hidden className={cn("size-1.5 rounded-full", u.active ? "bg-success" : "bg-muted-foreground/50")} />
                            {u.active ? t("usuarios.situacaoAtivo") : t("comum.inativo")}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
          <Pagination page={page} total={totalFiltrado} pageSize={PAGE_SIZE} basePath="/admin/usuarios" params={{ q, perfil, status, regional, base: baseId, acesso }} />
        </>
      )}
    </>
  );
}
