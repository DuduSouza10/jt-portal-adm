/**
 * Idiomas e tema do portal. Ver docs/arquitetura.md → "Idioma e tema".
 *
 * - Idioma: cookie `portal_lang`, lido no servidor (os textos já saem traduzidos do servidor).
 * - Tema: `localStorage["portal_theme"]`, aplicado por um script no <head> antes da primeira pintura.
 *   Sem escolha salva, segue o tema do sistema operacional.
 */
export const LOCALES = ["pt-BR", "zh-CN"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pt-BR";
export const LOCALE_COOKIE = "portal_lang";
export const THEME_STORAGE_KEY = "portal_theme";

/** Nome de cada idioma escrito nele mesmo (é assim que aparece no seletor). */
export const LOCALE_NAME: Record<Locale, string> = {
  "pt-BR": "Português",
  "zh-CN": "简体中文",
};

/** Rótulo curto para o botão do seletor. */
export const LOCALE_SHORT: Record<Locale, string> = {
  "pt-BR": "PT",
  "zh-CN": "中文",
};

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/**
 * Script que roda no <head>, antes da página aparecer: aplica o tema salvo (ou o do sistema)
 * para não piscar branco no modo escuro.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"}catch(_){}})()`;
