"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Mantém a tela em dia sem ninguém recarregar a página: de tempos em tempos (e ao voltar para a aba) pede ao
 * servidor os dados novos da página atual. Não perde o que a pessoa está fazendo (campos, diálogos abertos,
 * rolagem) e fica parado com a aba escondida ou sem internet.
 *
 * Uso: <AutoAtualizar segundos={15} /> dentro da página. Só onde a lista muda por ação de outras pessoas
 * (ex.: pedidos de acesso chegando pelo Feishu).
 */
export function AutoAtualizar({ segundos = 15 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const atualizar = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      startTransition(() => router.refresh());
    };
    const id = setInterval(atualizar, segundos * 1000);
    document.addEventListener("visibilitychange", atualizar);
    window.addEventListener("online", atualizar);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", atualizar);
      window.removeEventListener("online", atualizar);
    };
  }, [router, segundos]);
  return null;
}
