import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { BASE_TYPE_LABEL } from "@/modules/estrutura/schemas";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/action-form";
import { CheckField, Field, selectClass } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { saveBaseAction } from "../../actions";

export const metadata: Metadata = { title: "Base" };

export default async function BaseEditPage(props: PageProps<"/admin/estrutura/bases/[id]">) {
  await requirePermission("estrutura.editar");
  const { id } = await props.params;
  const isNew = id === "novo";
  const [base, regionals] = await Promise.all([
    isNew ? null : db.base.findUnique({ where: { id } }),
    db.regional.findMany({ orderBy: { code: "asc" } }),
  ]);
  if (!isNew && !base) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={isNew ? "Nova base" : `${base!.code} · ${base!.name}`}
        back={{ href: "/admin/estrutura", label: "Regionais e bases" }}
      />
      <Card>
        <CardContent>
          <ActionForm action={saveBaseAction.bind(null, base?.id ?? null)}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Sigla" htmlFor="code" hint="Ex.: BHZ01">
                <Input id="code" name="code" defaultValue={base?.code} required className="uppercase" />
              </Field>
              <Field label="Nome" htmlFor="name" className="sm:col-span-2">
                <Input id="name" name="name" defaultValue={base?.name} required />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo" htmlFor="type">
                <select id="type" name="type" defaultValue={base?.type ?? "BASE"} className={selectClass}>
                  {Object.entries(BASE_TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Regional" htmlFor="regionalId">
                <select id="regionalId" name="regionalId" defaultValue={base?.regionalId ?? ""} required className={selectClass}>
                  <option value="" disabled>
                    Escolha…
                  </option>
                  {regionals.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} · {r.name}
                      {!r.active && " (inativa)"}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="CNPJ (opcional)" htmlFor="cnpj">
                <Input id="cnpj" name="cnpj" defaultValue={base?.cnpj ?? ""} />
              </Field>
              <Field label="Cidade" htmlFor="city">
                <Input id="city" name="city" defaultValue={base?.city ?? ""} />
              </Field>
              <Field label="UF" htmlFor="state">
                <Input id="state" name="state" defaultValue={base?.state ?? ""} maxLength={2} className="uppercase" />
              </Field>
            </div>
            <Field label="Endereço (opcional)" htmlFor="address">
              <Input id="address" name="address" defaultValue={base?.address ?? ""} />
            </Field>
            <CheckField name="active" label="Base ativa" defaultChecked={base?.active ?? true} />
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
