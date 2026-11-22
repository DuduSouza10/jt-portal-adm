"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Box, Download, Maximize2, Minimize2, RotateCw } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { Cell, Serie } from "@/modules/relatorios/graficos";
import type { CamName, SceneApi } from "./cena-3d";
import { buildPng, downloadCanvas } from "./exportar-png";

/**
 * Gráfico dos relatórios em 3D (three.js) com alternativa 2D, uma cor por regional.
 *
 * - "meses": gasto por mês × regional (x = mês, z = regional); o mês escolhido fica aceso.
 * - "calendario": solicitações por dia (x = dia da semana, z = semana), empilhadas por regional; hoje marcado.
 *
 * Legenda clicável (liga/desliga regional), detalhe ao clicar numa coluna, vistas prontas, girar sozinho,
 * tela cheia e imagem PNG completa (com rótulos e legenda). Sem WebGL, fica só no 2D.
 */

export type Grafico3DProps = {
  kind: "meses" | "calendario";
  title: string;
  note: string;
  /** Período e filtros, vai no PNG. */
  meta: string;
  fileName: string;
  series: Serie[];
  cells: Cell[];
  xLabels: string[];
  zLabels: string[];
  /** Título de cada célula (mesma ordem de `cells`). */
  cellTitles: string[];
  highlightX?: number | null;
  todayIndex?: number | null;
  format: "money" | "count";
  emptyText: string;
};

const MODE_KEY = "relatorios.grafico.modo";
type Row = { label: string; value: string; color?: string };
const noSubscribe = () => () => {};
type Tip = { cell: number; x: number; y: number; title?: string; rows?: Row[] };
const serieColor = (i: number) => `var(--serie-${(i % 8) + 1})`;
const cssVar = (i: number) => getComputedStyle(document.documentElement).getPropertyValue(`--serie-${(i % 8) + 1}`).trim();

export function Grafico3D(p: Grafico3DProps) {
  const t = useT();
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const flatRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SceneApi | null>(null);
  // Preferência 3D/2D fica salva no navegador; sem WebGL, sempre 2D.
  const stored = useSyncExternalStore(noSubscribe, () => localStorage.getItem(MODE_KEY), () => null);
  const [modeChoice, setModeChoice] = useState<"3d" | "2d" | null>(null);
  const [no3d, setNo3d] = useState(false);
  const mode: "3d" | "2d" = no3d ? "2d" : (modeChoice ?? (stored === "2d" ? "2d" : "3d"));
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [spin, setSpin] = useState(false);
  const [cam, setCam] = useState<CamName>("iso");
  const [full, setFull] = useState(false);
  const hiddenRef = useRef(hidden);
  const selectedRef = useRef(selected);

  const nf = useMemo(() => new Intl.NumberFormat(t.locale, { maximumFractionDigits: 1 }), [t.locale]);
  const money = useMemo(() => new Intl.NumberFormat(t.locale, { style: "currency", currency: "BRL" }), [t.locale]);
  const compact = useMemo(() => new Intl.NumberFormat(t.locale, { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }), [t.locale]);
  const fmt = useCallback((v: number) => (p.format === "money" ? money.format(v) : nf.format(v)), [p.format, money, nf]);
  const fmtShort = useCallback((v: number) => (p.format === "money" ? compact.format(v) : nf.format(Math.round(v))), [p.format, compact, nf]);

  const visSum = useCallback((c: Cell, h: Set<number>) => c.values.reduce((s, v, i) => s + (h.has(i) ? 0 : v), 0), []);
  const empty = p.series.length === 0;

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === sectionRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Muda só quando os dados mudam (troca de mês/filtro), não a cada render.
  const dataKey = useMemo(() => p.cells.map((c) => `${c.key}=${c.values.join(",")}`).join("|") + p.xLabels.join(","), [p.cells, p.xLabels]);
  const fmtShortRef = useRef(fmtShort);
  useEffect(() => {
    fmtShortRef.current = fmtShort;
  }, [fmtShort]);
  // Trocou mês/filtro: o detalhe fixado deixa de valer.
  const [selKey, setSelKey] = useState(dataKey);
  if (selKey !== dataKey) {
    setSelKey(dataKey);
    setSelected(null);
  }

  useEffect(() => {
    if (mode !== "3d" || no3d || empty || !stageRef.current) return;
    let api: SceneApi | null = null;
    let cancelled = false;
    const el = stageRef.current;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    import("./cena-3d")
      .then(({ createScene }) => {
        if (cancelled) return;
        try {
          api = createScene(el, {
            xLabels: p.xLabels,
            zLabels: p.zLabels,
            cells: p.cells,
            highlightX: p.highlightX ?? null,
            todayIndex: p.todayIndex ?? null,
            maxH: p.kind === "meses" ? 5.2 : 3.6,
            ticks: p.kind === "meses" ? 5 : 4,
            fmtTick: (v) => fmtShortRef.current(v),
            integer: p.format === "count",
            valueLabel: p.kind === "meses" ? (ci, h) => (h.has(p.cells[ci].z) || !p.cells[ci].values[p.cells[ci].z] ? "" : fmtShortRef.current(p.cells[ci].values[p.cells[ci].z])) : undefined,
            reduced,
            onHover: (cell, e) => setTip(cell == null ? null : { cell, x: e.clientX, y: e.clientY }),
            onSelect: setSelected,
            onSpin: setSpin,
          });
        } catch {
          setNo3d(true);
          return;
        }
        api.setHidden(hiddenRef.current);
        api.select(selectedRef.current);
        apiRef.current = api;
      })
      .catch(() => setNo3d(true));
    const mo = new MutationObserver(() => apiRef.current?.paint());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      cancelled = true;
      mo.disconnect();
      api?.dispose();
      apiRef.current = null;
      setTip(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dataKey resume p.cells/xLabels; o resto vem por ref
  }, [mode, no3d, empty, dataKey]);

  useEffect(() => {
    hiddenRef.current = hidden;
    apiRef.current?.setHidden(hidden);
  }, [hidden]);
  useEffect(() => {
    selectedRef.current = selected;
    apiRef.current?.select(selected);
  }, [selected]);

  const toggleSerie = (s: number) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });
  const changeMode = (m: "3d" | "2d") => {
    setModeChoice(m);
    localStorage.setItem(MODE_KEY, m);
  };

  // Totais da legenda: mês destacado (meses) ou mês inteiro (calendário).
  const totals = p.series.map((_, s) =>
    p.cells.reduce((sum, c) => sum + (p.kind === "meses" ? (c.x === p.highlightX ? c.values[s] : 0) : c.values[s]), 0),
  );

  function rowsFor(ci: number): Row[] {
    const c = p.cells[ci];
    if (p.kind === "meses") {
      const s = c.z;
      const v = c.values[s];
      const mesTotal = p.cells.filter((o) => o.x === c.x).reduce((sum, o) => sum + visSum(o, hidden), 0);
      const prev = p.cells.find((o) => o.z === s && o.x === c.x - 1)?.values[s];
      const serie = p.cells.filter((o) => o.z === s && o.x <= c.x).map((o) => o.values[s]);
      const delta = prev ? ((v - prev) / prev) * 100 : null;
      return [
        { label: t("grafico3d.gasto"), value: money.format(v), color: serieColor(s) },
        { label: t("grafico3d.participacao"), value: mesTotal && !hidden.has(s) ? `${nf.format((v / mesTotal) * 100)}%` : "—" },
        { label: t("grafico3d.vsAnterior"), value: delta == null ? "—" : `${delta >= 0 ? "+" : ""}${nf.format(delta)}%` },
        { label: t("grafico3d.media"), value: money.format(serie.reduce((a, b) => a + b, 0) / serie.length) },
      ];
    }
    return [
      { label: t("grafico3d.total"), value: nf.format(visSum(c, hidden)) },
      ...p.series.map((s, i) => ({ label: s.code, value: hidden.has(i) ? t("grafico3d.oculto") : nf.format(c.values[i]), color: serieColor(i) })),
    ];
  }

  function exportPng() {
    const area = mode === "3d" ? stageRef.current : flatRef.current;
    if (!area) return;
    const cv = buildPng(
      area,
      {
        title: p.title,
        note: p.note,
        meta: p.meta,
        brand: t("grafico3d.marca"),
        generated: t("grafico3d.geradoEm", { quando: new Date().toLocaleString(t.locale, { dateStyle: "short", timeStyle: "short" }) }),
        legend: p.series.flatMap((s, i) => (hidden.has(i) ? [] : [{ color: cssVar(i), label: `${s.code} · ${s.name}`, total: fmt(totals[i]) }])),
        fileName: p.fileName,
      },
      mode === "3d" ? (apiRef.current?.snapshot() ?? null) : null,
    );
    downloadCanvas(cv, `${p.fileName}-${mode}.png`);
  }

  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : sectionRef.current?.requestFullscreen?.());
  const tool = "inline-flex size-8 items-center justify-center rounded-lg border bg-card text-foreground transition-colors hover:bg-muted [&_svg]:size-4";
  const seg = "inline-flex overflow-hidden rounded-lg border bg-muted";
  const segBtn = (on: boolean, accent = false) =>
    cn("px-2.5 py-1 text-xs font-semibold transition-colors", on ? (accent ? "bg-primary text-primary-foreground" : "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--border)]") : "text-muted-foreground hover:text-foreground");

  return (
    <section ref={sectionRef} className={cn("overflow-hidden rounded-[14px] border bg-card shadow-xs", full && "flex flex-col rounded-none")}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-[18px] pt-4 pb-3">
        <div>
          <h2 className="text-[15px] font-semibold">{p.title}</h2>
          <p className="text-xs text-muted-foreground">{p.note}</p>
        </div>
        {!empty && (
          <div className="flex flex-wrap items-center gap-1.5">
            {mode === "3d" && (
              <>
                <div className={seg} role="group" aria-label={t("grafico3d.vista")}>
                  {(["iso", "front", "top"] as CamName[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={segBtn(cam === c)}
                      onClick={() => {
                        setCam(c);
                        apiRef.current?.goCam(c);
                      }}
                    >
                      {t(`grafico3d.cam.${c}`)}
                    </button>
                  ))}
                </div>
                <button type="button" className={cn(tool, spin && "text-primary")} title={t("grafico3d.girar")} aria-label={t("grafico3d.girar")} aria-pressed={spin} onClick={() => apiRef.current?.setSpin(!spin)}>
                  <RotateCw />
                </button>
              </>
            )}
            <button type="button" className={tool} title={t("grafico3d.salvarPng")} aria-label={t("grafico3d.salvarPng")} onClick={exportPng}>
              <Download />
            </button>
            {mode === "3d" && (
              <button type="button" className={tool} title={t("grafico3d.telaCheia")} aria-label={t("grafico3d.telaCheia")} onClick={toggleFull}>
                {full ? <Minimize2 /> : <Maximize2 />}
              </button>
            )}
            {!no3d && (
              <div className={seg} role="group" aria-label={t("grafico3d.modo")}>
                <button type="button" className={segBtn(mode === "3d", true)} onClick={() => changeMode("3d")}>
                  3D
                </button>
                <button type="button" className={segBtn(mode === "2d", true)} onClick={() => changeMode("2d")}>
                  2D
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {empty ? (
        <p className="px-[18px] pt-1 pb-6 text-sm text-muted-foreground">{p.emptyText}</p>
      ) : (
        <div className={cn("grid border-t lg:grid-cols-[minmax(0,1fr)_250px]", full && "flex-1")}>
          <div className="min-w-0">
            {mode === "3d" ? (
              <div ref={stageRef} className={cn("relative overflow-hidden", full ? "h-[calc(100vh-90px)]" : "h-[420px]")}>
                <div data-png-skip className="pointer-events-none absolute bottom-2.5 left-3.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Box className="size-3.5" /> {t(p.kind === "meses" ? "grafico3d.dicaMeses" : "grafico3d.dicaDias")}
                </div>
              </div>
            ) : (
              <div ref={flatRef} className="px-[18px] pt-4 pb-4">
                {no3d && <p className="mb-2 text-xs text-muted-foreground">{t("grafico3d.sem3d")}</p>}
                <Flat2D {...p} hidden={hidden} fmt={fmt} fmtShort={fmtShort} onTip={setTip} totalLabel={t("grafico3d.total")} hiddenLabel={t("grafico3d.oculto")} />
              </div>
            )}
          </div>
          <aside className="flex flex-col gap-3 border-t px-4 py-3.5 lg:border-t-0 lg:border-l">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("grafico3d.regionais")}</h3>
            <div className="flex flex-col gap-1.5">
              {p.series.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={!hidden.has(i)}
                  title={t("grafico3d.dicaLegenda")}
                  onClick={() => toggleSerie(i)}
                  className={cn("flex items-center gap-2 rounded-lg border bg-muted/60 px-2.5 py-1.5 text-left text-[13px] transition-opacity hover:bg-muted", hidden.has(i) && "opacity-45")}
                >
                  <span className="size-2.5 shrink-0 rounded-[3px]" style={hidden.has(i) ? { outline: "1.5px solid var(--muted-foreground)" } : { background: serieColor(i) }} />
                  <span className="min-w-0 flex-1 truncate">
                    {s.code} · {s.name}
                  </span>
                  <b className="text-xs tabular-nums">{fmtShort(totals[i])}</b>
                </button>
              ))}
            </div>
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("grafico3d.detalhe")}</h3>
            <div className="min-h-28 rounded-xl border bg-muted/60 p-3 text-xs">
              {selected == null || mode === "2d" ? (
                <p className="text-muted-foreground">{t(p.kind === "meses" ? "grafico3d.cliqueColuna" : "grafico3d.cliqueDia")}</p>
              ) : (
                <>
                  <p className="mb-1.5 text-[13px] font-semibold">{p.cellTitles[selected]}</p>
                  {rowsFor(selected).map((r, i) => (
                    <div key={i} className="flex justify-between gap-3 py-0.5 text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        {r.color && <span className="size-2 rounded-[2px]" style={{ background: r.color }} />}
                        {r.label}
                      </span>
                      <b className="text-foreground tabular-nums">{r.value}</b>
                    </div>
                  ))}
                </>
              )}
            </div>
          </aside>
        </div>
      )}
      {tip &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[80] w-max max-w-[260px] min-w-40 rounded-xl border border-input bg-popover px-3 py-2.5 text-[12.5px] text-popover-foreground shadow-lg"
            style={{ left: Math.max(8, tip.x + 274 > window.innerWidth ? tip.x - 274 : tip.x + 14), top: Math.max(8, tip.y + 174 > window.innerHeight ? tip.y - 174 : tip.y + 14) }}
          >
            <p className="mb-1.5 text-[13px] font-semibold">{tip.title ?? p.cellTitles[tip.cell]}</p>
            {(tip.rows ?? rowsFor(tip.cell)).map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-0.5 text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  {r.color && <span className="size-2 rounded-[2px]" style={{ background: r.color }} />}
                  {r.label}
                </span>
                <span className="font-semibold text-foreground tabular-nums">{r.value}</span>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </section>
  );
}

/** 2D: colunas empilhadas por regional (meses: uma por mês; calendário: uma por dia). */
function Flat2D(
  p: Grafico3DProps & {
    hidden: Set<number>;
    fmt: (v: number) => string;
    fmtShort: (v: number) => string;
    onTip: (tip: Tip | null) => void;
    totalLabel: string;
    hiddenLabel: string;
  },
) {
  const meses = p.kind === "meses";
  // Meses: soma as células do mesmo x numa coluna só (a "célula" do tooltip é a da maior regional).
  const cols = meses
    ? p.xLabels.map((label, x) => {
        const idx = p.cells.flatMap((c, i) => (c.x === x ? [i] : []));
        const values = p.series.map((_, s) => idx.reduce((sum, i) => sum + p.cells[i].values[s], 0));
        return { key: label, label, values, tipCell: idx[0] ?? 0, dim: p.highlightX != null && x !== p.highlightX, strong: x === p.highlightX, future: false };
      })
    : p.cells.map((c, i) => ({
        key: c.key,
        label: c.day === 1 || (c.day ?? 0) % 5 === 0 || i === p.todayIndex ? String(c.day) : "",
        values: c.values,
        tipCell: i,
        dim: false,
        strong: i === p.todayIndex,
        future: !!c.future,
      }));
  const totalOf = (v: number[]) => v.reduce((s, x, i) => s + (p.hidden.has(i) ? 0 : x), 0);
  const raw = Math.max(1, ...cols.map((c) => totalOf(c.values)));
  // Contagens: régua em degraus inteiros (4 linhas).
  const max = p.format === "count" ? Math.ceil(raw / 4) * 4 : raw;
  return (
    <div className={cn("relative flex items-end", meses ? "h-72 gap-3.5 pl-14" : "h-56 gap-[3px] pl-7")}>
      <div className="pointer-events-none absolute inset-0 bottom-[22px]">
        {[1, 0.75, 0.5, 0.25].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-dashed border-border text-[10px] text-muted-foreground" style={{ top: `${(1 - f) * 100}%` }}>
            <span className="absolute -top-2 left-0 bg-card pr-1 tabular-nums">{p.fmtShort(max * f)}</span>
          </div>
        ))}
      </div>
      {cols.map((c) => {
        const tot = totalOf(c.values);
        return (
          <div
            key={c.key}
            className="relative z-[1] flex h-full flex-1 flex-col items-center justify-end gap-1 text-[11px] text-muted-foreground"
            onMouseMove={(e) =>
              p.onTip(
                !tot
                  ? null
                  : meses
                    ? {
                        cell: c.tipCell,
                        x: e.clientX,
                        y: e.clientY,
                        title: c.label,
                        rows: [
                          { label: p.totalLabel, value: p.fmt(tot) },
                          ...p.series.map((s, i) => ({ label: s.code, value: p.hidden.has(i) ? p.hiddenLabel : p.fmt(c.values[i]), color: serieColor(i) })),
                        ],
                      }
                    : { cell: c.tipCell, x: e.clientX, y: e.clientY },
              )
            }
            onMouseLeave={() => p.onTip(null)}
          >
            {meses && <span className="font-semibold text-foreground tabular-nums">{tot ? p.fmtShort(tot) : "—"}</span>}
            <div
              className={cn("flex w-full flex-col-reverse overflow-hidden transition-[height] duration-500", meses ? "max-w-16 rounded-t-[7px]" : "rounded-t-[3px]", c.dim && "opacity-55")}
              style={{ height: `${tot ? (tot / max) * (meses ? 82 : 90) : 0}%` }}
            >
              {c.values.map((v, s) => (p.hidden.has(s) || !v ? null : <div key={s} style={{ flex: `${v} 1 0`, background: serieColor(s) }} />))}
            </div>
            <span className={cn("tabular-nums", c.strong && (meses ? "font-bold text-foreground" : "font-bold text-primary"))}>{c.label || " "}</span>
          </div>
        );
      })}
    </div>
  );
}
