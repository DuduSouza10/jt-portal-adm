/**
 * Imagem PNG de um gráfico dos relatórios, pronta para mandar ou colar em apresentação:
 * cabeçalho (título, descrição, período/filtros, marca e data), o gráfico com TODOS os rótulos
 * (eixos, régua, valores) e a legenda com as cores e totais.
 *
 * O 3D é o quadro do WebGL; os rótulos e o 2D são HTML, então são redesenhados no canvas a partir
 * da posição e do estilo que têm na tela.
 */

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

/** Redesenha num canvas os fundos, bordas e textos de um pedaço da tela. */
function drawDom(ctx: CanvasRenderingContext2D, root: HTMLElement, origin: DOMRect) {
  const opacityOf = (el: Element) => {
    let o = 1;
    for (let e: Element | null = el; e && e !== root.parentElement; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    return o;
  };
  const range = document.createRange();
  for (const el of [root, ...root.querySelectorAll<HTMLElement>("*")]) {
    if (el.tagName === "CANVAS" || el.closest("[data-png-skip]") || !el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    const x = r.left - origin.left;
    const y = r.top - origin.top;
    ctx.globalAlpha = opacityOf(el);
    const rad = parseFloat(cs.borderTopLeftRadius) || 0;
    if (el !== root && cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) {
      ctx.fillStyle = cs.backgroundColor;
      ctx.beginPath();
      ctx.roundRect(x, y, r.width, r.height, Math.min(rad, r.height / 2));
      ctx.fill();
    }
    const bw = parseFloat(cs.borderTopWidth) || 0;
    if (bw && cs.borderTopStyle === "dashed") {
      ctx.strokeStyle = cs.borderTopColor;
      ctx.lineWidth = bw;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, y + 0.5);
      ctx.lineTo(x + r.width, y + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (bw && cs.borderTopStyle === "solid" && parseFloat(cs.borderLeftWidth)) {
      ctx.strokeStyle = cs.borderTopColor;
      ctx.lineWidth = bw;
      ctx.beginPath();
      ctx.roundRect(x + 0.5, y + 0.5, r.width - 1, r.height - 1, rad);
      ctx.stroke();
    }
    for (const n of el.childNodes) {
      if (n.nodeType !== Node.TEXT_NODE || !n.textContent?.trim()) continue;
      range.selectNodeContents(n);
      const tr = range.getBoundingClientRect();
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      ctx.fillStyle = cs.color;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(n.textContent.trim(), tr.left - origin.left, tr.top - origin.top + tr.height / 2);
    }
  }
  ctx.globalAlpha = 1;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  for (const w of text.split(" ")) {
    const last = lines.length - 1;
    if (last >= 0 && ctx.measureText(`${lines[last]} ${w}`).width <= width) lines[last] += ` ${w}`;
    else lines.push(w);
  }
  return lines;
}

export type PngInfo = {
  title: string;
  note: string;
  /** Período e filtros ("Novembro de 2026 · filtrando por MG"). */
  meta: string;
  brand: string;
  generated: string;
  legend: { color: string; label: string; total: string }[];
  fileName: string;
};

/** Monta o PNG. `area` é o palco do gráfico (3D ou 2D); `snapshot` é o quadro do WebGL, se for 3D. */
export function buildPng(area: HTMLElement, info: PngInfo, snapshot: HTMLCanvasElement | null) {
  const S = 2;
  const pad = 28;
  const ar = area.getBoundingClientRect();
  const W = Math.round(ar.width);
  const H = Math.round(ar.height);
  const font = getComputedStyle(document.body).fontFamily;
  const m = document.createElement("canvas").getContext("2d")!;
  m.font = `400 12px ${font}`;
  const sub = wrap(m, info.note, W - 220);
  const headH = 80 + sub.length * 16;
  m.font = `500 12px ${font}`;
  // Legenda em linhas, quebrando quando não cabe.
  const legRows: { x: number; item: PngInfo["legend"][number] }[][] = [[]];
  let lx = 0;
  for (const item of info.legend) {
    m.font = `500 12px ${font}`;
    const w1 = m.measureText(item.label).width;
    m.font = `700 12px ${font}`;
    const w = 46 + w1 + m.measureText(item.total).width;
    if (lx && lx + w > W) {
      legRows.push([]);
      lx = 0;
    }
    legRows[legRows.length - 1].push({ x: lx, item });
    lx += w;
  }
  const legH = 26 + legRows.length * 22;
  const footH = 30;
  const TW = W + pad * 2;
  const TH = headH + H + legH + footH;

  const cv = document.createElement("canvas");
  cv.width = TW * S;
  cv.height = TH * S;
  const ctx = cv.getContext("2d")!;
  ctx.scale(S, S);
  ctx.fillStyle = css("--card");
  ctx.fillRect(0, 0, TW, TH);
  ctx.fillStyle = css("--primary");
  ctx.fillRect(0, 0, TW, 4);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = css("--foreground");
  ctx.font = `700 19px ${font}`;
  ctx.fillText(info.title, pad, 36);
  ctx.fillStyle = css("--muted-foreground");
  ctx.font = `400 12px ${font}`;
  sub.forEach((t, i) => ctx.fillText(t, pad, 56 + i * 16));
  ctx.fillStyle = css("--foreground");
  ctx.font = `600 12px ${font}`;
  ctx.fillText(info.meta, pad, 60 + sub.length * 16);
  ctx.textAlign = "right";
  ctx.font = `700 12px ${font}`;
  ctx.fillText(info.brand, W + pad, 34);
  ctx.fillStyle = css("--muted-foreground");
  ctx.font = `400 11px ${font}`;
  ctx.fillText(info.generated, W + pad, 52);
  ctx.textAlign = "left";

  ctx.save();
  ctx.translate(pad, headH);
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 12);
  ctx.clip();
  if (snapshot) ctx.drawImage(snapshot, 0, 0, W, H);
  drawDom(ctx, area, ar);
  ctx.restore();
  ctx.strokeStyle = css("--border");
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(pad + 0.5, headH + 0.5, W - 1, H - 1, 12);
  ctx.stroke();

  legRows.forEach((row, ri) => {
    const ly = headH + H + 30 + ri * 22;
    for (const { x, item } of row) {
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.roundRect(pad + x, ly - 10, 12, 12, 3);
      ctx.fill();
      ctx.fillStyle = css("--foreground");
      ctx.font = `500 12px ${font}`;
      ctx.fillText(item.label, pad + x + 18, ly);
      const w1 = ctx.measureText(item.label).width;
      ctx.font = `700 12px ${font}`;
      ctx.fillText(item.total, pad + x + 26 + w1, ly);
    }
  });
  return cv;
}

export function downloadCanvas(cv: HTMLCanvasElement, fileName: string) {
  const a = document.createElement("a");
  a.download = fileName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "-").toLowerCase();
  a.href = cv.toDataURL("image/png");
  a.click();
}
