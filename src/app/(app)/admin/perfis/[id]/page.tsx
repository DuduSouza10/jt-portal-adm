import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { ALL, PERMISSION_GROUPS } from "@/lib/permissions/catalog";
import { can } from "@/lib/permissions/check";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/action-form";
import { Field, selectClass } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { saveProfileAction } from "../actions";
import { getT } from "@/i18n/server";
import { permissionGroupText, permissionText, profileText } from "@/i18n/labels";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("perfis.tituloUm") };
}

export default async function ProfileEditPage(props: PageProps<"/admin/perfis/[id]">) {
  const me = await requirePermission("perfis.gerenciar");
  const t = await getT();
  const { id } = await props.params;
  const isNew = id === "novo";
  const profile = isNew ? null : await db.accessProfile.findUnique({ where: { id } });
  if (!isNew && !profile) notFound();

  const isWildcard = profile?.permissions.includes(ALL) ?? false;
  const has = new Set(profile?.permissions);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={isNew ? t("perfis.novo") : profileText(t, profile!).name}
        back={{ href: "/admin/perfis", label: t("perfis.titulo") }}
      />
      <Card>
        <CardContent>
          <ActionForm action={saveProfileAction.bind(null, profile?.id ?? null)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("perfis.nome")} htmlFor="name">
                <Input id="name" name="name" defaultValue={profile?.name} required />
              </Field>
              <Field label={t("perfis.chave")} htmlFor="key" hint={profile?.system ? t("perfis.chaveSistema") : t("perfis.chaveExemplo")}>
                <Input id="key" name="key" defaultValue={profile?.key} required readOnly={profile?.system} />
              </Field>
            </div>
            <Field label={t("perfis.descricaoCampo")} htmlFor="description">
              <Input id="description" name="description" defaultValue={profile?.description ?? ""} />
            </Field>
            <Field label={t("perfis.alcance")} htmlFor="scope" hint={t("perfis.alcanceDica")}>
              <select id="scope" name="scope" defaultValue={profile?.scope ?? "BASE"} className={selectClass}>
                {(["GLOBAL", "REGIONAL", "BASE"] as const).map((k) => (
                  <option key={k} value={k}>
                    {t(`alcance.${k}`)}
                  </option>
                ))}
              </select>
            </Field>

            {isWildcard ? (
              <>
                <input type="hidden" name="permissions" value={ALL} />
                <Alert>
                  <AlertDescription>{t("perfis.curinga")}</AlertDescription>
                </Alert>
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-sm font-medium">{t("perfis.permissoes")}</p>
                {PERMISSION_GROUPS.map((g) => (
                  <fieldset key={g.module} className="rounded-lg border p-3">
                    <legend className="px-1 text-sm font-semibold">{permissionGroupText(t, g)}</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {g.permissions.map((p) => {
                        // Só aparece habilitado o que o usuário logado pode conceder.
                        const grantable = can(me, p.key);
                        const text = permissionText(t, p);
                        return (
                          <label
                            key={p.key}
                            className={`flex items-start gap-2 text-sm ${grantable ? "" : "opacity-50"}`}
                            title={grantable ? undefined : t("perfis.semPermissao")}
                          >
                            <input
                              type="checkbox"
                              name="permissions"
                              value={p.key}
                              defaultChecked={has.has(p.key)}
                              disabled={!grantable}
                              className="mt-0.5 size-4"
                            />
                            <span>
                              {text.label}
                              {text.description && <span className="block text-xs text-muted-foreground">{text.description}</span>}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            )}
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
