"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/client";

type Campos = { deNome: string; deLocal: string; paraNome: string; paraLocal: string };

/** Formulário (só na tela) + a folha, que é a única coisa que sai na impressão. */
export function EtiquetaEnvio({ inicial }: { inicial: Campos }) {
  const t = useT();
  const [c, setC] = useState(inicial);
  const campo = (k: keyof Campos) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{t(`solicitacoes.etiqueta.${k}`)}</Label>
      <Input id={k} value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} />
    </div>
  );
  const linha = (nome: string, local: string) => (local.trim() ? `${nome.trim()} (${local.trim()})` : nome.trim());

  return (
    <div className="space-y-4">
      {/* A4 deitado com as margens do modelo (3 cm em cima/embaixo, 2,5 cm dos lados). */}
      <style>{`@page { size: A4 landscape; margin: 30mm 25mm; }`}</style>
      <div className="space-y-4 print:hidden">
        <p className="text-sm text-muted-foreground">{t("solicitacoes.etiqueta.ajuda")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {campo("deNome")}
          {campo("deLocal")}
          {campo("paraNome")}
          {campo("paraLocal")}
        </div>
        <Button size="lg" onClick={() => window.print()}>
          <Printer /> {t("solicitacoes.etiqueta.imprimir")}
        </Button>
      </div>
      {/* Papel sempre branco com tinta preta (impressão): não usa os tokens do tema.
          Na tela, a folha é uma miniatura proporcional do A4 (unidades cqw); na impressão, tamanhos reais. */}
      <div className="mx-auto max-w-[297mm] [container-type:inline-size] print:max-w-none print:[container-type:normal]">
        <article
          className="flex aspect-[297/210] flex-col items-center gap-[10.4cqw] overflow-hidden border bg-white px-[8.4cqw] py-[10.1cqw] text-center text-[5.7cqw] leading-tight font-bold text-black print:aspect-auto print:gap-[31mm] print:border-0 print:p-0 print:text-[48pt]"
          style={{ fontFamily: "Aptos, 'Segoe UI', Arial, sans-serif" }}
        >
          <p>
            {t("solicitacoes.etiqueta.de")}: {linha(c.deNome, c.deLocal)}
          </p>
          <p>{t("solicitacoes.etiqueta.para")}</p>
          <p>{linha(c.paraNome, c.paraLocal)}</p>
        </article>
      </div>
    </div>
  );
}
