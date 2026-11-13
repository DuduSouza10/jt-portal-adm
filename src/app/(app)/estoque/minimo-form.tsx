"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useServerMessage, useT } from "@/i18n/client";
import { definirMinimoAction } from "./actions";

/** Campo pequeno, na própria linha da tabela, para ajustar o estoque mínimo. */
export function MinimoForm({ baseId, produtoId, minimum }: { baseId: string; produtoId: string; minimum: number }) {
  const t = useT();
  const tm = useServerMessage();
  const [state, action, pending] = useActionState(definirMinimoAction, {});
  const ok = t("estoque.minimoAtualizado");
  useEffect(() => {
    if (state.error) toast.error(tm(state.error));
    else if (state.ok) toast.success(ok);
    // Só reage a um novo resultado da action, não à troca de idioma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name="baseId" value={baseId} />
      <input type="hidden" name="produtoId" value={produtoId} />
      <input
        name="minimum"
        type="number"
        min={0}
        defaultValue={minimum}
        disabled={pending}
        aria-label={t("estoque.minimoAria")}
        className="h-8 w-20 rounded-md border border-input bg-card px-2 text-right text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        onBlur={(e) => {
          if (Number(e.currentTarget.value) !== minimum) e.currentTarget.form?.requestSubmit();
        }}
      />
    </form>
  );
}
