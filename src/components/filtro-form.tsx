"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { chaveFiltros, contarFiltros, filtrosParaLembrar, restaurarFiltros } from "./filtros-lembrados";

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
 * - Lembra os filtros (pedido do Eduardo, 2026-11-25): ao abrir um registro e voltar para a lista, ou ao voltar
 *   a ela pelo menu, os filtros continuam como a pessoa deixou (só na sessão da aba; ver `filtros-lembrados.ts`).
 *   Link que já traz filtro na URL (ex.: o painel) vale mais que o lembrado. "Limpar filtros" zera tudo.
 *
 * Regra de interface (pedido do Eduardo, 2026-11-25): toda busca/filtro de lista usa isto.
 */
function guardar(chave: string, valor: string) {
  try {
    if (valor) sessionStorage.setItem(chave, valor);
    else sessionStorage.removeItem(chave);
  } catch {
    /* sessionStorage indisponível (navegação privada restrita): só não lembra */
  }
}
function ler(chave: string): string | null {
  try {
    return sessionStorage.getItem(chave);
  } catch {
    return null;
  }
}
const nomesDosCampos = (form: HTMLFormElement) => [...new Set([...form.elements].map((el) => (el as HTMLInputElement).name).filter(Boolean))];

export function FiltroForm({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const search = useSearchParams().toString();
  const [pendente, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Query que a navegação de restaurar/limpar vai produzir; ao chegar, os campos são remontados com os valores novos. */
  const esperada = useRef<string | null>(null);
  const [chave, setChave] = useState(0);
  const [ativos, setAtivos] = useState(0);
  const [lembrado, setLembrado] = useState(false);

  // Ao entrar na tela: restaura os filtros guardados (se a URL veio sem nenhum) ou guarda os que vieram na URL.
  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    const campos = nomesDosCampos(form);
    const atual = window.location.search.replace(/^\?/, "");
    const nova = restaurarFiltros(atual, ler(chaveFiltros(pathname)), campos);
    if (nova === null) {
      guardar(chaveFiltros(pathname), filtrosParaLembrar(new URLSearchParams(atual), campos));
      return;
    }
    esperada.current = nova;
    setLembrado(true);
    startTransition(() => router.replace(`${pathname}?${nova}`, { scroll: false }));
  }, [router, pathname]);

  // Chegou a URL restaurada/limpa: remonta o formulário para os campos mostrarem os valores novos.
  // Também mantém a contagem de filtros ativos (botão "Limpar filtros").
  useEffect(() => {
    const form = ref.current;
    if (esperada.current !== null && search === esperada.current) {
      esperada.current = null;
      setChave((c) => c + 1);
    }
    if (form) setAtivos(contarFiltros(filtrosParaLembrar(new URLSearchParams(search), nomesDosCampos(form))));
  }, [search, chave]);

  const limpar = () => {
    const form = ref.current;
    if (!form) return;
    const campos = nomesDosCampos(form);
    const resto = new URLSearchParams(window.location.search);
    for (const c of campos) resto.delete(c);
    resto.delete("p");
    const qs = resto.toString();
    guardar(chaveFiltros(pathname), "");
    setLembrado(false);
    esperada.current = qs;
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  useEffect(() => {
    const form = ref.current;
    if (!form) return;

    const enviar = () => {
      clearTimeout(timer.current);
      const params = new URLSearchParams();
      for (const [k, v] of new FormData(form)) if (typeof v === "string" && v !== "") params.append(k, v);
      const qs = params.toString();
      guardar(chaveFiltros(pathname), qs);
      setLembrado(false);
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
  }, [router, pathname, chave]);

  return (
    <form key={chave} ref={ref} role="search" aria-busy={pendente} className={cn(className)}>
      {children}
      {pendente && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
      {ativos > 0 && (
        <button
          type="button"
          onClick={limpar}
          title={lembrado ? t("comum.filtrosMantidos") : undefined}
          className={cn(
            "inline-flex h-9 items-center gap-1 rounded-lg border border-dashed px-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground",
            lembrado && "border-primary/50 text-foreground",
          )}
        >
          <X className="size-3.5" aria-hidden />
          {t("comum.limparFiltros")}
        </button>
      )}
    </form>
  );
}
