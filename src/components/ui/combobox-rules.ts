/**
 * Regras puras dos seletores do portal (Combobox e SelectBox): normalização, filtro com ordem de relevância,
 * trechos para destacar o que foi digitado e leitura dos <option> filhos. Testadas em combobox-rules.test.ts.
 */
import { Children, Fragment, isValidElement, type ReactNode } from "react";

export type ComboOption = {
  value: string;
  label: string;
  /** Etiqueta curta à esquerda (ex.: código do produto). Entra na busca. */
  hint?: string;
  /** Linha pequena abaixo do nome. Entra na busca. */
  description?: string;
  /** Texto à direita (ex.: "120 disponíveis"). */
  meta?: string;
  /** Realça o `meta` em vermelho (ex.: sem estoque). */
  metaTone?: "default" | "danger";
  disabled?: boolean;
};

const MARKS = /[̀-ͯ]/g;

/** minúsculas e sem acento: "Almoxarifado" casa com "almoxarifado" e "ALMOXARIFADO". */
export const normalize = (s: string) => s.normalize("NFD").replace(MARKS, "").toLowerCase();

/** 0 = melhor. Começa pelo código > começa pelo nome > começa por uma palavra > contém > só na descrição. */
function score(o: ComboOption, term: string): number {
  const hint = normalize(o.hint ?? "");
  const label = normalize(o.label);
  if (hint.startsWith(term)) return 0;
  if (label.startsWith(term)) return 1;
  if (label.split(/[\s\-—·/]+/).some((w) => w.startsWith(term))) return 2;
  if (hint.includes(term) || label.includes(term)) return 3;
  return 4;
}

/** Filtra e ordena. Vários termos ("fita 48"): todos precisam aparecer (em qualquer ordem). Busca vazia = tudo, na ordem original. */
export function filterOptions(options: ComboOption[], query: string): ComboOption[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return options;
  const out: { o: ComboOption; s: number; i: number }[] = [];
  options.forEach((o, i) => {
    const hay = normalize(`${o.hint ?? ""} ${o.label} ${o.description ?? ""}`);
    if (terms.every((t) => hay.includes(t))) out.push({ o, s: score(o, terms[0]), i });
  });
  return out.sort((a, b) => a.s - b.s || a.i - b.i).map((x) => x.o);
}

/** Divide o texto em pedaços, marcando os que casam com a busca (sem diferenciar acento nem maiúscula). */
export function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length || !text) return [{ text, match: false }];
  // normaliza letra a letra, guardando de onde cada letra veio (acento solto some, mas o índice original fica)
  let norm = "";
  const origin: number[] = [];
  [...text].forEach((ch, idx) => {
    const n = normalize(ch);
    for (let k = 0; k < n.length; k++) origin.push(idx);
    norm += n;
  });
  const chars = [...text];
  const marked = new Array<boolean>(chars.length).fill(false);
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = norm.indexOf(term, from);
      if (at < 0) break;
      for (let k = at; k < at + term.length; k++) marked[origin[k]] = true;
      from = at + term.length;
    }
  }
  const parts: { text: string; match: boolean }[] = [];
  chars.forEach((ch, i) => {
    const last = parts[parts.length - 1];
    if (last && last.match === marked[i]) last.text += ch;
    else parts.push({ text: ch, match: marked[i] });
  });
  return parts;
}

/** Texto puro de um conteúdo React (o que estava dentro do <option>). */
export function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

/**
 * Lê os <option> filhos (como num <select> comum) e devolve as opções. O <option value="" disabled> vira
 * o texto de "nada escolhido" (placeholder) e não aparece na lista.
 */
export function optionsFromChildren(children: ReactNode): { options: ComboOption[]; placeholder: string | null } {
  const options: ComboOption[] = [];
  let placeholder: string | null = null;
  const walk = (nodes: ReactNode) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      if (child.type === Fragment) return walk((child.props as { children?: ReactNode }).children);
      if (child.type !== "option") return;
      const p = child.props as { value?: string | number; disabled?: boolean; children?: ReactNode };
      const label = textOf(p.children).replace(/\s+/g, " ").trim();
      const value = p.value === undefined ? label : String(p.value);
      if (value === "" && p.disabled) placeholder = label;
      else options.push({ value, label, disabled: p.disabled });
    });
  };
  walk(children);
  return { options, placeholder };
}
