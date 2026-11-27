"use client";

import { useKeepForm } from "@/components/use-keep-form";
import { Button } from "@/components/ui/button";
import { SelectBox } from "@/components/ui/combobox";
import { useServerMessage, useT } from "@/i18n/client";
import type { FormState } from "@/lib/action-result";
import { cancelarLiberacaoDiaAction, liberarDiaAction } from "./actions";

/** S23: escolher uma base própria e liberar para pedir hoje, fora de segunda e terça. */
export function LiberarDiaForm({ bases }: { bases: { id: string; code: string; name: string }[] }) {
  const t = useT();
  const tm = useServerMessage();
  const { state, pending, formProps } = useKeepForm<FormState>(liberarDiaAction, {});
  return (
    <form {...formProps} className="flex flex-wrap items-center gap-2">
      <div className="w-72 max-w-full">
        <SelectBox name="baseId" required defaultValue="" aria-label={t("ciclos.liberarDia.escolher")}>
          <option value="" disabled>
            {t("ciclos.liberarDia.escolher")}
          </option>
          {bases.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code} · {b.name}
            </option>
          ))}
        </SelectBox>
      </div>
      <Button type="submit" size="sm" disabled={pending || bases.length === 0}>
        {t("ciclos.liberarDia.botao")}
      </Button>
      {state.error && <span className="w-full text-xs text-destructive">{tm(state.error)}</span>}
    </form>
  );
}

/** Tira a liberação de hoje de uma base. */
export function CancelarLiberacaoForm({ id }: { id: string }) {
  const t = useT();
  const tm = useServerMessage();
  const { state, pending, formProps } = useKeepForm<FormState>(cancelarLiberacaoDiaAction, {});
  return (
    <form {...formProps} className="flex items-center justify-end gap-2">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {t("ciclos.liberarDia.cancelar")}
      </Button>
      {state.error && <span className="text-xs text-destructive">{tm(state.error)}</span>}
    </form>
  );
}
