"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageCircleQuestion, Send, X } from "lucide-react";
import { useKeepForm } from "@/components/use-keep-form";
import { AtivarAvisos } from "@/components/duvidas-avisos";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useServerMessage, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { enviarDuvidaAction, minhaConversaAction } from "@/app/(app)/admin/duvidas/actions";

type Msg = Awaited<ReturnType<typeof minhaConversaAction>>[number];

/** Balão de dúvidas (E15), no canto da tela em todas as páginas: conversa do usuário com a equipe do portal. */
export function DuvidasBalao() {
  const t = useT();
  const tm = useServerMessage();
  const params = useSearchParams();
  const [aberto, setAberto] = useState(params.get("duvidas") === "1");
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const { state, pending, formProps } = useKeepForm(enviarDuvidaAction, {});

  const carregar = useCallback(() => {
    minhaConversaAction().then(setMsgs).catch(() => setMsgs([]));
  }, []);
  // Abriu, ou mandou uma mensagem com sucesso: recarrega a conversa.
  useEffect(() => {
    if (aberto) carregar();
  }, [aberto, state, carregar]);
  // Chaves de propósito: no Chrome novo scrollIntoView devolve uma Promise, e efeito que devolve algo derruba a página.
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [msgs]);

  return (
    <div className="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-3 print:hidden sm:right-6 sm:bottom-6">
      {aberto && (
        <div className="flex max-h-[min(560px,calc(100dvh-7rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl">
          <div className="flex items-start justify-between gap-2 border-b p-4">
            <div>
              <p className="font-semibold">{t("duvidas.titulo")}</p>
              <p className="text-xs text-muted-foreground">{t("duvidas.ajuda")}</p>
              <AtivarAvisos className="mt-2" />
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setAberto(false)} aria-label="Fechar">
              <X />
            </Button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {msgs?.length === 0 && <p className="text-center text-sm text-muted-foreground">{t("duvidas.vazio")}</p>}
            {msgs?.map((m) => (
              <div key={m.id} className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", m.daEquipe ? "bg-muted" : "ml-auto bg-primary text-primary-foreground")}>
                <p className="text-[11px] font-medium opacity-75">{m.daEquipe ? `${t("duvidas.equipe")}${m.autor ? ` · ${m.autor}` : ""}` : t("duvidas.voce")}</p>
                <p className="whitespace-pre-wrap">{m.texto}</p>
              </div>
            ))}
            <div ref={fim} />
          </div>
          <form {...formProps} className="space-y-2 border-t p-3">
            <Textarea name="texto" required maxLength={1000} rows={2} placeholder={t("duvidas.placeholder")} />
            {state.error && <p className="text-xs text-destructive">{tm(state.error)}</p>}
            <Button type="submit" size="sm" disabled={pending} className="w-full">
              <Send /> {t("duvidas.enviar")}
            </Button>
          </form>
        </div>
      )}
      <Button size="lg" className="h-12 rounded-full shadow-lg" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        <MessageCircleQuestion className="size-5" />
        <span className="hidden sm:inline">{t("duvidas.balao")}</span>
      </Button>
    </div>
  );
}
