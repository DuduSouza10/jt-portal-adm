"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ATRASO_DIGITANDO = 250;

/**
 * Formulário de filtro das listas (GET). Atualiza a lista sozinho: enquanto a pessoa digita (com uma pausa de
 * ~0,25 s) e na hora ao trocar um seletor, caixa ou mês. Ninguém precisa apertar Enter nem "Filtrar".
 *
 * - Os campos continuam sendo os de sempre (`name`, `defaultValue`); a página lê os mesmos parâmetros da URL.
 * - Campo vazio sai da URL, e a página volta para a primeira página de resultados.
 * - Enter ainda funciona (envia na hora).
 * - Não remonta os campos: o foco e o cursor ficam onde estavam enquanto a lista recarrega.
 *
 * Regra de interface (pedido do Eduardo, 2026-11-25): toda busca/filtro de lista usa isto.
 */
export function FiltroForm({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [pendente, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const form = ref.current;
    if (!form) return;

    const enviar = () => {
      clearTimeout(timer.current);
      const params = new URLSearchParams();
      for (const [k, v] of new FormData(form)) if (typeof v === "string" && v !== "") params.append(k, v);
      const qs = params.toString();
      if (qs === window.location.search.replace(/^\?/, "")) return; // nada mudou
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    };

    const aoMudar = (e: Event) => {
      const el = e.target as HTMLElement;
      if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLSelectElement) && !(el instanceof HTMLTextAreaElement)) return;
      const digitavel = el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && ["text", "search", "number", "email", "tel", "url"].includes(el.type));
      if (e.type === "input" && digitavel) {
        if ((e as InputEvent).isComposing) return; // teclado de acentos/IME ainda compondo
        clearTimeout(timer.current);
        timer.current = setTimeout(enviar, ATRASO_DIGITANDO);
      } else if (e.type === "change") enviar();
    };
    const aoEnviar = (e: Event) => {
      e.preventDefault();
      enviar();
    };

    form.addEventListener("input", aoMudar);
    form.addEventListener("change", aoMudar);
    form.addEventListener("submit", aoEnviar);
    return () => {
      clearTimeout(timer.current);
      form.removeEventListener("input", aoMudar);
      form.removeEventListener("change", aoMudar);
      form.removeEventListener("submit", aoEnviar);
    };
  }, [router, pathname]);

  return (
    <form ref={ref} role="search" aria-busy={pendente} className={cn(className)}>
      {children}
      {pendente && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
    </form>
  );
}
