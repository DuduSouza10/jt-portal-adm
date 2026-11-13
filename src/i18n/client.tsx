"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import { translateServerMessage } from "./server-messages";
import { createTranslator, type Translator } from "./translate";

const I18nContext = createContext<Translator | null>(null);

/** Colocado no layout raiz: dá aos Client Components o idioma escolhido. */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

/** Tradutor para Client Components: `const t = useT(); t("comum.salvar")`. */
export function useT(): Translator {
  const t = useContext(I18nContext);
  if (!t) throw new Error("useT() precisa estar dentro de <I18nProvider>.");
  return t;
}

/**
 * Traduz uma mensagem que veio pronta do servidor (erro de action, DomainError, validação).
 * Sem tradução conhecida, devolve o texto original.
 */
export function useServerMessage() {
  const t = useT();
  return (msg: string) => translateServerMessage(msg, t.locale);
}
