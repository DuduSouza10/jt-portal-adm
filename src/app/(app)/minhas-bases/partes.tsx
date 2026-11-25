"use client";

import { useState } from "react";
import { Building2, Check, ChevronDown, Search, Store, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { BaseItem, RegionalItem, TipoFiltro } from "./filtro";

export const TIPO_ICONE: Record<string, { icon: LucideIcon; tile: string; dot: string }> = {
  BASE: { icon: Building2, tile: "bg-primary/10 text-primary", dot: "bg-primary" },
  FRANQUIA: { icon: Store, tile: "bg-warning/15 text-warning", dot: "bg-warning" },
};

export function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        ativo ? "border-primary/40 bg-accent text-accent-foreground" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Busca + filtro por tipo, no mesmo estilo da tela de Regionais e bases. */
export function Ferramentas({
  busca,
  onBusca,
  placeholder,
  tipo,
  onTipo,
  contagem,
}: {
  busca: string;
  onBusca: (v: string) => void;
  placeholder: string;
  tipo?: TipoFiltro;
  onTipo?: (v: TipoFiltro) => void;
  contagem?: { todos: number; BASE: number; FRANQUIA: number };
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border bg-card p-2.5 shadow-xs">
      <label className="relative min-w-52 flex-1">
        <span className="sr-only">{placeholder}</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder={placeholder}
          className="h-9 w-full rounded-lg border border-transparent bg-muted pr-3 pl-9 text-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </label>
      {tipo && onTipo && contagem && (
        <div className="flex flex-wrap gap-1" role="group" aria-label={t("estrutura.tipo")}>
          <Chip ativo={tipo === "todos"} onClick={() => onTipo("todos")}>
            {t("estrutura.filtro.todas")} <span className="tabular-nums text-muted-foreground">{contagem.todos}</span>
          </Chip>
          {(["BASE", "FRANQUIA"] as const).map((k) => (
            <Chip key={k} ativo={tipo === k} onClick={() => onTipo(tipo === k ? "todos" : k)}>
              <span className={cn("size-2 rounded-full", TIPO_ICONE[k]!.dot)} aria-hidden />
              {t(`tiposBase.${k}`)} <span className="tabular-nums text-muted-foreground">{contagem[k]}</span>
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function CartaoBase({ base: b, marcada, onToggle, tom }: { base: BaseItem; marcada: boolean; onToggle: () => void; tom: "primary" | "destructive" }) {
  const t = useT();
  const { icon: Icone, tile } = TIPO_ICONE[b.type] ?? TIPO_ICONE.BASE!;
  return (
    <label
      className={cn(
        "relative flex h-full cursor-pointer items-center gap-3 rounded-xl border bg-card p-2.5 transition-[border-color,background-color] has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
        tom === "primary" ? "hover:border-primary/50 has-[:checked]:border-primary has-[:checked]:bg-accent/60" : "hover:border-destructive/50 has-[:checked]:border-destructive has-[:checked]:bg-destructive/5",
      )}
    >
      <input type="checkbox" className="peer sr-only" checked={marcada} onChange={onToggle} />
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", tile)}>
        <Icone className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm leading-tight font-semibold tabular-nums">{b.code}</span>
          {b.type === "FRANQUIA" && <span className="shrink-0 rounded bg-warning/15 px-1.5 text-[10px] leading-4 font-medium text-warning">{t("minhasBases.franquia")}</span>}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{b.name}</span>
      </span>
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-md border bg-card text-primary-foreground",
          tom === "primary" ? "peer-checked:border-primary peer-checked:bg-primary" : "peer-checked:border-destructive peer-checked:bg-destructive",
        )}
        aria-hidden
      >
        <Check className={cn("size-3.5", !marcada && "opacity-0")} />
      </span>
    </label>
  );
}

type Bloco = RegionalItem & { mostradas: BaseItem[] };

/**
 * Bases por regional em blocos recolhíveis, com cartões marcáveis. Sem filtro cada bloco abre como `abertoPorPadrao`;
 * com busca ou filtro todos abrem (a pessoa está procurando). "Marcar todas" vale para o que está na tela.
 */
export function ListaPorRegional({
  blocos,
  totalPorRegional,
  sel,
  onToggle,
  onToggleVarias,
  filtrando,
  abertoPorPadrao,
  tom,
  rotuloTotal = "minhasBases.livres",
}: {
  blocos: Bloco[];
  totalPorRegional: Map<string, number>;
  sel: Set<string>;
  onToggle: (id: string) => void;
  onToggleVarias: (ids: string[]) => void;
  filtrando: boolean;
  abertoPorPadrao: boolean;
  tom: "primary" | "destructive";
  /** Chave do texto "{n} …" sob o nome da regional (livres na aba Escolher, bases na aba Minhas). */
  rotuloTotal?: "minhasBases.livres" | "minhasBases.nBases";
}) {
  const t = useT();
  // Blocos que a pessoa inverteu em relação ao padrão (abertos viram fechados e vice-versa).
  const [invertidos, setInvertidos] = useState<Set<string>>(new Set());
  const aberto = (id: string) => filtrando || abertoPorPadrao !== invertidos.has(id);
  const todosAbertos = blocos.every((b) => aberto(b.id));
  const inverter = (id: string) => setInvertidos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const abrirTodos = (abrir: boolean) => setInvertidos(new Set(abrir === abertoPorPadrao ? [] : blocos.map((b) => b.id)));

  return (
    <div className="space-y-3">
      {blocos.length > 1 && !filtrando && (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => abrirTodos(!todosAbertos)}>
            <ChevronDown className={cn("transition-transform", todosAbertos && "rotate-180")} />
            {todosAbertos ? t("minhasBases.recolherTodas") : t("minhasBases.expandirTodas")}
          </Button>
        </div>
      )}
      {blocos.map((r) => {
        const ids = r.mostradas.map((b) => b.id);
        const nSel = ids.filter((i) => sel.has(i)).length;
        const todas = ids.length > 0 && nSel === ids.length;
        const aberta = aberto(r.id);
        const total = totalPorRegional.get(r.id) ?? r.bases.length;
        return (
          <section key={r.id} aria-labelledby={`reg-${r.id}`} className="overflow-hidden rounded-2xl border bg-card shadow-xs">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2.5 sm:p-3.5">
              <button
                type="button"
                onClick={() => !filtrando && inverter(r.id)}
                aria-expanded={aberta}
                aria-controls={`bases-${r.id}`}
                className="flex min-w-0 flex-1 basis-52 items-center gap-3 rounded-xl p-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold tracking-tight text-primary-foreground tabular-nums">{r.code.slice(0, 4)}</span>
                <span className="min-w-0 flex-1">
                  <span id={`reg-${r.id}`} className="block truncate text-[16px] leading-tight font-semibold">{r.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
                    <span>{filtrando ? t("minhasBases.nDeN", { n: r.mostradas.length, total }) : t(rotuloTotal, { n: total })}</span>
                    {nSel > 0 && <span className={cn("rounded-full px-2 text-xs font-semibold whitespace-nowrap", tom === "primary" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>{t("minhasBases.selecionadas", { n: nSel })}</span>}
                  </span>
                </span>
                <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", !aberta && "-rotate-90")} aria-hidden />
              </button>
              <Button type="button" variant="ghost" size="sm" className="ml-auto shrink-0" onClick={() => onToggleVarias(ids)}>
                {todas ? t("minhasBases.desmarcarTodas") : t("minhasBases.marcarTodas")}
              </Button>
            </header>
            {aberta && (
              <ul id={`bases-${r.id}`} className="grid gap-2 border-t bg-muted/30 p-3 sm:grid-cols-2 sm:p-3.5 lg:grid-cols-3 2xl:grid-cols-4">
                {r.mostradas.map((b) => (
                  <li key={b.id}>
                    <CartaoBase base={b} marcada={sel.has(b.id)} onToggle={() => onToggle(b.id)} tom={tom} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Barra fixa com a ação da seleção (acima do balão de dúvidas). */
export function BarraAcao({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-20 z-30 flex flex-wrap items-center gap-2 rounded-2xl border bg-popover p-3 shadow-xl">{children}</div>;
}

export function alternar(set: Set<string>, id: string) {
  const n = new Set(set);
  if (n.has(id)) n.delete(id);
  else n.add(id);
  return n;
}

export function alternarVarios(set: Set<string>, ids: string[]) {
  const n = new Set(set);
  const todas = ids.every((i) => n.has(i));
  for (const i of ids) {
    if (todas) n.delete(i);
    else n.add(i);
  }
  return n;
}
