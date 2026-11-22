"use client";

import { FileSpreadsheet } from "lucide-react";
import { useKeepForm } from "@/components/use-keep-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerMessage, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { importarPrecosAction } from "./actions";

/** Atualizar vários preços de uma vez por planilha (código; preço). */
export function PlanilhaPrecosForm() {
  const t = useT();
  const tm = useServerMessage();
  const { state, pending, formProps } = useKeepForm(importarPrecosAction, {});
  return (
    <form {...formProps} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="file" name="arquivo" accept=".csv,text/csv" required className="h-9 w-auto max-w-full" aria-label={t("precificacao.planilhaArquivo")} />
        <Button type="submit" variant="outline" disabled={pending}>
          <FileSpreadsheet /> {pending ? t("precificacao.planilhaEnviando") : t("precificacao.planilhaBotao")}
        </Button>
      </div>
      {(state.error || state.message) && (
        <p role="status" className={cn("text-sm", state.error ? "text-destructive" : "text-success")}>
          {tm(state.error ?? state.message ?? "")}
        </p>
      )}
    </form>
  );
}
