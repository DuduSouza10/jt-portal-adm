import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { isSubsetOf } from "@/modules/acessos/rules";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/action-form";
import { CheckField, Field, selectClass } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { resetPasswordAction, saveUserAction } from "../actions";

export const metadata: Metadata = { title: "Usuário" };

const SCOPE_HINT = {
  GLOBAL: "vê todas as bases",
  REGIONAL: "vê as bases das regionais marcadas",
  BASE: "vê só as bases marcadas",
} as const;

export default async function UserEditPage(props: PageProps<"/admin/usuarios/[id]">) {
  const me = await requirePermission("usuarios.ver");
  const { id } = await props.params;
  const isNew = id === "novo";
  if (isNew && !can(me, "usuarios.editar")) notFound();

  const [user, profiles, regionals] = await Promise.all([
    isNew ? null : db.user.findUnique({ where: { id }, include: { bases: true, regionals: true, profile: true } }),
    db.accessProfile.findMany({ orderBy: { name: "asc" } }),
    db.regional.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
      include: { bases: { where: { active: true }, orderBy: { code: "asc" } } },
    }),
  ]);
  if (!isNew && !user) notFound();

  // Só pode editar quem tem permissão E não está mexendo em alguém "acima" dele.
  const editable = can(me, "usuarios.editar") && (!user || isSubsetOf(user.profile.permissions, me.permissions));
  // Só oferece perfis que o usuário logado pode conceder.
  const grantable = profiles.filter((p) => isSubsetOf(p.permissions, me.permissions) || p.id === user?.profileId);
  const userBases = new Set(user?.bases.map((b) => b.baseId));
  const userRegionals = new Set(user?.regionals.map((r) => r.regionalId));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={isNew ? "Novo usuário" : user!.name} back={{ href: "/admin/usuarios", label: "Usuários" }} />
      <Card>
        <CardContent>
          <fieldset disabled={!editable} className="contents">
            <ActionForm action={saveUserAction.bind(null, user?.id ?? null)}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome" htmlFor="name">
                  <Input id="name" name="name" defaultValue={user?.name} required />
                </Field>
                <Field label="Usuário (login)" htmlFor="login" hint="Ex.: joao.silva (sem espaços)">
                  <Input id="login" name="login" defaultValue={user?.login} required autoCapitalize="none" />
                </Field>
                <Field label="E-mail (opcional)" htmlFor="email" hint="Também serve para entrar.">
                  <Input id="email" name="email" type="email" defaultValue={user?.email ?? ""} />
                </Field>
                <Field label="Telefone (opcional)" htmlFor="phone">
                  <Input id="phone" name="phone" defaultValue={user?.phone ?? ""} />
                </Field>
              </div>
              <Field label="Tipo de acesso" htmlFor="profileId">
                <select id="profileId" name="profileId" defaultValue={user?.profileId ?? ""} required className={selectClass}>
                  <option value="" disabled>
                    Escolha…
                  </option>
                  {grantable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({SCOPE_HINT[p.scope]})
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Regionais e bases"
                hint="Marque a regional para dar acesso a todas as bases dela (perfis regionais), ou bases avulsas."
              >
                <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border p-3">
                  {regionals.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma regional cadastrada ainda.</p>
                  )}
                  {regionals.map((r) => (
                    <div key={r.id} className="space-y-1">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          name="regionalIds"
                          value={r.id}
                          defaultChecked={userRegionals.has(r.id)}
                          className="size-4"
                        />
                        {r.code} · {r.name}
                      </label>
                      <div className="grid grid-cols-2 gap-1 pl-6 sm:grid-cols-3">
                        {r.bases.map((b) => (
                          <label key={b.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              name="baseIds"
                              value={b.id}
                              defaultChecked={userBases.has(b.id)}
                              className="size-4"
                            />
                            {b.code} <span className="truncate text-muted-foreground">{b.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Field>
              <CheckField
                name="active"
                label="Usuário ativo (desativar encerra as sessões; o histórico é mantido)"
                defaultChecked={user?.active ?? true}
              />
              {isNew && (
                <p className="text-sm text-muted-foreground">
                  Uma senha temporária será gerada e exibida após salvar. No primeiro acesso, a pessoa terá que trocá-la.
                </p>
              )}
            </ActionForm>
          </fieldset>
        </CardContent>
      </Card>

      {!isNew && editable && (
        <Card>
          <CardHeader>
            <CardTitle>Redefinir senha</CardTitle>
            <CardDescription>Gera uma senha temporária e encerra as sessões abertas do usuário.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={resetPasswordAction.bind(null, user!.id)}
              submitLabel="Gerar senha temporária"
              variant="outline"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
