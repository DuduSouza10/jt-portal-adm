import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/action-form";
import { CheckField, Field } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { getT } from "@/i18n/server";
import { UNIDADES_COMUNS } from "@/modules/produtos/schemas";
import { saveProdutoAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("produtos.titulo") };
}

export default async function ProdutoEditPage(props: PageProps<"/produtos/[id]">) {
  await requirePermission("produtos.editar");
  const t = await getT();
  const { id } = await props.params;
  const isNew = id === "novo";
  const produto = isNew ? null : await db.produto.findUnique({ where: { id } });
  if (!isNew && !produto) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={isNew ? t("produtos.novoTitulo") : `${produto!.code} · ${produto!.name}`}
        back={{ href: "/produtos", label: t("produtos.titulo") }}
      />
      <Card>
        <CardContent>
          <ActionForm action={saveProdutoAction.bind(null, produto?.id ?? null)}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("produtos.codigo")} htmlFor="code" hint={isNew ? t("produtos.codigoDica") : t("produtos.codigoFixo")}>
                <Input id="code" name="code" defaultValue={produto?.code} required readOnly={!isNew} className="font-mono uppercase" />
              </Field>
              <Field label={t("produtos.nome")} htmlFor="name" className="sm:col-span-2">
                <Input id="name" name="name" defaultValue={produto?.name} required maxLength={200} />
              </Field>
              <Field label={t("produtos.unidade")} htmlFor="unit" hint={t("produtos.unidadeDica")}>
                <Input id="unit" name="unit" defaultValue={produto?.unit ?? "un"} required maxLength={10} list="unidades" />
                <datalist id="unidades">
                  {UNIDADES_COMUNS.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </Field>
            </div>
            <div className="space-y-3 rounded-lg border p-4">
              <div>
                <h2 className="text-sm font-semibold">{t("produtos.limitesTitulo")}</h2>
                <p className="text-xs text-muted-foreground">{t("produtos.limitesDescricao")}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={t("produtos.limiteBase")} htmlFor="limitBase">
                  <Input id="limitBase" name="limitBase" inputMode="numeric" defaultValue={produto?.limitBase ?? ""} placeholder={t("produtos.semLimite")} />
                </Field>
                <Field label={t("produtos.limiteFranquia")} htmlFor="limitFranquia">
                  <Input id="limitFranquia" name="limitFranquia" inputMode="numeric" defaultValue={produto?.limitFranquia ?? ""} placeholder={t("produtos.semLimite")} />
                </Field>
                <Field label={t("produtos.diasBloqueio")} htmlFor="limitBlockDays" hint={t("produtos.diasDica")}>
                  <Input id="limitBlockDays" name="limitBlockDays" inputMode="numeric" defaultValue={produto?.limitBlockDays ?? 60} />
                </Field>
              </div>
            </div>
            <CheckField name="active" label={t("produtos.ativo")} defaultChecked={produto?.active ?? true} />
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
