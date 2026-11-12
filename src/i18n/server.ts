import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { createTranslator } from "./translate";

/** Idioma da requisição atual (cookie). Fora de uma requisição (seed, testes) devolve o padrão. */
export const getLocale = cache(async (): Promise<Locale> => {
  try {
    const v = (await cookies()).get(LOCALE_COOKIE)?.value;
    return isLocale(v) ? v : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
});

/**
 * Tradutor para Server Components e generateMetadata.
 *   const t = await getT();
 *   t("estoque.saldos.titulo")
 */
export const getT = cache(async () => createTranslator(await getLocale()));
