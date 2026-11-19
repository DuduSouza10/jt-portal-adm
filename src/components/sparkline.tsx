/** Mini-gráfico de linha (sem eixos) para os cartões do início. Cor pelos tokens do tema. */
export function Sparkline({ data, className = "text-primary", label }: { data: number[]; className?: string; label: string }) {
  const w = 96;
  const h = 32;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / Math.max(data.length - 1, 1)) * (w - 6) + 3, h - 4 - ((v - min) / span) * (h - 8)] as const);
  const last = pts[pts.length - 1]!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className={`h-8 w-24 shrink-0 ${className}`}>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="currentColor" />
    </svg>
  );
}
