"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Building2, Check, CheckSquare, ChevronDown, MapPin, MessageSquareText, Pencil, Power, Search, Store, Trash2, Warehouse, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/page-header";
import { useFiltroLembrado } from "@/components/use-filtro-lembrado";
import { useServerMessage, useT } from "@/i18n/client";
import { normHeader } from "@/lib/importacao/csv";
import { cn } from "@/lib/utils";
import { ativarBasesAction, excluirBasesAction } from "./actions";

type Tipo = "BASE" | "FRANQUIA" | "ALMOXARIFADO";
type Base = { id: string; code: string; name: string; type: Tipo; city: string | null; state: string | null; active: boolean; hasChat: boolean };
/** Só o que a tela precisa. Os links de webhook do Feishu NUNCA vão para o navegador: aqui chega só "tem ou não tem". */
export type RegionalLista = { id: string; code: string; name: string; active: boolean; hasStaffChat: boolean; hasShippingChat: boolean; bases: Base[] };

const TIPOS: Tipo[] = ["BASE", "FRANQUIA", "ALMOXARIFADO"];
const TIPO: Record<Tipo, { icon: LucideIcon; tile: string; dot: string }> = {
  BASE: { icon: Building2, tile: "bg-primary/10 text-primary", dot: "bg-primary" },
  FRANQUIA: { icon: Store, tile: "bg-warning/15 text-warning", dot: "bg-warning" },
  ALMOXARIFADO: { icon: Warehouse, tile: "bg-success/15 text-success", dot: "bg-success" },
};

const norm = (s: string) => normHeader(s);

/** Filtros da lista, lembrados na sessão (ver use-filtro-lembrado.ts). Constante: o hook compara com o padrão. */
const FILTROS_PADRAO = { busca: "", tipo: "todos" as Tipo | "todos", ocultarInativas: false, regional: "" };

/**
 * Regionais e bases: busca, filtro por tipo e blocos por regional (recolhíveis). Com "Selecionar", marca uma,
 * várias ou todas as que estão na tela e exclui de uma vez (só as sem histórico; as outras ficam para
 * desativar) ou desativa/reativa.
 */
export function ListaBases({ regionals, editable }: { regionals: RegionalLista[]; editable: boolean }) {
  const t = useT();
  const tm = useServerMessage();
  const { valor: f, mudar, limpar: limparFiltros, ativos } = useFiltroLembrado(FILTROS_PADRAO);
  const { busca, tipo, ocultarInativas, regional: regionalSel } = f;
  const setBusca = (v: string) => mudar({ busca: v });
  const setTipo = (v: Tipo | "todos") => mudar({ tipo: v });
  const setOcultarInativas = (v: boolean) => mudar({ ocultarInativas: v });
  // Sem filtro, as regionais começam fechadas (uma linha cada, tudo numa tela); com filtro, abertas. A pessoa pode
  // abrir/fechar qualquer uma: `abertas` vale sem filtro, `fechadasManual` vale com filtro.
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [fechadasManual, setFechadasManual] = useState<Set<string>>(new Set());
  const [modo, setModo] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirma, setConfirma] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pending, start] = useTransition();

  const filtrando = busca.trim() !== "" || tipo !== "todos" || ocultarInativas || regionalSel !== "";
  const q = norm(busca);
  const visiveis = useMemo(
    () =>
      regionals.map((r) => ({
        ...r,
        mostradas: r.bases.filter(
          (b) =>
            (tipo === "todos" || b.type === tipo) &&
            (!ocultarInativas || b.active) &&
            (!q || norm(`${b.code} ${b.name} ${b.city ?? ""} ${b.state ?? ""} ${r.code} ${r.name}`).includes(q)),
        ),
      })),
    [regionals, tipo, ocultarInativas, q],
  );
  // Com filtro, regional sem nenhuma base que combine some da tela; sem filtro, aparecem todas (até as vazias).
  const blocos = (filtrando ? visiveis.filter((r) => r.mostradas.length > 0) : visiveis).filter((r) => !regionalSel || r.id === regionalSel);
  const aberta = (id: string) => (filtrando ? !fechadasManual.has(id) : abertas.has(id));
  const todasAbertas = blocos.length > 0 && blocos.every((r) => aberta(r.id));
  const idsNaTela = blocos.flatMap((r) => r.mostradas.map((b) => b.id));
  const codigos = new Map(regionals.flatMap((r) => r.bases.map((b) => [b.id, b.code] as const)));
  const contaTipo = (k: Tipo) => regionals.reduce((n, r) => n + r.bases.filter((b) => b.type === k).length, 0);
  const totalBases = regionals.reduce((n, r) => n + r.bases.length, 0);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const marcarVarias = (ids: string[]) => setSel((s) => { const n = new Set(s); const todasJa = ids.every((i) => n.has(i)); for (const i of ids) { if (todasJa) n.delete(i); else n.add(i); } return n; });
  const sair = () => (setModo(false), setSel(new Set()), setConfirma(false));
  const alternarBloco = (id: string) => {
    const set = filtrando ? setFechadasManual : setAbertas;
    set((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const abrirTodas = (abrir: boolean) => {
    if (filtrando) setFechadasManual(abrir ? new Set() : new Set(blocos.map((r) => r.id)));
    else setAbertas(abrir ? new Set(blocos.map((r) => r.id)) : new Set());
  };

  const excluir = () =>
    start(async () => {
      const r = await excluirBasesAction([...sel]);
      setConfirma(false);
      if (r.error || !r.resultado) return setAviso({ tipo: "erro", texto: tm(r.error ?? "Erro") });
      const { excluidas, comHistorico } = r.resultado;
      setSel(new Set(comHistorico.map((b) => b.id)));
      setAviso({
        tipo: comHistorico.length ? "erro" : "ok",
        texto:
          t("estrutura.massa.excluidas", { n: excluidas }) +
          (comHistorico.length ? ` ${t("estrutura.massa.comHistorico", { n: comHistorico.length, lista: comHistorico.map((b) => b.code).join(", ") })}` : ""),
      });
      if (!comHistorico.length) setModo(false);
    });
  const ativar = (active: boolean) =>
    start(async () => {
      const r = await ativarBasesAction([...sel], active);
      if (r.error) return setAviso({ tipo: "erro", texto: tm(r.error) });
      setAviso({ tipo: "ok", texto: t(active ? "estrutura.massa.reativadas" : "estrutura.massa.desativadas", { n: sel.size }) });
      sair();
    });

  return (
    <div className="space-y-5">
      {/* Barra de ferramentas: busca, tipo, inativas e seleção em massa. */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border bg-card p-2.5 shadow-xs">
        <label className="relative min-w-52 flex-1">
          <span className="sr-only">{t("estrutura.filtro.buscar")}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("estrutura.filtro.buscar")}
            className="h-9 w-full rounded-lg border border-transparent bg-muted pr-3 pl-9 text-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </label>
        <div className="flex flex-wrap gap-1" role="group" aria-label={t("estrutura.tipo")}>
          <Chip ativo={tipo === "todos"} onClick={() => setTipo("todos")}>
            {t("estrutura.filtro.todas")} <Num>{totalBases}</Num>
          </Chip>
          {TIPOS.map((k) => (
            <Chip key={k} ativo={tipo === k} onClick={() => setTipo(tipo === k ? "todos" : k)}>
              <span className={cn("size-2 rounded-full", TIPO[k].dot)} aria-hidden />
              {t(`tiposBase.${k}`)} <Num>{contaTipo(k)}</Num>
            </Chip>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 px-1 text-sm text-muted-foreground">
          <input type="checkbox" className="size-4" checked={ocultarInativas} onChange={(e) => setOcultarInativas(e.target.checked)} />
          {t("estrutura.filtro.ocultarInativas")}
        </label>
        {editable && (
          <div className="ml-auto flex items-center gap-2">
            {modo ? (
              <>
                <Button variant="outline" size="sm" onClick={() => marcarVarias(idsNaTela)} disabled={idsNaTela.length === 0}>
                  <CheckSquare /> {idsNaTela.length > 0 && idsNaTela.every((i) => sel.has(i)) ? t("estrutura.massa.desmarcarTodas") : t("estrutura.massa.todas")}
                </Button>
                <Button variant="ghost" size="sm" onClick={sair}>
                  <X /> {t("estrutura.massa.cancelar")}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => (setModo(true), setAviso(null))}>
                <CheckSquare /> {t("estrutura.massa.selecionar")}
              </Button>
            )}
          </div>
        )}
      </div>
      {/* Ir direto para uma regional (sem rolar a página): um clique mostra só ela, aberta. */}
      {regionals.length > 1 && (
        <nav className="flex flex-wrap items-center gap-1.5" aria-label={t("estrutura.filtro.regional")}>
          <Chip ativo={regionalSel === ""} onClick={() => mudar({ regional: "" })}>
            {t("estrutura.filtro.todas")} <Num>{regionals.length}</Num>
          </Chip>
          {visiveis.map((r) => (
            <Chip key={r.id} ativo={regionalSel === r.id} onClick={() => mudar({ regional: regionalSel === r.id ? "" : r.id })} desligado={filtrando && r.mostradas.length === 0}>
              <span className="font-semibold">{r.code}</span>
              <Num>{filtrando ? r.mostradas.length : r.bases.length}</Num>
            </Chip>
          ))}
          <span className="ml-auto flex items-center gap-1">
            {blocos.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => abrirTodas(!todasAbertas)}>
                <ChevronDown className={cn("transition-transform", todasAbertas && "rotate-180")} />
                {todasAbertas ? t("estrutura.filtro.recolherTodas") : t("estrutura.filtro.expandirTodas")}
              </Button>
            )}
            {ativos > 0 && (
              <Button variant="ghost" size="sm" onClick={limparFiltros}>
                <X /> {t("estrutura.filtro.limpar")}
              </Button>
            )}
          </span>
        </nav>
      )}
      {aviso && (
        <p role="status" className={cn("rounded-lg border px-3 py-2 text-sm", aviso.tipo === "ok" ? "border-success/30 bg-success/5 text-success" : "border-warning/30 bg-warning/5 text-warning")}>
          {aviso.texto}
        </p>
      )}

      {filtrando && blocos.length === 0 && <EmptyState>{t("estrutura.filtro.nenhuma")}</EmptyState>}

      {blocos.map((r) => {
        const ids = r.mostradas.map((b) => b.id);
        const todasDaRegional = ids.length > 0 && ids.every((i) => sel.has(i));
        const fechada = !aberta(r.id);
        return (
          <section key={r.id} aria-labelledby={`reg-${r.id}`} className={cn("overflow-hidden rounded-2xl border bg-card shadow-xs", !r.active && "bg-muted/40")}>
            <header className="flex flex-col gap-x-4 gap-y-2.5 p-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:px-5">
              <button
                type="button"
                onClick={() => alternarBloco(r.id)}
                aria-expanded={!fechada}
                aria-controls={`bases-${r.id}`}
                className="flex w-full min-w-0 items-center gap-3.5 rounded-xl text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-auto sm:flex-1"
              >
                <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl text-[15px] font-bold tracking-tight tabular-nums", r.active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  {r.code.slice(0, 4)}
                </span>
                <span className="min-w-0 flex-1">
                  <span id={`reg-${r.id}`} className="flex items-center gap-2 text-[17px] leading-tight font-semibold">
                    <span className="truncate">{r.name}</span>
                    {!r.active && <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{t("comum.inativa")}</span>}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
                    {filtrando && <span className="font-medium text-foreground/80">{t("estrutura.filtro.nDeN", { n: r.mostradas.length, total: r.bases.length })}</span>}
                    {r.bases.length === 0 && <span>{t("estrutura.semBases")}</span>}
                    {TIPOS.map((k) => {
                      const n = r.bases.filter((b) => b.type === k).length;
                      return n > 0 ? (
                        <span key={k} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <span className={cn("size-1.5 rounded-full", TIPO[k].dot)} aria-hidden />
                          {t(`estrutura.contagem.${k}`, { n })}
                        </span>
                      ) : null;
                    })}
                  </span>
                </span>
                <ChevronDown className={cn("ml-auto size-5 shrink-0 text-muted-foreground transition-transform", fechada && "-rotate-90")} aria-hidden />
              </button>
              <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                <GrupoFeishu ok={r.hasStaffChat} label={t("estrutura.feishuChip.insumos")} title={t(r.hasStaffChat ? "estrutura.feishuChip.configurado" : "estrutura.feishuChip.geral")} />
                <GrupoFeishu ok={r.hasShippingChat} label={t("estrutura.feishuChip.expedicao")} title={t(r.hasShippingChat ? "estrutura.feishuChip.configurado" : "estrutura.feishuChip.geral")} />
                {modo && ids.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => marcarVarias(ids)}>
                    {todasDaRegional ? t("estrutura.massa.desmarcarRegional") : t("estrutura.massa.todasRegional")}
                  </Button>
                )}
                {editable && !modo && (
                  <Button asChild variant="ghost" size="icon-lg" className="text-muted-foreground">
                    <Link href={`/admin/estrutura/regionais/${r.id}`} aria-label={`${t("estrutura.editarRegional")} ${r.code}`} title={t("estrutura.editarRegional")}>
                      <Pencil />
                    </Link>
                  </Button>
                )}
              </div>
            </header>
            {!fechada && (
              <div id={`bases-${r.id}`} className="border-t bg-muted/30 p-3.5 sm:p-4">
                {r.mostradas.length === 0 ? (
                  <p className="py-3 text-center text-sm text-muted-foreground">{t("estrutura.semBases")}</p>
                ) : (
                  <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {r.mostradas.map((b) => (
                      <li key={b.id}>
                        <CartaoBase base={b} modo={modo} marcada={sel.has(b.id)} onToggle={() => toggle(b.id)} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        );
      })}

      {/* Barra fixa com as ações da seleção. */}
      {modo && sel.size > 0 && (
        <div className="sticky bottom-20 z-30 flex flex-wrap items-center gap-2 rounded-2xl border bg-popover p-3 shadow-xl">
          <span className="mr-auto pl-1 text-sm font-semibold">{t("estrutura.massa.selecionadas", { n: sel.size })}</span>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => ativar(true)}>
            <Power /> {t("estrutura.massa.reativar")}
          </Button>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => ativar(false)}>
            <Power /> {t("estrutura.massa.desativar")}
          </Button>
          <Button variant="destructive" size="sm" disabled={pending} onClick={() => setConfirma(true)}>
            <Trash2 /> {t("estrutura.massa.excluir")}
          </Button>
        </div>
      )}

      <Dialog open={confirma} onOpenChange={setConfirma}>
        <DialogContent overlayClassName="bg-black/40 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle>{t("estrutura.massa.confirmaTitulo", { n: sel.size })}</DialogTitle>
            <DialogDescription>{t("estrutura.massa.confirmaTexto")}</DialogDescription>
          </DialogHeader>
          <p className="max-h-32 overflow-y-auto text-sm text-muted-foreground">{[...sel].map((id) => codigos.get(id)).join(", ")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirma(false)}>
              {t("estrutura.massa.cancelar")}
            </Button>
            <Button variant="destructive" disabled={pending} onClick={excluir}>
              <Trash2 /> {pending ? t("comum.salvando") : t("estrutura.massa.excluirSim")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return <span className="tabular-nums text-muted-foreground">{children}</span>;
}

function Chip({ ativo, onClick, children, desligado }: { ativo: boolean; onClick: () => void; children: React.ReactNode; desligado?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        ativo ? "border-primary/40 bg-accent text-accent-foreground" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        desligado && !ativo && "opacity-40",
      )}
    >
      {children}
    </button>
  );
}

function GrupoFeishu({ ok, label, title }: { ok: boolean; label: string; title: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium",
        ok ? "border-success/30 bg-success/10 text-success" : "border-dashed text-muted-foreground",
      )}
    >
      {ok ? <Check className="size-3.5" aria-hidden /> : <MessageSquareText className="size-3.5" aria-hidden />}
      {label}
    </span>
  );
}

function CartaoBase({ base: b, modo, marcada, onToggle }: { base: Base; modo: boolean; marcada: boolean; onToggle: () => void }) {
  const t = useT();
  const { icon: Icone, tile } = TIPO[b.type];
  const local = b.city ? `${b.city}${b.state ? ` / ${b.state}` : ""}` : null;
  const conteudo = (
    <>
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", b.active ? tile : "bg-muted text-muted-foreground")}>
        <Icone className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] leading-tight font-semibold tabular-nums">{b.code}</span>
          {b.hasChat && <MessageSquareText className="size-3.5 shrink-0 text-success" aria-label={t("estrutura.feishuChip.baseConfigurada")} />}
        </span>
        <span className="block truncate text-[13px] text-muted-foreground">{b.name}</span>
        <span className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-foreground/70">{t(`tiposBase.${b.type}`)}</span>
          {local && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{local}</span>
            </span>
          )}
          {!b.active && <span className="font-medium text-warning">{t("comum.inativa")}</span>}
        </span>
      </span>
    </>
  );
  const base = "flex h-full items-start gap-3 rounded-xl border bg-card p-3 text-left transition-[border-color,box-shadow,background-color]";
  if (modo)
    return (
      <label className={cn(base, "relative cursor-pointer hover:border-primary/50 has-[:checked]:border-primary has-[:checked]:bg-accent/60 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50", !b.active && "border-dashed")}>
        <input type="checkbox" className="peer sr-only" checked={marcada} onChange={onToggle} />
        {conteudo}
        <span className="grid size-5 shrink-0 place-items-center rounded-md border bg-card text-primary-foreground peer-checked:border-primary peer-checked:bg-primary" aria-hidden>
          <Check className={cn("size-3.5", !marcada && "opacity-0")} />
        </span>
      </label>
    );
  return (
    <Link href={`/admin/estrutura/bases/${b.id}`} className={cn(base, "hover:border-primary/50 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none", !b.active && "border-dashed opacity-75")}>
      {conteudo}
    </Link>
  );
}
