"use client";

import { useMemo, useState } from "react";
import { ListPlus, X } from "lucide-react";
import { useKeepForm } from "@/components/use-keep-form";
import { EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useServerMessage, useT } from "@/i18n/client";
import { salvarMinhasBasesAction } from "./actions";
import { filtrarRegionais, podarSelecao, type RegionalItem, type TipoFiltro } from "./filtro";
import { alternar, alternarVarios, BarraAcao, Ferramentas, ListaPorRegional } from "./partes";

/**
 * Aba "Escolher bases": só o que está livre. Marcar e tocar em Adicionar junta as marcadas às que a pessoa já tem
 * (a action grava a lista inteira). Se outro supervisor pegar uma base enquanto a tela está aberta, ela some da
 * lista e da seleção na próxima atualização.
 */
export function EscolhaBases({ regionais, minhas }: { regionais: RegionalItem[]; minhas: string[] }) {
  const t = useT();
  const tm = useServerMessage();
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<TipoFiltro>("todos");
  const { state, pending, formProps } = useKeepForm(salvarMinhasBasesAction, {});

  const todasIds = useMemo(() => regionais.flatMap((r) => r.bases.map((b) => b.id)), [regionais]);
  const sel = useMemo(() => podarSelecao(marcadas, todasIds), [marcadas, todasIds]);
  const blocos = useMemo(() => filtrarRegionais(regionais, busca, tipo), [regionais, busca, tipo]);
  const totalPorRegional = useMemo(() => new Map(regionais.map((r) => [r.id, r.bases.length])), [regionais]);
  const contagem = useMemo(() => {
    const todas = regionais.flatMap((r) => r.bases);
    return { todos: todas.length, BASE: todas.filter((b) => b.type === "BASE").length, FRANQUIA: todas.filter((b) => b.type === "FRANQUIA").length };
  }, [regionais]);
  const filtrando = busca.trim() !== "" || tipo !== "todos";

  if (!regionais.length) return <EmptyState>{t("minhasBases.semLivres")}</EmptyState>;

  return (
    <form {...formProps} className="space-y-4">
      {[...minhas, ...sel].map((id) => (
        <input key={id} type="hidden" name="baseIds" value={id} />
      ))}
      <Ferramentas busca={busca} onBusca={setBusca} placeholder={t("minhasBases.busca")} tipo={tipo} onTipo={setTipo} contagem={contagem} />
      {state.message && sel.size === 0 && (
        <p role="status" className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
          {tm(state.message)}
        </p>
      )}
      {blocos.length === 0 ? (
        <EmptyState>{t("minhasBases.nenhumaBusca")}</EmptyState>
      ) : (
        <ListaPorRegional
          blocos={blocos}
          totalPorRegional={totalPorRegional}
          sel={sel}
          onToggle={(id) => setMarcadas(alternar(sel, id))}
          onToggleVarias={(ids) => setMarcadas(alternarVarios(sel, ids))}
          filtrando={filtrando}
          abertoPorPadrao={regionais.length === 1}
          tom="primary"
        />
      )}
      {sel.size > 0 && (
        <BarraAcao>
          <span className="mr-auto pl-1 text-sm font-semibold">{t("minhasBases.selecionadas", { n: sel.size })}</span>
          {state.error && <span className="w-full text-sm text-destructive sm:w-auto">{tm(state.error)}</span>}
          <Button type="button" variant="ghost" size="sm" onClick={() => setMarcadas(new Set())}>
            <X /> {t("minhasBases.limparSelecao")}
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            <ListPlus /> {pending ? t("comum.salvando") : t("minhasBases.adicionar")}
          </Button>
        </BarraAcao>
      )}
    </form>
  );
}
