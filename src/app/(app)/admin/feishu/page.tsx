import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { getT } from "@/i18n/server";
import { cardTitle, type Card as FeishuCard } from "@/lib/feishu/cards";
import { messagingConfig } from "@/lib/feishu/send";
import { BACKOFF_MINUTES } from "@/lib/feishu/outbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { retryAction } from "./actions";
import { TestButtons } from "./test-buttons";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("feishu.titulo") };
}

const STATUS_CLASS = { PENDING: "text-muted-foreground", SENT: "text-foreground", FAILED: "text-destructive" } as const;

export default async function FeishuPage() {
  await requirePermission("integracoes.gerenciar");
  const t = await getT();
  const cfg = messagingConfig();
  const [rows, counts] = await Promise.all([
    db.feishuOutbox.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
    db.feishuOutbox.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const equipeVia =
    cfg.app && cfg.staffChatId
      ? t("feishu.viaGrupoApp")
      : cfg.webhook
        ? t("feishu.viaWebhook")
        : cfg.app
          ? t("feishu.viaDireta")
          : t("feishu.viaNenhum");
  const config = (ok: boolean) => (ok ? t("feishu.configurado") : t("feishu.naoConfigurado"));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title={t("feishu.titulo")} description={t("feishu.descricao")} />

      <Card>
        <CardHeader>
          <CardTitle>{t("feishu.configuracao")}</CardTitle>
          <CardDescription>{t("feishu.configuracaoDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            {t("feishu.webhookEquipe")} <b>{config(!!cfg.webhook)}</b>
          </p>
          <p>
            {t("feishu.webhookExpedicao")} <b>{cfg.shippingWebhook ? t("feishu.configurado") : t("feishu.naoConfiguradoExpedicao")}</b>
          </p>
          <p>
            {t("feishu.appPlataforma")} <b>{config(!!cfg.app)}</b>
          </p>
          <p>
            {t("feishu.avisosEquipe")} <b>{equipeVia}</b>
          </p>
          <p className="text-muted-foreground">{t("feishu.notaBases")}</p>
          <div className="pt-2">
            <TestButtons />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("feishu.ultimas")}</CardTitle>
          <CardDescription>
            {t("feishu.resumo", {
              sent: count("SENT"),
              pending: count("PENDING"),
              failed: count("FAILED"),
              tempos: BACKOFF_MINUTES.map((m) => (m < 60 ? t("feishu.minutos", { n: m }) : t("feishu.horas", { n: m / 60 }))).join(", "),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!rows.length ? (
            <EmptyState>{t("feishu.vazio")}</EmptyState>
          ) : (
            <ul className="divide-y text-sm">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className={`w-20 font-medium ${STATUS_CLASS[r.status]}`}>{t(`feishu.status.${r.status}`)}</span>
                  <span className="min-w-0 flex-1 truncate">{cardTitle(r.payload as FeishuCard) ?? r.event}</span>
                  <span className="text-xs text-muted-foreground">{t.maybe(`feishu.canal.${r.channel}`) ?? r.channel}</span>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(r.sentAt ?? r.createdAt, t.locale)}</span>
                  {r.status !== "SENT" && (
                    <form action={retryAction.bind(null, r.id)}>
                      <Button type="submit" variant="outline" size="sm">
                        {t("feishu.tentarDeNovo")}
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
