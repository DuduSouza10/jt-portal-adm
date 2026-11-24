"use client";

import { useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { markAllReadAction, openNotificationAction } from "@/app/(app)/notificacoes/actions";

export type AvisoItem = { id: string; title: string; body: string | null; when: string; read: boolean };

/**
 * Sino do cabeçalho (S7): o contador de não lidas e, ao clicar, um balão com os avisos mais recentes
 * (igual ao protótipo). Clicar num aviso marca como lido e abre o link dele; "Marcar todas" limpa o contador.
 */
export function NotificationBell({ unread, items }: { unread: number; items: AvisoItem[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const label = unread ? t("notificacoes.sinoNaoLidas", { n: unread }) : t("notificacoes.titulo");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className="relative inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Bell className="size-[18px]" aria-hidden />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[11px] leading-none font-semibold text-primary-foreground tabular-nums ring-2 ring-background">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label={t("notificacoes.titulo")}>
        <div className="flex items-center gap-2 border-b py-3 pr-3 pl-4">
          <b className="text-sm font-semibold">{t("notificacoes.titulo")}</b>
          {unread > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
              {t("notificacoes.naoLidas", { n: unread })}
            </span>
          )}
          <button
            type="button"
            disabled={unread === 0 || pending}
            onClick={() => start(() => markAllReadAction())}
            className="ml-auto rounded-md px-2 py-1 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/10 disabled:text-muted-foreground disabled:hover:bg-transparent"
          >
            {t("notificacoes.marcarTodas")}
          </button>
        </div>
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted-foreground">
            <BellOff className="mx-auto mb-2 size-6" aria-hidden />
            <p className="text-sm">{t("notificacoes.vazio")}</p>
          </div>
        ) : (
          <ul className="max-h-[min(420px,70vh)] overflow-y-auto p-1.5">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setOpen(false);
                    start(() => openNotificationAction(n.id));
                  }}
                  className={cn("grid w-full grid-cols-[8px_1fr] items-start gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-muted", !n.read && "bg-primary/5")}
                >
                  <span className={cn("mt-1.5 size-2 rounded-full", n.read ? "bg-transparent" : "bg-primary")} aria-label={n.read ? undefined : t("notificacoes.naoLidaAria")} />
                  <span className="min-w-0">
                    <span className={cn("block text-sm leading-snug", n.read ? "font-medium" : "font-semibold")}>{n.title}</span>
                    {n.body && <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{n.body}</span>}
                    <span className="mt-0.5 block text-xs text-muted-foreground">{n.when}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
