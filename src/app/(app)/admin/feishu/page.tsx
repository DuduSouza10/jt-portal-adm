import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { cardTitle, type Card as FeishuCard } from "@/lib/feishu/cards";
import { messagingConfig } from "@/lib/feishu/send";
import { BACKOFF_MINUTES } from "@/lib/feishu/outbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { retryAction } from "./actions";
import { TestButtons } from "./test-buttons";

export const metadata: Metadata = { title: "Feishu" };

const STATUS = { PENDING: "Na fila", SENT: "Enviada", FAILED: "Falhou" } as const;
const STATUS_CLASS = { PENDING: "text-muted-foreground", SENT: "text-foreground", FAILED: "text-destructive" } as const;
const CHANNEL: Record<string, string> = { webhook: "Webhook do grupo", chat: "Grupo (app)", user: "Mensagem direta" };

export default async function FeishuPage() {
  await requirePermission("integracoes.gerenciar");
  const cfg = messagingConfig();
  const [rows, counts] = await Promise.all([
    db.feishuOutbox.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
    db.feishuOutbox.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const equipeVia =
    cfg.app && cfg.staffChatId
      ? "grupo da equipe (app)"
      : cfg.webhook
        ? "webhook do grupo da equipe"
        : cfg.app
          ? "mensagem direta para cada pessoa com o open_id preenchido"
          : "nenhum (configure o Feishu)";

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Feishu" description="Avisos das solicitações, lembretes e resumo diário enviados ao Feishu." />

      <Card>
        <CardHeader>
          <CardTitle>Configuração</CardTitle>
          <CardDescription>Definida nas variáveis de ambiente (veja .env.example).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            Webhook do grupo da equipe: <b>{cfg.webhook ? "configurado" : "não configurado"}</b>
          </p>
          <p>
            Webhook do grupo da expedição: <b>{cfg.shippingWebhook ? "configurado" : "não configurado (vai para o destino da equipe)"}</b>
          </p>
          <p>
            App da Open Platform (mensagem direta e grupos das bases): <b>{cfg.app ? "configurado" : "não configurado"}</b>
          </p>
          <p>
            Avisos da equipe (aprovação e separação) vão para: <b>{equipeVia}</b>
          </p>
          <p className="text-muted-foreground">
            Avisos para as bases vão por mensagem direta (open_id no cadastro do usuário) e para o grupo da base (chat_id no
            cadastro da base). Isso precisa do app. O sino do portal funciona sempre, com ou sem Feishu.
          </p>
          <div className="pt-2">
            <TestButtons />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Últimas mensagens</CardTitle>
          <CardDescription>
            {count("SENT")} enviadas · {count("PENDING")} na fila · {count("FAILED")} com falha. Falhas são tentadas de novo
            automaticamente ({BACKOFF_MINUTES.map((m) => (m < 60 ? `${m} min` : `${m / 60} h`)).join(", ")}).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!rows.length ? (
            <EmptyState>Nenhuma mensagem ainda.</EmptyState>
          ) : (
            <ul className="divide-y text-sm">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className={`w-20 font-medium ${STATUS_CLASS[r.status]}`}>{STATUS[r.status]}</span>
                  <span className="min-w-0 flex-1 truncate">{cardTitle(r.payload as FeishuCard) ?? r.event}</span>
                  <span className="text-xs text-muted-foreground">{CHANNEL[r.channel] ?? r.channel}</span>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(r.sentAt ?? r.createdAt)}</span>
                  {r.status !== "SENT" && (
                    <form action={retryAction.bind(null, r.id)}>
                      <Button type="submit" variant="outline" size="sm">
                        Tentar de novo
                      </Button>
                    </form>
                  )}
                  {r.lastError && <p className="w-full text-xs text-destructive">{r.lastError}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
