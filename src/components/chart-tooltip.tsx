"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export type TipRow = { label: string; value?: string; color?: string };

/**
 * Cartão de detalhes que segue o mouse enquanto ele está sobre um gráfico (barra, coluna, ponto).
 * Use em todo gráfico do portal: envolva a marca e passe título, linhas e nota.
 *
 *   <ChartTooltip title="Luva M · ALM-MG" rows={[{ label: "Disponível", value: "17", color: "var(--warning)" }]}>
 *     <div className="h-1.5 rounded-full bg-muted">…</div>
 *   </ChartTooltip>
 */
export function ChartTooltip({
  title,
  rows = [],
  note,
  children,
  className,
}: {
  title: string;
  rows?: TipRow[];
  note?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  return (
    <div
      className={cn("cursor-help", className)}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && createPortal(<TipCard x={pos.x} y={pos.y} title={title} rows={rows} note={note} />, document.body)}
    </div>
  );
}

const W = 260;
const PAD = 14;

function TipCard({ x, y, title, rows, note }: { x: number; y: number; title: string; rows: TipRow[]; note?: string }) {
  // Vira para o outro lado perto da borda da tela.
  const left = x + PAD + W > window.innerWidth - 8 ? x - PAD - W : x + PAD;
  const top = y + PAD + 160 > window.innerHeight ? y - PAD - 160 : y + PAD;
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[80] w-max max-w-[260px] min-w-40 rounded-xl border border-input bg-popover px-3 py-2.5 text-[12.5px] text-popover-foreground shadow-lg"
      style={{ left: Math.max(8, left), top: Math.max(8, top) }}
    >
      <p className="mb-1.5 text-[13px] font-semibold">{title}</p>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5 text-muted-foreground">
          <span className="flex items-center gap-1.5">
            {r.color && <span className="size-2 rounded-[2px]" style={{ background: r.color }} />}
            {r.label}
          </span>
          {r.value !== undefined && <span className="font-semibold whitespace-nowrap text-foreground tabular-nums">{r.value}</span>}
        </div>
      ))}
      {note && <p className="mt-1.5 border-t pt-1.5 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
