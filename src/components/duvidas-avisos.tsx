"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Bell, BellOff, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { novosAvisosDuvidaAction } from "@/app/(app)/admin/duvidas/actions";
import { openNotificationAction } from "@/app/(app)/notificacoes/actions";
import { lerIds, semRepetir } from "./duvidas-avisos-rules";

/**
 * Avisos do navegador (notificação do sistema) SÓ para a aba de suporte (E21): quando alguém manda uma dúvida
 * (a equipe) ou a equipe responde (a pessoa). Os outros avisos continuam só no sino.
 *
 * - O navegador só deixa pedir permissão com um clique, por isso existe o botão <AtivarAvisos>.
 * - Sem permissão, nada é consultado no servidor (milhares de usuários não ficam consultando à toa).
 * - Funciona enquanto o portal estiver aberto numa aba (pode estar em segundo plano). Com o navegador fechado
 *   seria preciso notificação "push" com service worker (não feito).
 */

const INTERVALO_MS = 30_000;
const K_DESDE = "sd.duvidas.desde";
const K_IDS = "sd.duvidas.ids";
const EVENTO = "sd-avisos-permissao";

type Permissao = "default" | "granted" | "denied" | "indisponivel";

const permissaoAtual = (): Permissao => (typeof window !== "undefined" && "Notification" in window ? Notification.permission : "indisponivel");

// Armazenamento do navegador pode estar bloqueado (aba anônima, políticas): nunca derruba a tela.
const ler = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const gravar = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* sem armazenamento: o aviso só pode repetir depois de recarregar */
  }
};

/** Roda em todas as páginas do sistema (sem tela): consulta a cada 30 s se há dúvida nova e mostra a notificação. */
export function DuvidasAvisos() {
  const [, start] = useTransition();
  const rodando = useRef(false);

  useEffect(() => {
    async function checar() {
      if (rodando.current || permissaoAtual() !== "granted" || !navigator.onLine) return;
      rodando.current = true;
      try {
        const r = await novosAvisosDuvidaAction(ler(K_DESDE));
        gravar(K_DESDE, r.desde);
        const { novos, vistos } = semRepetir(r.itens, lerIds(ler(K_IDS)));
        gravar(K_IDS, JSON.stringify(vistos));
        for (const n of novos) {
          const aviso = new Notification(n.title, { body: n.body || undefined, tag: `duvida-${n.id}`, icon: "/jt-coelho.png" });
          aviso.onclick = () => {
            window.focus();
            aviso.close();
            start(() => openNotificationAction(n.id));
          };
        }
      } catch {
        /* sem rede ou sessão vencida: tenta de novo na próxima */
      } finally {
        rodando.current = false;
      }
    }
    void checar();
    const id = setInterval(() => void checar(), INTERVALO_MS);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void checar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("online", aoVoltar);
    window.addEventListener(EVENTO, aoVoltar);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("online", aoVoltar);
      window.removeEventListener(EVENTO, aoVoltar);
    };
  }, [start]);

  return null;
}

/** Botão para ligar os avisos no navegador (aparece no balão de dúvidas e na tela Dúvidas da equipe). */
export function AtivarAvisos({ className }: { className?: string }) {
  const t = useT();
  const [permissao, setPermissao] = useState<Permissao>("indisponivel");
  useEffect(() => {
    const atualiza = () => setPermissao(permissaoAtual());
    atualiza();
    window.addEventListener(EVENTO, atualiza);
    return () => window.removeEventListener(EVENTO, atualiza);
  }, []);

  async function ativar() {
    // Recomeça "de agora": o que já estava no sino não vira notificação de uma vez.
    gravar(K_DESDE, null);
    const p = await Notification.requestPermission();
    setPermissao(p);
    if (p === "granted") {
      new Notification(t("duvidas.avisos.ligadoTitulo"), { body: t("duvidas.avisos.ligadoCorpo"), tag: "duvida-teste", icon: "/jt-coelho.png" });
      window.dispatchEvent(new Event(EVENTO));
    }
  }

  if (permissao === "indisponivel") return null;
  if (permissao === "granted")
    return (
      <p className={`flex items-center gap-1.5 text-xs text-success ${className ?? ""}`}>
        <Check className="size-3.5" aria-hidden /> {t("duvidas.avisos.ligado")}
      </p>
    );
  if (permissao === "denied")
    return (
      <p className={`flex items-start gap-1.5 text-xs text-muted-foreground ${className ?? ""}`}>
        <BellOff className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t("duvidas.avisos.bloqueado")}
      </p>
    );
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void ativar()} className={className}>
      <Bell /> {t("duvidas.avisos.ativar")}
    </Button>
  );
}
