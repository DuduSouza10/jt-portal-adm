"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { definirMinimoAction } from "./actions";

/** Campo pequeno, na própria linha da tabela, para ajustar o estoque mínimo. */
export function MinimoForm({ baseId, produtoId, minimum }: { baseId: string; produtoId: string; minimum: number }) {
  const [state, action, pending] = useActionState(definirMinimoAction, {});
  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.ok) toast.success("Mínimo atualizado.");
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
        aria-label="Estoque mínimo"
        className="h-8 w-20 rounded-md border bg-background px-2 text-right text-sm tabular-nums"
        onBlur={(e) => {
          if (Number(e.currentTarget.value) !== minimum) e.currentTarget.form?.requestSubmit();
        }}
      />
    </form>
  );
}
