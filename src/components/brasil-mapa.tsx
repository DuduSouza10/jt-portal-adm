import { BRASIL_ARCOS, BRASIL_BASES, BRASIL_HUB, BRASIL_PONTOS, BRASIL_VIEWBOX } from "./brasil-mapa-dados";

/**
 * Ilustração do login: o Brasil em pontos, com rotas que saem do almoxarifado até as bases.
 * Só decoração (aria-hidden). Usa `currentColor`, então a cor vem da classe do pai.
 * O movimento é um só: as rotas se desenham ao abrir a tela e duas encomendas percorrem as linhas.
 * Animações em `globals.css` (`.rota-*`); com "reduzir movimento" fica tudo parado e desenhado.
 */

/** Rotas por onde as encomendas andam (índices em BRASIL_ARCOS) e quando cada uma parte. */
const ENCOMENDAS = [
  { arco: 6, inicio: "3.2s", duracao: "5.5s" },
  { arco: 0, inicio: "6.4s", duracao: "4.5s" },
];

export function BrasilMapa({ className }: { className?: string }) {
  const [hx, hy] = BRASIL_HUB;
  return (
    <svg aria-hidden focusable="false" viewBox={`0 0 ${BRASIL_VIEWBOX.w} ${BRASIL_VIEWBOX.h}`} fill="none" className={className}>
      <path d={BRASIL_PONTOS} stroke="currentColor" strokeOpacity={0.42} strokeWidth={3.6} strokeLinecap="round" />
      {BRASIL_ARCOS.map((d, i) => (
        <path
          key={d}
          d={d}
          pathLength={1}
          stroke="currentColor"
          strokeOpacity={0.8}
          strokeWidth={1.6}
          strokeLinecap="round"
          className="rota-arco"
          style={{ animationDelay: `${0.5 + i * 0.14}s` }}
        />
      ))}
      {BRASIL_BASES.map(([x, y], i) => (
        <circle key={`${x}:${y}`} cx={x} cy={y} r={4.5} fill="currentColor" className="rota-no" style={{ animationDelay: `${1.3 + i * 0.14}s` }} />
      ))}
      <circle cx={hx} cy={hy} r={11} fill="currentColor" fillOpacity={0.25} className="rota-halo" />
      <circle cx={hx} cy={hy} r={7} fill="currentColor" />
      {ENCOMENDAS.map((e) => (
        <circle key={e.arco} r={5.5} fill="currentColor" opacity={0} className="rota-pacote">
          <animateMotion path={BRASIL_ARCOS[e.arco]} begin={e.inicio} dur={e.duracao} repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.45 0 0.55 1" />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.92;1" begin={e.inicio} dur={e.duracao} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
}
