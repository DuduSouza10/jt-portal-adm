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
import { SCOPE_LABEL } from "../scope";

export const metadata: Metadata = { title: "Tipo de acesso" };

export default async function ProfileEditPage(props: PageProps<"/admin/perfis/[id]">) {
  const me = await requirePermission("perfis.gerenciar");
  const { id } = await props.params;
  const isNew = id === "novo";
  const profile = isNew ? null : await db.accessProfile.findUnique({ where: { id } });
  if (!isNew && !profile) notFound();

  const isWildcard = profile?.permissions.includes(ALL) ?? false;
  const has = new Set(profile?.permissions);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={isNew ? "Novo tipo de acesso" : profile!.name}
        back={{ href: "/admin/perfis", label: "Tipos de acesso" }}
      />
      <Card>
        <CardContent>
          <ActionForm action={saveProfileAction.bind(null, profile?.id ?? null)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome" htmlFor="name">
                <Input id="name" name="name" defaultValue={profile?.name} required />
              </Field>
              <Field label="Chave" htmlFor="key" hint={profile?.system ? "Perfil padrão: a chave não muda." : "Ex.: gestao-franquias"}>
                <Input id="key" name="key" defaultValue={profile?.key} required readOnly={profile?.system} />
              </Field>
            </div>
            <Field label="Descrição (opcional)" htmlFor="description">
              <Input id="description" name="description" defaultValue={profile?.description ?? ""} />
            </Field>
            <Field label="Alcance dos dados" htmlFor="scope" hint="Quais bases o usuário enxerga nas listas e relatórios.">
              <select id="scope" name="scope" defaultValue={profile?.scope ?? "BASE"} className={selectClass}>
                {Object.entries(SCOPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>

            {isWildcard ? (
              <>
                <input type="hidden" name="permissions" value={ALL} />
                <Alert>
                  <AlertDescription>Este perfil tem todas as permissões (curinga), inclusive as de módulos futuros.</AlertDescription>
                </Alert>
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-sm font-medium">Permissões</p>
                {PERMISSION_GROUPS.map((g) => (
                  <fieldset key={g.module} className="rounded-md border p-3">
                    <legend className="px-1 text-sm font-semibold">{g.label}</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {g.permissions.map((p) => {
                        // Só aparece habilitado o que o usuário logado pode conceder.
                        const grantable = can(me, p.key);
                        return (
                          <label
                            key={p.key}
                            className={`flex items-start gap-2 text-sm ${grantable ? "" : "opacity-50"}`}
                            title={grantable ? undefined : "Você não tem esta permissão, então não pode concedê-la."}
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
                              {p.label}
                              {"description" in p && (
                                <span className="block text-xs text-muted-foreground">{p.description}</span>
                              )}
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
