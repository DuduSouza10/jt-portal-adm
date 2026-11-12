import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/action-form";
import { CheckField, Field } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { saveRegionalAction } from "../../actions";

export const metadata: Metadata = { title: "Regional" };

export default async function RegionalEditPage(props: PageProps<"/admin/estrutura/regionais/[id]">) {
  await requirePermission("estrutura.editar");
  const { id } = await props.params;
  const isNew = id === "novo";
  const regional = isNew ? null : await db.regional.findUnique({ where: { id } });
  if (!isNew && !regional) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader
        title={isNew ? "Nova regional" : `${regional!.code} · ${regional!.name}`}
        back={{ href: "/admin/estrutura", label: "Regionais e bases" }}
      />
      <Card>
        <CardContent>
          <ActionForm action={saveRegionalAction.bind(null, regional?.id ?? null)}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Sigla" htmlFor="code" hint="Ex.: MG, SPN">
                <Input id="code" name="code" defaultValue={regional?.code} required className="uppercase" />
              </Field>
              <Field label="Nome" htmlFor="name" className="sm:col-span-2">
                <Input id="name" name="name" defaultValue={regional?.name} required />
              </Field>
            </div>
            <CheckField name="active" label="Regional ativa" defaultChecked={regional?.active ?? true} />
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
