"use client";

import { Check } from "lucide-react";
import { useKeepForm } from "@/components/use-keep-form";
import { Button } from "@/components/ui/button";
import { useServerMessage, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { aprovarAcessoAction } from "./actions";

/** Botão "Aprovar" de quem está aguardando liberação (vira Base/Franquia na base já vinculada). */
export function AprovarButton({ userId }: { userId: string }) {
  const t = useT();
  const tm = useServerMessage();
  const { state, pending, formProps } = useKeepForm(aprovarAcessoAction.bind(null, userId), {});
  return (
    <form {...formProps} className="flex flex-col items-end gap-1">
      <Button type="submit" size="sm" disabled={pending}>
        <Check /> {pending ? t("comum.salvando") : t("usuarios.aprovar")}
      </Button>
      {state.error && <span className={cn("max-w-56 text-right text-xs text-destructive")}>{tm(state.error)}</span>}
    </form>
  );
}
