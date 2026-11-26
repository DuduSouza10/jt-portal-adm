"use client";

import { useMemo, useState } from "react";
import { Building2, ChevronRight, Search, Store, Warehouse, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { initialsOf } from "@/components/app-nav";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { nomeBonito } from "@/app/(app)/minhas-bases/filtro";
import { agruparPorRegional, basesComPessoa, filtrarPessoas, perfisDaLista, type PessoaComBases } from "@/modules/estrutura/pessoas";

/** Quantas bases aparecem no cartão antes do "+n" (o resto está no detalhe, ao clicar). */
const PREVIA = 4;

const TIPO: Record<string, { icon: LucideIcon; tile: string; dot: string }> = {
  BASE: { icon: Building2, tile: "bg-primary/10 text-primary", dot: "bg-primary" },
  FRANQUIA: { icon: Store, tile: "bg-warning/15 text-warning", dot: "bg-warning" },
  ALMOXARIFADO: { icon: Warehouse, tile: "bg-success/15 text-success", dot: "bg-success" },
};
const tipoDe = (t: string) => TIPO[t] ?? TIPO.BASE!;

function Avatar({ nome, inativo, grande }: { nome: string; inativo?: boolean; grande?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        grande ? "size-12 text-base" : "size-10 text-sm",
        inativo ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground",
      )}
    >
      {initialsOf(nome)}
    </span>
  );
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
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

function CodigoBase({ b }: { b: { code: string; type: string; name: string } }) {
  return (
    <span title={b.name} className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium tabular-nums">
      <span className={cn("size-1.5 rounded-full", tipoDe(b.type).dot)} aria-hidden />
      {b.code}
    </span>
  );
}

/**
 * Aba "Pessoas": só leitura. Todas as pessoas que têm base registrada, com o tipo de acesso e as bases de cada uma.
 * Clicar numa pessoa abre o detalhe num card à parte, com o fundo desfocado. A página atualiza sozinha (AutoAtualizar):
 * a busca, o filtro e o card aberto continuam como estão.
 */
export function ListaPessoas({ pessoas, nomesRegionais }: { pessoas: PessoaComBases[]; nomesRegionais: Record<string, string> }) {
  const t = useT();
  const [busca, setBusca] = useState("");
  const [perfil, setPerfil] = useState("todos");
  const [aberta, setAberta] = useState<string | null>(null);
  const perfis = useMemo(() => perfisDaLista(pessoas), [pessoas]);
  // Se o último de um tipo de acesso sair da lista (outra pessoa mudou algo), o filtro volta para "Todos".
  const perfilAtivo = perfis.some((p) => p.key === perfil) ? perfil : "todos";
  const lista = useMemo(() => filtrarPessoas(pessoas, busca, perfilAtivo), [pessoas, busca, perfilAtivo]);
  const atendidas = useMemo(() => basesComPessoa(pessoas), [pessoas]);
  // O detalhe lê do dado mais novo: se a pessoa sair da lista, o card fecha sozinho.
  const detalhe = aberta ? pessoas.find((p) => p.id === aberta) : undefined;

  if (!pessoas.length) return <EmptyState>{t("estrutura.pessoas.vazio")}</EmptyState>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{t("estrutura.pessoas.nPessoas", { n: pessoas.length })}</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" aria-hidden />
          {t("estrutura.pessoas.nAtendidas", { n: atendidas })}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          {t("estrutura.pessoas.aoVivo")}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border bg-card p-2.5 shadow-xs">
        <label className="relative min-w-52 flex-1">
          <span className="sr-only">{t("estrutura.pessoas.busca")}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("estrutura.pessoas.busca")}
            className="h-9 w-full rounded-lg border border-transparent bg-muted pr-3 pl-9 text-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </label>
        {perfis.length > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            <Chip ativo={perfilAtivo === "todos"} onClick={() => setPerfil("todos")}>
              {t("estrutura.pessoas.todos")}
              <span className="tabular-nums opacity-70">{pessoas.length}</span>
            </Chip>
            {perfis.map((p) => (
              <Chip key={p.key} ativo={perfilAtivo === p.key} onClick={() => setPerfil(p.key)}>
                {p.name}
                <span className="tabular-nums opacity-70">{p.n}</span>
              </Chip>
            ))}
          </div>
        )}
      </div>

      {lista.length === 0 ? (
        <EmptyState>{t("estrutura.pessoas.nenhum")}</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((p) => (
            <li key={p.id}>
              <Cartao p={p} onAbrir={() => setAberta(p.id)} />
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent className="sm:max-w-2xl" overlayClassName="bg-black/40 backdrop-blur-md">
          {detalhe && <Detalhe p={detalhe} nomesRegionais={nomesRegionais} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Cartao({ p, onAbrir }: { p: PessoaComBases; onAbrir: () => void }) {
  const t = useT();
  const resto = p.bases.length - PREVIA;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={cn(
        "group flex h-full w-full flex-col gap-3 rounded-2xl border bg-card p-4 text-left shadow-xs transition-[border-color,box-shadow] outline-none hover:border-primary/50 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50",
        !p.active && "opacity-70",
      )}
    >
      <span className="flex items-center gap-3">
        <Avatar nome={p.name} inativo={!p.active} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 leading-tight font-semibold">
            <span className="truncate">{nomeBonito(p.name)}</span>
            {!p.active && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{t("estrutura.pessoas.inativo")}</span>}
          </span>
          <span className="block truncate text-[13px] text-muted-foreground">
            {p.perfil.name} · {t("estrutura.pessoas.nBases", { n: p.bases.length })}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
      <span className="flex flex-wrap gap-1.5">
        {p.bases.slice(0, PREVIA).map((b) => (
          <CodigoBase key={b.id} b={b} />
        ))}
        {resto > 0 && <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">+{resto}</span>}
      </span>
    </button>
  );
}

function Detalhe({ p, nomesRegionais }: { p: PessoaComBases; nomesRegionais: Record<string, string> }) {
  const t = useT();
  const grupos = agruparPorRegional(p.bases);
  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3 pr-8">
          <Avatar nome={p.name} inativo={!p.active} grande />
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="truncate">{nomeBonito(p.name)}</span>
              {!p.active && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{t("estrutura.pessoas.inativo")}</span>}
            </DialogTitle>
            <DialogDescription>
              {p.perfil.name} · {p.login} · {t("estrutura.pessoas.nBases", { n: p.bases.length })}
              {grupos.length > 1 && ` · ${t("estrutura.pessoas.nRegionais", { n: grupos.length })}`}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>
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
                const { icon: Icone, tile } = tipoDe(b.type);
                return (
                  <li key={b.id} className="flex items-center gap-2.5 rounded-lg border bg-muted/30 p-2">
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", tile)}>
                      <Icone className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm leading-tight font-semibold tabular-nums">{b.code}</span>
                        {b.type === "FRANQUIA" && <span className="shrink-0 rounded bg-warning/15 px-1.5 text-[10px] leading-4 font-medium text-warning">{t("estrutura.pessoas.franquia")}</span>}
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
    </>
  );
}
