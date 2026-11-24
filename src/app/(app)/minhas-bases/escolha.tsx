"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useKeepForm } from "@/components/use-keep-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerMessage, useT } from "@/i18n/client";
import { salvarMinhasBasesAction } from "./actions";

type Regional = { id: string; code: string; name: string; bases: { id: string; code: string; name: string; type: string }[] };

/** Lista de bases e franquias por regional, com busca; o que estiver marcado vira "minhas bases". */
export function EscolhaBases({ regionais, marcadas }: { regionais: Regional[]; marcadas: string[] }) {
  const t = useT();
  const tm = useServerMessage();
  const [sel, setSel] = useState(new Set(marcadas));
  const [busca, setBusca] = useState("");
  const { state, pending, formProps } = useKeepForm(salvarMinhasBasesAction, {});
  const q = busca.trim().toLowerCase();
  const toggle = (id: string) => setSel((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))));

  return (
    <form {...formProps} className="space-y-4">
      {[...sel].map((id) => (
        <input key={id} type="hidden" name="baseIds" value={id} />
      ))}
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t("minhasBases.busca")} className="pl-8" />
        </div>
        <span className="text-sm text-muted-foreground tabular-nums">{t("minhasBases.marcadas", { n: sel.size })}</span>
      </div>
      <div className="space-y-4">
        {regionais.map((r) => {
          const bases = r.bases.filter((b) => !q || `${b.code} ${b.name}`.toLowerCase().includes(q));
          if (!bases.length) return null;
          return (
            <fieldset key={r.id} className="rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium">
                {r.code} · {r.name}
              </legend>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {bases.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" checked={sel.has(b.id)} onChange={() => toggle(b.id)} />
                    <span className="font-medium">{b.code}</span>
                    <span className="truncate text-muted-foreground">{b.name}</span>
                    {b.type === "FRANQUIA" && <span className="rounded bg-muted px-1.5 text-[11px]">{t("minhasBases.franquia")}</span>}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
      {state.error && <p className="text-sm text-destructive">{tm(state.error)}</p>}
      {state.message && <p className="text-sm text-success">{tm(state.message)}</p>}
      <Button type="submit" disabled={pending || sel.size === 0}>
        {pending ? t("comum.salvando") : t("minhasBases.salvar")}
      </Button>
    </form>
  );
}
