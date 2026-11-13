import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { isSubsetOf, scopeWithin } from "@/modules/acessos/rules";
import { usersScopeWhere } from "@/modules/acessos/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/action-form";
import { CheckField, Field, selectClass } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { getT } from "@/i18n/server";
import { profileText } from "@/i18n/labels";
import { resetPasswordAction, saveUserAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("usuarios.tituloUm") };
}

export default async function UserEditPage(props: PageProps<"/admin/usuarios/[id]">) {
  const me = await requirePermission("usuarios.ver");
  const t = await getT();
  const { id } = await props.params;
  const isNew = id === "novo";
  if (isNew && !can(me, "usuarios.editar")) notFound();

  const [user, profiles, regionals] = await Promise.all([
    // Fora do alcance do ator = "não encontrado" (E6).
    isNew ? null : db.user.findFirst({ where: { id, ...usersScopeWhere(me) }, include: { bases: true, regionals: true, profile: true } }),
    db.accessProfile.findMany({ orderBy: { name: "asc" } }),
    // Só oferece regionais/bases do alcance do ator.
    db.regional.findMany({
      where: { active: true, ...(me.scope !== "GLOBAL" && { OR: [{ id: { in: [...me.regionalIds] } }, { bases: { some: { id: { in: [...me.baseIds] } } } }] }) },
      orderBy: { code: "asc" },
      include: {
        bases: {
          where: { active: true, ...(me.scope === "BASE" && { id: { in: [...me.baseIds] } }) },
          orderBy: { code: "asc" },
        },
      },
    }),
  ]);
  if (!isNew && !user) notFound();

  // Só pode editar quem tem permissão E não está mexendo em alguém "acima" dele.
  const editable =
    can(me, "usuarios.editar") &&
    (!user || (isSubsetOf(user.profile.permissions, me.permissions) && scopeWithin(user.profile.scope, me.scope)));
  // Só oferece perfis que o usuário logado pode conceder.
  const grantable = profiles.filter(
    (p) => (isSubsetOf(p.permissions, me.permissions) && scopeWithin(p.scope, me.scope)) || p.id === user?.profileId,
  );
  const userBases = new Set(user?.bases.map((b) => b.baseId));
  const userRegionals = new Set(user?.regionals.map((r) => r.regionalId));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={isNew ? t("usuarios.novo") : user!.name} back={{ href: "/admin/usuarios", label: t("usuarios.titulo") }} />
      <Card>
        <CardContent>
          <fieldset disabled={!editable} className="contents">
            <ActionForm action={saveUserAction.bind(null, user?.id ?? null)}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("usuarios.nome")} htmlFor="name">
                  <Input id="name" name="name" defaultValue={user?.name} required />
                </Field>
                <Field label={t("usuarios.login")} htmlFor="login" hint={t("usuarios.loginDica")}>
                  <Input id="login" name="login" defaultValue={user?.login} required autoCapitalize="none" />
                </Field>
                <Field label={t("usuarios.email")} htmlFor="email" hint={t("usuarios.emailDica")}>
                  <Input id="email" name="email" type="email" defaultValue={user?.email ?? ""} />
                </Field>
                <Field label={t("usuarios.telefone")} htmlFor="phone">
                  <Input id="phone" name="phone" defaultValue={user?.phone ?? ""} />
                </Field>
                <Field label={t("usuarios.matricula")} htmlFor="registration" hint={t("usuarios.matriculaDica")}>
                  <Input id="registration" name="registration" defaultValue={user?.registration ?? ""} />
                </Field>
                <Field label={t("usuarios.feishuOpenId")} htmlFor="feishuOpenId" hint={t("usuarios.feishuOpenIdDica")}>
                  <Input id="feishuOpenId" name="feishuOpenId" defaultValue={user?.feishuOpenId ?? ""} autoCapitalize="none" />
                </Field>
              </div>
              <Field label={t("usuarios.tipo")} htmlFor="profileId">
                <select id="profileId" name="profileId" defaultValue={user?.profileId ?? ""} required className={selectClass}>
                  <option value="" disabled>
                    {t("comum.escolha")}
                  </option>
                  {grantable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {profileText(t, p).name} ({t(`alcanceUsuario.${p.scope}`)})
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={t("usuarios.regionaisBases")}
                hint={t("usuarios.regionaisBasesDica")}
              >
                <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border bg-muted/30 p-3">
                  {regionals.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t("usuarios.nenhumaRegional")}</p>
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
                label={t("usuarios.ativo")}
                defaultChecked={user?.active ?? true}
              />
              {isNew && (
                <p className="text-sm text-muted-foreground">{t("usuarios.senhaTemporaria")}</p>
              )}
            </ActionForm>
          </fieldset>
        </CardContent>
      </Card>

      {!isNew && editable && (
        <Card>
          <CardHeader>
            <CardTitle>{t("usuarios.resetTitulo")}</CardTitle>
            <CardDescription>{t("usuarios.resetDescricao")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={resetPasswordAction.bind(null, user!.id)}
              submitLabel={t("usuarios.resetBotao")}
              variant="outline"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
