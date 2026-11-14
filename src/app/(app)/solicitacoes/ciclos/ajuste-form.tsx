"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerMessage, useT } from "@/i18n/client";
import type { FormState } from "@/lib/action-result";
import { ajustarCicloAction } from "./actions";

/** Liberar agora ou mudar a data final de um ciclo/bloqueio. */
export function AjusteForm({ tipo, id, ate }: { tipo: "ciclo" | "bloqueio"; id: string; ate: string }) {
  const t = useT();
  const tm = useServerMessage();
  const [state, action, pending] = useActionState<FormState, FormData>(ajustarCicloAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="id" value={id} />
      <Input type="date" name="ate" defaultValue={ate} className="w-40" aria-label={t("ciclos.novaData")} />
      <Button type="submit" name="acao" value="data" variant="outline" size="sm" disabled={pending}>
        {t("ciclos.mudarData")}
      </Button>
      <Button type="submit" name="acao" value="liberar" size="sm" disabled={pending}>
        {t("ciclos.liberar")}
      </Button>
      {state.error && <span className="w-full text-right text-xs text-destructive">{tm(state.error)}</span>}
    </form>
  );
}
