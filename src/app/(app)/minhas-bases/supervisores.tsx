"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/page-header";
import { initialsOf } from "@/components/app-nav";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { agruparPorRegional, filtrarSupervisores, type SupervisorItem } from "./filtro";
import { Ferramentas, TIPO_ICONE } from "./partes";

/** Quantas bases aparecem em cada cartão antes de "Ver todas". */
const LIMITE = 12;

/** Aba "Supervisores": só leitura. Quem é cada supervisor e as bases que detém, por regional; a página atualiza sozinha. */
export function ListaSupervisores({
  supervisores,
  meuId,
  totais,
}: {
  supervisores: SupervisorItem[];
  meuId: string;
  totais: { ocupadas: number; livres: number };
}) {
  const t = useT();
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const lista = useMemo(() => filtrarSupervisores(supervisores, busca), [supervisores, busca]);

  if (!supervisores.length) return <EmptyState>{t("minhasBases.supervisores.vazio")}</EmptyState>;

  return (
    <div className="space-y-4">
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
      {lista.length === 0 ? (
        <EmptyState>{t("minhasBases.supervisores.nenhum")}</EmptyState>
      ) : (
        <ul className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {lista.map((s) => {
            const aberto = abertos.has(s.id) || busca.trim() !== "";
            const mostradas = aberto ? s.bases : s.bases.slice(0, LIMITE);
            const grupos = agruparPorRegional(mostradas);
            const eu = s.id === meuId;
            return (
              <li key={s.id} className={cn("flex flex-col rounded-2xl border bg-card p-4 shadow-xs", eu && "border-primary/40")}>
                <div className="flex items-center gap-3">
                  <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold", eu ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground")}>
                    {initialsOf(s.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 leading-tight font-semibold">
                      <span className="truncate">{s.name}</span>
                      {eu && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{t("minhasBases.supervisores.voce")}</span>}
                    </p>
                    <p className="text-[13px] text-muted-foreground tabular-nums">{t("minhasBases.supervisores.nBases", { n: s.bases.length })}</p>
                  </div>
                </div>
                {s.bases.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">{t("minhasBases.supervisores.semBases")}</p>
                ) : (
                  <div className="mt-3 space-y-2.5">
                    {grupos.map((g) => (
                      <div key={g.regionalCode} className="flex items-start gap-2.5">
                        <span className="mt-0.5 grid h-6 min-w-9 shrink-0 place-items-center rounded-md bg-muted px-1.5 text-[11px] font-bold text-muted-foreground tabular-nums">{g.regionalCode}</span>
                        <ul className="flex min-w-0 flex-wrap gap-1.5">
                          {g.bases.map((b) => (
                            <li key={b.id} title={b.name} className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium tabular-nums">
                              <span className={cn("size-1.5 rounded-full", (TIPO_ICONE[b.type] ?? TIPO_ICONE.BASE!).dot)} aria-hidden />
                              {b.code}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {s.bases.length > LIMITE && busca.trim() === "" && (
                      <button
                        type="button"
                        onClick={() => setAbertos((a) => { const n = new Set(a); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
                        className="rounded-md text-[13px] font-medium text-primary outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        {aberto ? t("minhasBases.supervisores.verMenos") : t("minhasBases.supervisores.verTodas", { n: s.bases.length })}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
