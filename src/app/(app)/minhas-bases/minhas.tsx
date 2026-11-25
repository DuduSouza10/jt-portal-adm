"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LockOpen, X } from "lucide-react";
import { useKeepForm } from "@/components/use-keep-form";
import { EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerMessage, useT } from "@/i18n/client";
import { salvarMinhasBasesAction } from "./actions";
import { filtrarRegionais, podarSelecao, type RegionalItem, type TipoFiltro } from "./filtro";
import { alternar, alternarVarios, BarraAcao, Ferramentas, ListaPorRegional } from "./partes";

/**
 * Aba "Minhas bases": o que a pessoa tem hoje. Marcar e liberar tira da lista dela; para o supervisor, a base volta
 * a ficar disponível para os outros (E20). Salvar o que sobrou é o mesmo `escolherMinhasBases`.
 */
export function MinhasBasesLista({ regionais, exclusivo }: { regionais: RegionalItem[]; exclusivo: boolean }) {
  const t = useT();
  const tm = useServerMessage();
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<TipoFiltro>("todos");
  // O diálogo fica aberto enquanto o estado da action for o mesmo de quando abriu: a resposta (ok ou erro) o fecha.
  const [abertoCom, setAbertoCom] = useState<unknown>(null);
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
  const ficam = todasIds.filter((id) => !sel.has(id));

  if (!regionais.length)
    return (
      <EmptyState>
        <span className="block">{t("minhasBases.minhas.vazio")}</span>
        <Button asChild size="sm" className="mt-3">
          <Link href="/minhas-bases">{t("minhasBases.minhas.irEscolher")}</Link>
        </Button>
      </EmptyState>
    );

  return (
    <form id="liberar-bases" {...formProps} className="space-y-4">
      {ficam.map((id) => (
        <input key={id} type="hidden" name="baseIds" value={id} />
      ))}
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{t("minhasBases.minhas.total", { n: todasIds.length })}.</span> {t("minhasBases.minhas.dica")}
      </p>
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
          abertoPorPadrao
          tom="destructive"
          rotuloTotal="minhasBases.nBases"
        />
      )}
      {sel.size > 0 && (
        <BarraAcao>
          <span className="mr-auto pl-1 text-sm font-semibold">{t("minhasBases.minhas.paraLiberar", { n: sel.size })}</span>
          {state.error && <span className="w-full text-sm text-destructive sm:w-auto">{tm(state.error)}</span>}
          <Button type="button" variant="ghost" size="sm" onClick={() => setMarcadas(new Set())}>
            <X /> {t("minhasBases.limparSelecao")}
          </Button>
          <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={() => setAbertoCom(state)}>
            <LockOpen /> {t("minhasBases.minhas.liberar")}
          </Button>
        </BarraAcao>
      )}
      <Dialog open={abertoCom !== null && abertoCom === state} onOpenChange={(o) => !o && setAbertoCom(null)}>
        <DialogContent overlayClassName="bg-black/40 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle>{t("minhasBases.minhas.confirmaTitulo", { n: sel.size })}</DialogTitle>
            <DialogDescription>{t(exclusivo ? "minhasBases.minhas.confirmaSupervisor" : "minhasBases.minhas.confirmaRm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAbertoCom(null)}>
              {t("minhasBases.minhas.cancelar")}
            </Button>
            <Button type="submit" form="liberar-bases" variant="destructive" disabled={pending}>
              <LockOpen /> {pending ? t("comum.salvando") : t("minhasBases.minhas.confirmar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
