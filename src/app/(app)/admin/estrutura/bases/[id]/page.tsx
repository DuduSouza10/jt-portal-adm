import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/action-form";
import { CheckField, Field, selectClass } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { getT } from "@/i18n/server";
import { saveBaseAction } from "../../actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("estrutura.base") };
}

export default async function BaseEditPage(props: PageProps<"/admin/estrutura/bases/[id]">) {
  await requirePermission("estrutura.editar");
  const t = await getT();
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
        title={isNew ? t("estrutura.novaBase") : `${base!.code} · ${base!.name}`}
        back={{ href: "/admin/estrutura", label: t("estrutura.titulo") }}
      />
      <Card>
        <CardContent>
          <ActionForm action={saveBaseAction.bind(null, base?.id ?? null)}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("estrutura.sigla")} htmlFor="code" hint={t("estrutura.siglaDicaBase")}>
                <Input id="code" name="code" defaultValue={base?.code} required className="uppercase" />
              </Field>
              <Field label={t("estrutura.nome")} htmlFor="name" className="sm:col-span-2">
                <Input id="name" name="name" defaultValue={base?.name} required />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("estrutura.tipo")} htmlFor="type">
                <select id="type" name="type" defaultValue={base?.type ?? "BASE"} className={selectClass}>
                  {(["BASE", "FRANQUIA", "ALMOXARIFADO"] as const).map((k) => (
                    <option key={k} value={k}>
                      {t(`tiposBase.${k}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("estrutura.regional")} htmlFor="regionalId">
                <select id="regionalId" name="regionalId" defaultValue={base?.regionalId ?? ""} required className={selectClass}>
                  <option value="" disabled>
                    {t("comum.escolha")}
                  </option>
                  {regionals.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} · {r.name}
                      {!r.active && ` (${t("comum.inativa")})`}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("estrutura.cnpj")} htmlFor="cnpj">
                <Input id="cnpj" name="cnpj" defaultValue={base?.cnpj ?? ""} />
              </Field>
              <Field label={t("estrutura.cidade")} htmlFor="city">
                <Input id="city" name="city" defaultValue={base?.city ?? ""} />
              </Field>
              <Field label={t("estrutura.uf")} htmlFor="state">
                <Input id="state" name="state" defaultValue={base?.state ?? ""} maxLength={2} className="uppercase" />
              </Field>
            </div>
            <Field label={t("estrutura.endereco")} htmlFor="address">
              <Input id="address" name="address" defaultValue={base?.address ?? ""} />
            </Field>
            <CheckField name="active" label={t("estrutura.baseAtiva")} defaultChecked={base?.active ?? true} />
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
