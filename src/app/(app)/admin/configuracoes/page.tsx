import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { getPedidoSettings, getSlaSettings, type SlaStageKey } from "@/lib/settings";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { salvarPedidosAction, salvarSlaAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("configuracoes.titulo") };
}

const STAGES: SlaStageKey[] = ["aprovacao", "separacao", "expedicao"];
const DAYS = [1, 2, 3, 4, 5, 6, 0];

export default async function ConfiguracoesPage() {
  await requirePermission("configuracoes.editar");
  const t = await getT();
  const [s, ped] = await Promise.all([getSlaSettings(), getPedidoSettings()]);
  const br = (d: string) => d.split("-").reverse().join("/");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={t("configuracoes.titulo")} description={t("configuracoes.descricao")} />
      <Card>
        <CardContent>
          <ActionForm action={salvarSlaAction} submitLabel={t("comum.salvar")} className="space-y-6">
            <section className="space-y-3">
              <div>
                <h2 className="font-semibold">{t("configuracoes.prazos")}</h2>
                <p className="text-sm text-muted-foreground">{t("configuracoes.prazosAjuda")}</p>
              </div>
              <div className="divide-y rounded-lg border">
                <div className="grid grid-cols-[1fr_7rem_7rem] gap-3 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>{t("configuracoes.etapa")}</span>
                  <span>{t("configuracoes.normal")}</span>
                  <span>{t("configuracoes.urgente")}</span>
                </div>
                {STAGES.map((k) => (
                  <div key={k} className="grid grid-cols-[1fr_7rem_7rem] items-center gap-3 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{t(`relatorios.etapa.${k}`)}</p>
                      <p className="text-xs text-muted-foreground">{t(`relatorios.etapaAjuda.${k}`)}</p>
                    </div>
                    <Input name={`${k}.normal`} inputMode="decimal" defaultValue={String(s.targets[k].normal).replace(".", ",")} aria-label={`${t(`relatorios.etapa.${k}`)} · ${t("configuracoes.normal")}`} />
                    <Input name={`${k}.urgente`} inputMode="decimal" defaultValue={String(s.targets[k].urgente).replace(".", ",")} aria-label={`${t(`relatorios.etapa.${k}`)} · ${t("configuracoes.urgente")}`} />
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="font-semibold">{t("configuracoes.horario")}</h2>
                <p className="text-sm text-muted-foreground">{t("configuracoes.horarioAjuda")}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("configuracoes.inicio")} htmlFor="start">
                  <Input id="start" name="start" type="time" defaultValue={s.businessHours.start} required />
                </Field>
                <Field label={t("configuracoes.fim")} htmlFor="end">
                  <Input id="end" name="end" type="time" defaultValue={s.businessHours.end} required />
                </Field>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t("configuracoes.dias")}</legend>
                <div className="flex flex-wrap gap-3">
                  {DAYS.map((d) => (
                    <label key={d} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="days" value={d} defaultChecked={s.businessHours.days.includes(d)} className="size-4" />
                      {t(`configuracoes.dia.${d}` as "configuracoes.dia.0")}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label={t("configuracoes.feriados")} htmlFor="holidays" hint={t("configuracoes.feriadosAjuda")}>
                <Textarea id="holidays" name="holidays" rows={4} defaultValue={s.businessHours.holidays.map(br).join("\n")} placeholder="25/12/2026" />
              </Field>
            </section>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <ActionForm action={salvarPedidosAction} submitLabel={t("comum.salvar")} className="space-y-4">
            <div>
              <h2 className="font-semibold">{t("configuracoes.pedidos")}</h2>
              <p className="text-sm text-muted-foreground">{t("configuracoes.pedidosAjuda")}</p>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="cicloAtivo" defaultChecked={ped.cicloAtivo} className="size-4" />
              {t("configuracoes.cicloAtivo")}
            </label>
            <Field label={t("configuracoes.cicloMeses")} htmlFor="cicloMeses" hint={t("configuracoes.cicloMesesAjuda")}>
              <Input id="cicloMeses" name="cicloMeses" type="number" min={1} max={24} defaultValue={ped.cicloMeses} className="max-w-32" />
            </Field>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("configuracoes.comoConta")}</CardTitle>
          <CardDescription>{t("configuracoes.comoContaAjuda")}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
