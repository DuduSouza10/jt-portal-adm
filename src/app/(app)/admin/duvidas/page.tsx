import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { conversa, conversas } from "@/modules/duvidas/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ActionForm } from "@/components/action-form";
import { AtivarAvisos } from "@/components/duvidas-avisos";
import { EmptyState, PageHeader } from "@/components/page-header";
import { param } from "@/components/pagination";
import { responderDuvidaAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("duvidas.tela.titulo") };
}

/** Administração → Dúvidas (E15): conversas do balão de ajuda; a equipe responde aqui. */
export default async function DuvidasPage(props: PageProps<"/admin/duvidas">) {
  await requirePermission("duvidas.responder");
  const t = await getT();
  const sp = await props.searchParams;
  const lista = await conversas();
  const u = param(sp, "u") ?? lista[0]?.solicitanteId;
  const [msgs, pessoa] = u
    ? await Promise.all([conversa(u), db.user.findUnique({ where: { id: u }, select: { id: true, name: true, login: true, bases: { select: { base: { select: { code: true } } } } } })])
    : [[], null];

  return (
    <>
      <PageHeader title={t("duvidas.tela.titulo")} description={t("duvidas.tela.descricao")} actions={<AtivarAvisos />} />
      {lista.length === 0 ? (
        <EmptyState>{t("duvidas.tela.vazio")}</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="py-0">
            <ul className="divide-y">
              {lista.map((c) => (
                <li key={c.solicitanteId}>
                  <Link href={`/admin/duvidas?u=${c.solicitanteId}`} className={cn("block px-4 py-3 hover:bg-muted/50", c.solicitanteId === u && "bg-muted")}>
                    <p className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{c.solicitante.name}</span>
                      <span className={cn("shrink-0 text-xs", c.daEquipe ? "text-muted-foreground" : "font-medium text-primary")}>
                        {c.daEquipe ? t("duvidas.tela.respondida") : t("duvidas.tela.pendente")}
                      </span>
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{c.texto}</p>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(c.createdAt, t.locale)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          {pessoa ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  {pessoa.name}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    {pessoa.login}
                    {pessoa.bases.length > 0 && ` · ${pessoa.bases.map((b) => b.base.code).join(", ")}`}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {msgs.map((m) => (
                    <div key={m.id} className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", m.daEquipe ? "ml-auto bg-primary text-primary-foreground" : "bg-muted")}>
                      <p className="text-[11px] font-medium opacity-75">
                        {m.daEquipe ? `${t("duvidas.equipe")} · ${m.autor?.name ?? ""}` : pessoa.name} · {fmtDateTime(m.createdAt, t.locale)}
                      </p>
                      <p className="whitespace-pre-wrap">{m.texto}</p>
                    </div>
                  ))}
                </div>
                <ActionForm action={responderDuvidaAction.bind(null, pessoa.id)} submitLabel={t("duvidas.tela.responder")}>
                  <Textarea name="texto" required maxLength={1000} rows={3} placeholder={t("duvidas.tela.respostaPh")} />
                </ActionForm>
              </CardContent>
            </Card>
          ) : (
            <EmptyState>{t("duvidas.tela.escolha")}</EmptyState>
          )}
        </div>
      )}
    </>
  );
}
