"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { chaveFiltros } from "./filtros-lembrados";

/**
 * Filtro de lista que vive no navegador (useState) e também é lembrado na sessão da aba: abrir um registro e voltar,
 * ou voltar pelo menu, encontra a lista como a pessoa deixou. É o par do `FiltroForm` (listas que filtram pela URL).
 * Mesma regra: só na sessão (`sessionStorage`, por tela); `limpar()` volta ao padrão e esquece o que estava guardado.
 *
 * `inicial` precisa ser estável (constante do módulo): o primeiro desenho do servidor usa o padrão e, ao montar,
 * o valor guardado entra, sem diferença entre servidor e navegador.
 */
export function useFiltroLembrado<T extends Record<string, unknown>>(inicial: T, nome = "lista") {
  const pathname = usePathname();
  const chave = `${chaveFiltros(pathname)}#${nome}`;
  const [valor, setValor] = useState<T>(inicial);
  const carregado = useRef(false);

  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem(chave);
      // Adiado de propósito: o primeiro desenho é o padrão (igual ao do servidor) e o guardado entra logo depois.
      if (guardado) {
        const parte = JSON.parse(guardado) as Partial<T>;
        queueMicrotask(() => setValor({ ...inicial, ...parte }));
      }
    } catch {
      /* sessionStorage indisponível ou JSON velho: fica no padrão */
    }
    carregado.current = true;
  }, [chave, inicial]);

  useEffect(() => {
    if (!carregado.current) return;
    try {
      const mudou = JSON.stringify(valor) !== JSON.stringify(inicial);
      if (mudou) sessionStorage.setItem(chave, JSON.stringify(valor));
      else sessionStorage.removeItem(chave);
    } catch {
      /* sem armazenamento: só não lembra */
    }
  }, [valor, chave, inicial]);

  const mudar = (parte: Partial<T>) => setValor((v) => ({ ...v, ...parte }));
  const limpar = () => setValor(inicial);
  const ativos = (Object.keys(inicial) as (keyof T)[]).filter((k) => valor[k] !== inicial[k]).length;
  return { valor, mudar, limpar, ativos };
}
