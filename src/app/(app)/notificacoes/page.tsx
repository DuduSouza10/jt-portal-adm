import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { listNotifications, PAGE_SIZE } from "@/modules/notificacoes/queries";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Pagination, pageParam } from "@/components/pagination";
import { markAllReadAction, openNotificationAction } from "./actions";

export const metadata: Metadata = { title: "Notificações" };

/** Sino: avisos do próprio usuário (S7). O contador no cabeçalho usa unreadCount() de modules/notificacoes. */
export default async function NotificacoesPage(props: PageProps<"/notificacoes">) {
  const user = await requireUser();
  const page = pageParam(await props.searchParams);
  const { rows, total, unread } = await listNotifications(user.id, page);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Notificações"
        description={unread ? `${unread} não lida(s)` : "Tudo lido."}
        actions={
          unread > 0 && (
            <form action={markAllReadAction}>
              <Button variant="outline" type="submit">
                Marcar todas como lidas
              </Button>
            </form>
          )
        }
      />
      {rows.length === 0 ? (
        <EmptyState>Nenhuma notificação.</EmptyState>
      ) : (
        <Card className="py-0">
          <ul className="divide-y">
            {rows.map((n) => (
              <li key={n.id}>
                <form action={openNotificationAction.bind(null, n.id)}>
                  <button type="submit" className={`block w-full p-3 text-left hover:bg-muted/50 ${n.readAt ? "" : "bg-primary/5"}`}>
                    <div className="flex items-start gap-2">
                      {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="não lida" />}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{n.title}</div>
                        {n.body && <div className="text-sm text-muted-foreground">{n.body}</div>}
                        <div className="text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</div>
                      </div>
                    </div>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath="/notificacoes" params={{}} />
    </div>
  );
}
