"use client";

import { useKeepForm } from "@/components/use-keep-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerMessage, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { salvarPrecoAction } from "./actions";

/** Uma linha da precificação: preço novo (R$), motivo opcional e salvar. */
export function PrecoForm({ produtoId, valor, nome }: { produtoId: string; valor: number | null; nome: string }) {
  const t = useT();
  const tm = useServerMessage();
  const { state, pending, formProps } = useKeepForm(salvarPrecoAction.bind(null, produtoId), {});
  const inicial = valor == null ? "" : valor.toFixed(2).replace(".", ",");
  return (
    <form {...formProps} className="flex flex-wrap items-center justify-end gap-2">
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
        <Input name="valor" defaultValue={inicial} inputMode="decimal" autoComplete="off" aria-label={t("precificacao.novoPrecoDe", { nome })} className="h-8 w-28 pl-8 text-right tabular-nums" />
      </div>
      <Input name="motivo" placeholder={t("precificacao.motivo")} aria-label={t("precificacao.motivo")} maxLength={200} className="hidden h-8 w-44 xl:block" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? t("comum.salvando") : t("comum.salvar")}
      </Button>
      {(state.error || state.message) && (
        <span role="status" className={cn("w-full text-right text-xs", state.error ? "text-destructive" : "text-success")}>
          {tm(state.error ?? state.message ?? "")}
        </span>
      )}
    </form>
  );
}
