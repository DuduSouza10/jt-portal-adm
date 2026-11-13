// Gera src/components/brasil-mapa-dados.ts: o Brasil em pontos (um único path) e as coordenadas das rotas.
// Contorno simplificado (lon, lat), só para a ilustração do login. Rodar: node scripts/gen-mapa-brasil.mjs
import { writeFileSync } from "node:fs";

const CONTORNO = [
  [-51.5, 4.2], [-54.0, 2.3], [-56.0, 2.0], [-59.8, 1.9], [-60.7, 5.2], [-61.5, 4.3], [-64.8, 4.0], [-67.0, 1.8],
  [-69.9, 1.1], [-69.5, -1.0], [-69.9, -4.2], [-73.5, -7.3], [-73.0, -9.0], [-70.5, -11.0], [-65.3, -9.8],
  [-65.0, -11.5], [-60.5, -13.7], [-60.2, -15.5], [-58.4, -16.3], [-58.2, -18.2], [-57.7, -20.0], [-58.2, -22.0],
  [-55.7, -22.2], [-55.6, -24.0], [-54.6, -25.6], [-53.7, -26.2], [-54.8, -27.5], [-57.6, -30.2], [-55.0, -31.9],
  [-53.4, -33.7], [-52.0, -32.2], [-50.2, -30.0], [-48.7, -28.0], [-48.5, -26.0], [-47.5, -24.8], [-44.8, -23.4],
  [-42.0, -22.9], [-41.0, -21.8], [-40.0, -19.5], [-39.7, -17.8], [-38.9, -15.8], [-38.5, -13.0], [-37.0, -11.0],
  [-35.2, -9.0], [-34.8, -7.2], [-35.2, -5.5], [-37.0, -4.8], [-39.5, -3.0], [-42.0, -2.8], [-44.5, -2.4],
  [-47.0, -0.7], [-48.5, -1.0], [-50.0, 0.0], [-50.0, 1.8],
];
// Pontos de passagem (almoxarifado de origem e bases). Sem nomes: é só ilustração.
const HUB = [-46.6, -23.5];
const BASES = [
  [-43.9, -19.9], [-43.2, -22.9], [-49.3, -25.4], [-51.2, -30.0], [-47.9, -15.8], [-56.1, -15.6],
  [-38.5, -13.0], [-34.9, -8.0], [-38.5, -3.7], [-48.5, -1.45], [-60.0, -3.1],
];

const LON0 = -74.5, LON1 = -33.5, LAT0 = 5.6, LAT1 = -34.2; // caixa
const K = Math.cos((15 * Math.PI) / 180); // achata a longitude (latitude média)
const W = 800, STEP = 15; // largura do viewBox e espaço entre pontos
const sx = W / ((LON1 - LON0) * K);
const H = Math.round((LAT0 - LAT1) * sx);
const px = ([lon, lat]) => [((lon - LON0) * K) * sx, (LAT0 - lat) * sx].map((v) => +v.toFixed(1));

const poly = CONTORNO.map(px);
function dentro([x, y]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const pts = [];
for (let r = 0, y = STEP / 2; y < H; y += STEP * 0.866, r++) {
  for (let x = (r % 2 ? STEP / 2 : 0) + STEP / 2; x < W; x += STEP) if (dentro([x, y])) pts.push([+x.toFixed(1), +y.toFixed(1)]);
}
const d = pts.map(([x, y]) => `M${x} ${y}h0`).join("");
const hub = px(HUB), bases = BASES.map(px);
// Arco do hub até a base: curva quadrática com o controle levantado.
const arco = ([x, y]) => {
  const [hx, hy] = hub, mx = (hx + x) / 2, my = (hy + y) / 2, dist = Math.hypot(x - hx, y - hy);
  return `M${hx} ${hy}Q${+mx.toFixed(1)} ${+(my - dist * 0.28).toFixed(1)} ${x} ${y}`;
};
const out = `// GERADO por scripts/gen-mapa-brasil.mjs — não editar à mão.
export const BRASIL_VIEWBOX = { w: ${W}, h: ${H} } as const;
export const BRASIL_PONTOS = ${JSON.stringify(d)};
export const BRASIL_HUB = ${JSON.stringify(hub)} as const;
export const BRASIL_BASES = ${JSON.stringify(bases)} as const;
export const BRASIL_ARCOS = ${JSON.stringify(bases.map(arco))} as const;
`;
writeFileSync(new URL("../src/components/brasil-mapa-dados.ts", import.meta.url), out);
console.log("pontos:", pts.length, "viewBox", W, H, "bytes", out.length);
