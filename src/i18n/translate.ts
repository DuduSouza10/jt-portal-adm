import type { Locale } from "./config";
import { ptBR, type Messages } from "./messages/pt-BR";
import { zhCN } from "./messages/zh-CN";

/** Todas as chaves de texto, ex.: "comum.salvar" | "estoque.saldos.titulo". O TypeScript recusa chave errada. */
export type MessageKey = Leaves<Messages>;
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : T[K] extends Record<string, unknown> ? Leaves<T[K], `${P}${K}.`> : never;
}[keyof T & string];

export type Params = Record<string, string | number>;
export type Translator = ((key: MessageKey, params?: Params) => string) & {
  locale: Locale;
  messages: Messages;
  /** Para chaves montadas em tempo de execução: devolve undefined (em vez da chave) se não existir. */
  maybe: (key: string, params?: Params) => string | undefined;
};

const CATALOG: Record<Locale, Messages> = { "pt-BR": ptBR, "zh-CN": zhCN };

export const messagesFor = (locale: Locale): Messages => CATALOG[locale];

/** Troca {nome} pelos valores. Placeholder sem valor fica como está (fácil de notar na tela). */
export function interpolate(text: string, params?: Params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === "string" ? node : undefined;
}

export function createTranslator(locale: Locale, messages: Messages = messagesFor(locale)): Translator {
  // Chave ausente no idioma escolhido cai no português; ausente nos dois mostra a própria chave.
  const t = ((key: MessageKey, params?: Params) =>
    interpolate(lookup(messages, key) ?? lookup(ptBR, key) ?? key, params)) as Translator;
  t.locale = locale;
  t.messages = messages;
  t.maybe = (key, params) => {
    const v = lookup(messages, key) ?? lookup(ptBR, key);
    return v ? interpolate(v, params) : undefined;
  };
  return t;
}
