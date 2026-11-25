"use client";

import { useEffect, useRef } from "react";

/** Barra de abas com rolagem horizontal: ao abrir, leva a aba ativa para a área visível (útil no celular). */
export function AbasNav({ label, children }: { label?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current;
    const ativa = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !ativa) return;
    const fim = ativa.offsetLeft + ativa.offsetWidth;
    if (fim > nav.clientWidth) nav.scrollLeft = fim - nav.clientWidth + 16;
  }, []);
  return (
    <nav ref={ref} aria-label={label} className="flex gap-0.5 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </nav>
  );
}
