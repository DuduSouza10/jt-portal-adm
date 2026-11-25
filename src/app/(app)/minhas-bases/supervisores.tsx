"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { initialsOf } from "@/components/app-nav";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { agruparPorRegional, agruparSupervisoresPorRegional, filtrarSupervisores, nomeBonito, type SupervisorItem } from "./filtro";
import { Ferramentas, TIPO_ICONE } from "./partes";

/** Quantas bases aparecem no cartão antes do "+n" (o resto está no detalhe, ao clicar). */
const PREVIA = 3;

function Avatar({ nome, destaque, grande }: { nome: string; destaque?: boolean; grande?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        grande ? "size-12 text-base" : "size-10 text-sm",
        destaque ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground",
      )}
    >
      {initialsOf(nome)}
    </span>
  );
}

function CodigoBase({ b }: { b: { code: string; type: string; name: string } }) {
  return (
    <span title={b.name} className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium tabular-nums">
      <span className={cn("size-1.5 rounded-full", (TIPO_ICONE[b.type] ?? TIPO_ICONE.BASE!).dot)} aria-hidden />
      {b.code}
    </span>
  );
}

/**
 * Aba "Supervisores": só leitura. Os supervisores ficam separados por regional (MG, SPN...), cada um num cartão com
 * um resumo das bases; clicar abre o detalhe num card à parte, com o fundo desfocado. A página atualiza sozinha.
 */
export function ListaSupervisores({
  supervisores,
  meuId,
  totais,
  nomesRegionais,
}: {
  supervisores: SupervisorItem[];
  meuId: string;
  totais: { ocupadas: number; livres: number };
  nomesRegionais: Record<string, string>;
}) {
  const t = useT();
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const lista = useMemo(() => filtrarSupervisores(supervisores, busca), [supervisores, busca]);
  const { grupos, semBases } = useMemo(() => agruparSupervisoresPorRegional(lista), [lista]);
  // O detalhe lê do dado mais novo: se o supervisor sair da lista (desativado), o card fecha sozinho.
  const detalhe = aberto ? supervisores.find((s) => s.id === aberto) : undefined;

  if (!supervisores.length) return <EmptyState>{t("minhasBases.supervisores.vazio")}</EmptyState>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{t("minhasBases.supervisores.nSupervisores", { n: supervisores.length })}</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" aria-hidden />
          {t("minhasBases.supervisores.nOcupadas", { n: totais.ocupadas })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-success" aria-hidden />
          {t("minhasBases.supervisores.nLivres", { n: totais.livres })}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          {t("minhasBases.supervisores.aoVivo")}
        </span>
      </div>
      <Ferramentas busca={busca} onBusca={setBusca} placeholder={t("minhasBases.supervisores.busca")} />

      {grupos.length === 0 && semBases.length === 0 ? (
        <EmptyState>{t("minhasBases.supervisores.nenhum")}</EmptyState>
      ) : (
        <>
          {grupos.map((g) => (
            <section key={g.regionalCode} aria-labelledby={`sup-${g.regionalCode}`} className="space-y-3">
              <header className="flex items-center gap-3">
                <span className="grid h-10 min-w-10 place-items-center rounded-xl bg-primary px-2 text-sm font-bold tracking-tight text-primary-foreground tabular-nums">{g.regionalCode}</span>
                <div className="min-w-0">
                  <h2 id={`sup-${g.regionalCode}`} className="truncate text-[17px] leading-tight font-semibold">
                    {nomesRegionais[g.regionalCode] ?? g.regionalCode}
                  </h2>
                  <p className="text-[13px] text-muted-foreground">
                    {t("minhasBases.supervisores.nSupervisores", { n: g.supervisores.length })} · {t("minhasBases.supervisores.nBases", { n: g.totalBases })}
                  </p>
                </div>
              </header>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.supervisores.map((s) => (
                  <li key={s.id}>
                    <CartaoSupervisor s={s} eu={s.id === meuId} onAbrir={() => setAberto(s.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {semBases.length > 0 && (
            <section aria-label={t("minhasBases.supervisores.semBases")} className="space-y-3">
              <h2 className="text-[15px] font-semibold text-muted-foreground">{t("minhasBases.supervisores.semBases")}</h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {semBases.map((s) => (
                  <li key={s.id}>
                    <CartaoSupervisor s={s} eu={s.id === meuId} onAbrir={() => setAberto(s.id)} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setAberto(null)}>
        <DialogContent className="sm:max-w-2xl" overlayClassName="bg-black/40 backdrop-blur-md">
          {detalhe && <Detalhe s={detalhe} eu={detalhe.id === meuId} nomesRegionais={nomesRegionais} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CartaoSupervisor({ s, eu, onAbrir }: { s: SupervisorItem; eu: boolean; onAbrir: () => void }) {
  const t = useT();
  const resto = s.bases.length - PREVIA;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={cn(
        "group flex h-full w-full flex-col gap-3 rounded-2xl border bg-card p-4 text-left shadow-xs transition-[border-color,box-shadow] outline-none hover:border-primary/50 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50",
        eu && "border-primary/40",
      )}
    >
      <span className="flex items-center gap-3">
        <Avatar nome={s.name} destaque={eu} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 leading-tight font-semibold">
            <span className="truncate">{nomeBonito(s.name)}</span>
            {eu && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{t("minhasBases.supervisores.voce")}</span>}
          </span>
          <span className="block text-[13px] text-muted-foreground tabular-nums">{t("minhasBases.supervisores.nBases", { n: s.bases.length })}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
      {s.bases.length === 0 ? (
        <span className="rounded-xl border border-dashed px-3 py-2 text-center text-[13px] text-muted-foreground">{t("minhasBases.supervisores.semBases")}</span>
      ) : (
        <span className="flex flex-wrap gap-1.5">
          {s.bases.slice(0, PREVIA).map((b) => (
            <CodigoBase key={b.id} b={b} />
          ))}
          {resto > 0 && <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">+{resto}</span>}
        </span>
      )}
    </button>
  );
}

function Detalhe({ s, eu, nomesRegionais }: { s: SupervisorItem; eu: boolean; nomesRegionais: Record<string, string> }) {
  const t = useT();
  const grupos = agruparPorRegional(s.bases);
  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3 pr-8">
          <Avatar nome={s.name} destaque={eu} grande />
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="truncate">{nomeBonito(s.name)}</span>
              {eu && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{t("minhasBases.supervisores.voce")}</span>}
            </DialogTitle>
            <DialogDescription>
              {t("minhasBases.supervisores.nBases", { n: s.bases.length })}
              {grupos.length > 1 && ` · ${t("minhasBases.supervisores.nRegionais", { n: grupos.length })}`}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>
      {s.bases.length === 0 ? (
        <p className="rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">{t("minhasBases.supervisores.semBases")}</p>
      ) : (
        <div className="max-h-[min(60vh,520px)] space-y-4 overflow-y-auto pr-1">
          {grupos.map((g) => (
            <section key={g.regionalCode} className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <span className="grid h-6 min-w-9 place-items-center rounded-md bg-primary px-1.5 text-[11px] font-bold text-primary-foreground tabular-nums">{g.regionalCode}</span>
                <span className="truncate">{nomesRegionais[g.regionalCode] ?? g.regionalCode}</span>
                <span className="ml-auto text-xs font-medium text-muted-foreground tabular-nums">{g.bases.length}</span>
              </h3>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {g.bases.map((b) => {
                  const { icon: Icone, tile } = TIPO_ICONE[b.type] ?? TIPO_ICONE.BASE!;
                  return (
                    <li key={b.id} className="flex items-center gap-2.5 rounded-lg border bg-muted/30 p-2">
                      <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", tile)}>
                        <Icone className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm leading-tight font-semibold tabular-nums">{b.code}</span>
                          {b.type === "FRANQUIA" && <span className="shrink-0 rounded bg-warning/15 px-1.5 text-[10px] leading-4 font-medium text-warning">{t("minhasBases.franquia")}</span>}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{b.name}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
