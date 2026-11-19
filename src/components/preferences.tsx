"use client";

import { useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCALE_COOKIE, LOCALE_NAME, LOCALE_SHORT, LOCALES, THEME_STORAGE_KEY, type Locale } from "@/i18n/config";
import { useT } from "@/i18n/client";

// ------------------------------------------------------------------ Tema

/** Observa a classe "dark" no <html> (posta pelo script do <head> ou pelo botão). */
function subscribeTheme(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}
const isDarkNow = () => document.documentElement.classList.contains("dark");

/** "light" | "dark" no navegador; "light" no servidor. */
export function useResolvedTheme(): "light" | "dark" {
  const dark = useSyncExternalStore(subscribeTheme, isDarkNow, () => false);
  return dark ? "dark" : "light";
}

export function setTheme(theme: "light" | "dark") {
  const el = document.documentElement;
  el.classList.toggle("dark", theme === "dark");
  el.style.colorScheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // navegador sem localStorage: vale só até recarregar
  }
}

/** Botão sol/lua. Os dois ícones são renderizados e o CSS mostra o certo (sem piscar na hidratação). */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => setTheme(isDarkNow() ? "light" : "dark")}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
        className,
      )}
      aria-label={t("tema.alternar")}
      title={t("tema.alternar")}
    >
      <Moon className="size-[18px] dark:hidden" aria-hidden />
      <Sun className="hidden size-[18px] dark:block" aria-hidden />
    </button>
  );
}

// ------------------------------------------------------------------ Idioma

/** Grava a escolha de idioma (cookie lido pelo servidor em toda requisição). */
function saveLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = locale;
}

/**
 * Seletor PT | 中文. Grava o cookie e pede ao servidor a página de novo:
 * os textos são traduzidos no servidor, então a troca vale para tudo, inclusive mensagens de erro.
 */
export function LanguageSwitch({ className, tone = "onBrand" }: { className?: string; tone?: "onBrand" | "plain" }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();

  const choose = (locale: Locale) => {
    if (locale === t.locale) return;
    saveLocale(locale);
    start(() => router.refresh());
  };

  return (
    <div
      role="radiogroup"
      aria-label={t("idioma.rotulo")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full p-0.5 text-xs font-semibold",
        tone === "onBrand" ? "bg-black/15 dark:bg-white/10" : "bg-muted",
        pending && "opacity-70",
        className,
      )}
    >
      <Languages className={cn("mx-1.5 size-3.5", tone === "onBrand" ? "text-white/80" : "text-muted-foreground")} aria-hidden />
      {LOCALES.map((l) => {
        const active = l === t.locale;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={active}
            lang={l}
            title={LOCALE_NAME[l]}
            onClick={() => choose(l)}
            disabled={pending}
            className={cn(
              "rounded-full px-2.5 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1",
              tone === "onBrand"
                ? active
                  ? "bg-white text-primary shadow-sm dark:bg-primary dark:text-primary-foreground"
                  : "text-white/85 hover:text-white"
                : active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            {LOCALE_SHORT[l]}
          </button>
        );
      })}
    </div>
  );
}
