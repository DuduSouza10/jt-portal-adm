import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Printer, Truck } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { prioridadeText, statusText } from "@/i18n/labels";
import { ETAPAS, formatNumber, transitionError, type Acao } from "@/modules/solicitacoes/rules";
import { almoxarifadosAtivos, disponivelPorAlmox, getSolicitacao } from "@/modules/solicitacoes/queries";
import { allowed, canSee } from "@/modules/solicitacoes/service";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { PriorityBadge, StatusBadge } from "../badges";
import {
  aprovarAction,
  cancelarAction,
  comentarAction,
  iniciarSeparacaoAction,
  receberAction,
  recusarAction,
  separarAction,
} from "../actions";
import { BotaoForm, QuantidadesForm, TextoForm } from "./forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("solicitacoes.um") };
}

export default async function SolicitacaoPage(props: PageProps<"/solicitacoes/[id]">) {
  const user = await requireUser();
  const t = await getT();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const s = await getSolicitacao(id);
  if (!s || !canSee(user, s)) notFound();

  const number = formatNumber(s.number);
  const pode = (a: Acao) => allowed(user, a, s) && !transitionError(a, s.status, number);
  const itensAprovados = s.itens.filter((i) => (i.approved ?? 0) > 0);

  const [almoxarifados, disponivel] = pode("aprovar")
    ? await Promise.all([almoxarifadosAtivos(), disponivelPorAlmox(s.itens.map((i) => i.produtoId))])
    : [[], {}];
  // Almoxarifado da mesma regional da base vem primeiro e já escolhido.
  const almoxOrdenados = [...almoxarifados].sort((a, b) => Number(b.regionalId === s.base.regionalId) - Number(a.regionalId === s.base.regionalId));
  const almoxDefault = almoxOrdenados.find((a) => a.regionalId === s.base.regionalId)?.id;

  const etapaAtual = ETAPAS.indexOf(s.status);
  const encerrada = s.status === "RECUSADA" || s.status === "CANCELADA";
  const voltar = pode("separar") || pode("iniciarSeparacao") ? { href: "/separacao", label: t("nav.separacao.label") } : { href: "/solicitacoes", label: t("solicitacoes.titulo") };

  return (
    <div className="space-y-4">
      <PageHeader
        title={number}
        description={t("solicitacoes.detalhe.pedidaPor", { base: `${s.base.code} · ${s.base.name}`, nome: s.createdBy.name, data: fmtDateTime(s.createdAt, t.locale) })}
        back={voltar}
        actions={
          s.almoxarifado &&
          (pode("separar") || s.status === "SEPARADA") &&
          allowed(user, "separar", s) && (
            <Button asChild variant="outline">
              <Link href={`/solicitacoes/${s.id}/guia`} target="_blank">
                <Printer /> {t("solicitacoes.detalhe.imprimirGuia")}
              </Link>
            </Button>
          )
        }
      />
      {sp.nova === "1" && (
        <Alert className="border-success/40 bg-success/5">
          <AlertDescription className="font-medium text-foreground">{t("solicitacoes.detalhe.pedidoEnviado")}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={s.status} />
        <PriorityBadge priority={s.priority} />
        {s.partial && <span className="text-sm text-muted-foreground">{t("solicitacoes.detalhe.parcialAviso")}</span>}
        {s.almoxarifado && <span className="text-sm text-muted-foreground">{t("solicitacoes.detalhe.atendidaPor", { code: s.almoxarifado.code })}</span>}
      </div>

      {/* Linha de progresso: o que a base acompanha (E9). */}
      {!encerrada && (
        <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ETAPAS.map((e, i) => (
            <li
              key={e}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs",
                i < etapaAtual && "border-primary/40 text-foreground",
                i === etapaAtual && "border-primary bg-primary/10 font-semibold text-foreground",
                i > etapaAtual && "text-muted-foreground",
              )}
            >
              {i < etapaAtual && <Check className="size-3.5 text-primary" />}
              {statusText(t, e)}
            </li>
          ))}
        </ol>
      )}
      {encerrada && s.decisionNote && (
        <Alert variant="destructive">
          <AlertDescription>
            {statusText(t, s.status)}: {s.decisionNote}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("solicitacoes.detalhe.col.insumo")}</TableHead>
                  <TableHead className="text-right">{t("solicitacoes.detalhe.col.pedido")}</TableHead>
                  <TableHead className="text-right">{t("solicitacoes.detalhe.col.aprovado")}</TableHead>
                  <TableHead className="text-right">{t("solicitacoes.detalhe.col.separado")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.itens.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <span className="font-medium">{i.produto.code}</span> {i.produto.name}
                      <span className="ml-1 text-xs text-muted-foreground">({i.produto.unit})</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{i.requested}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.approved ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.separated ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {s.peopleCount != null && (
            <p className="text-sm">
              <span className="font-medium">{t("solicitacoes.detalhe.pessoas")}</span> {s.peopleCount}
            </p>
          )}
          {s.notes && (
            <p className="text-sm">
              <span className="font-medium">{t("solicitacoes.detalhe.observacao")}</span> {s.notes}
            </p>
          )}

          {s.shippedAt && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="size-5" /> {t("solicitacoes.detalhe.envio")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>{t("solicitacoes.detalhe.enviadaEm", { data: fmtDateTime(s.shippedAt, t.locale) })}</p>
                {s.tripId && (
                  <p>
                    {t("solicitacoes.detalhe.idViagem")} <span className="font-mono">{s.tripId}</span>
                  </p>
                )}
                {s.volumes && <p>{t("solicitacoes.detalhe.volumes", { n: s.volumes })}</p>}
                {s.shippingNotes && <p>{s.shippingNotes}</p>}
                {s.shipmentPhotoId && (
                  <a href={`/api/fotos-envio/${s.shipmentPhotoId}`} target="_blank" rel="noreferrer" className="inline-block pt-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/fotos-envio/${s.shipmentPhotoId}`} alt={t("solicitacoes.detalhe.fotoCarregamento")} className="h-40 rounded-md border object-cover" />
                  </a>
                )}
                {s.receivedAt && <p className="pt-2 font-medium">{t("solicitacoes.detalhe.recebidaEm", { data: fmtDateTime(s.receivedAt, t.locale) })}</p>}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t("solicitacoes.detalhe.historico")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ol className="space-y-2 text-sm">
                {s.eventos.map((e) => (
                  <li key={e.id} className="border-l-2 pl-3">
                    <p>
                      <span className="font-medium">
                        {e.type === "CRIADA" ? t("solicitacoes.detalhe.criada") : e.type === "COMENTARIO" ? t("solicitacoes.detalhe.comentario") : statusText(t, e.toStatus!)}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {e.actor?.name ?? t("comum.sistema")} · {fmtDateTime(e.createdAt, t.locale)}
                      </span>
                    </p>
                    {e.note && <p className="text-muted-foreground">{e.note}</p>}
                  </li>
                ))}
              </ol>
              <TextoForm id={s.id} action={comentarAction} name="text" label={t("solicitacoes.detalhe.comentar")} submitLabel={t("solicitacoes.detalhe.comentar")} required variant="outline" />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {pode("aprovar") && (
            <Card>
              <CardHeader>
                <CardTitle>{t("solicitacoes.detalhe.aprovar")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <QuantidadesForm
                  id={s.id}
                  action={aprovarAction}
                  submitLabel={t("solicitacoes.detalhe.aprovarReservar")}
                  colLabel={t("solicitacoes.detalhe.aprovar")}
                  itens={s.itens.map((i) => ({ produtoId: i.produtoId, code: i.produto.code, name: i.produto.name, unit: i.produto.unit, max: i.requested }))}
                  almoxarifados={almoxOrdenados}
                  almoxDefault={almoxDefault}
                  disponivel={disponivel}
                />
                <TextoForm id={s.id} action={recusarAction} name="reason" label={t("solicitacoes.detalhe.ouRecusar")} submitLabel={t("solicitacoes.detalhe.recusar")} required variant="destructive" />
              </CardContent>
            </Card>
          )}

          {pode("iniciarSeparacao") && (
            <Card>
              <CardHeader>
                <CardTitle>{t("solicitacoes.detalhe.separacao")}</CardTitle>
              </CardHeader>
              <CardContent>
                <BotaoForm id={s.id} action={iniciarSeparacaoAction} label={t("solicitacoes.detalhe.comecarSeparar")} />
              </CardContent>
            </Card>
          )}

          {pode("separar") && (
            <Card>
              <CardHeader>
                <CardTitle>{t("solicitacoes.detalhe.concluirSeparacao")}</CardTitle>
              </CardHeader>
              <CardContent>
                <QuantidadesForm
                  id={s.id}
                  action={separarAction}
                  submitLabel={t("solicitacoes.detalhe.separadoEnviar")}
                  colLabel={t("solicitacoes.detalhe.col.separado")}
                  itens={itensAprovados.map((i) => ({ produtoId: i.produtoId, code: i.produto.code, name: i.produto.name, unit: i.produto.unit, max: i.approved! }))}
                />
              </CardContent>
            </Card>
          )}

          {pode("enviar") && (
            <Card>
              <CardHeader>
                <CardTitle>{t("solicitacoes.detalhe.expedicao")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link href={`/expedicao?pedido=${s.id}`}>
                    <Truck /> {t("solicitacoes.detalhe.confirmarEnvio")}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {pode("receber") && (
            <Card>
              <CardHeader>
                <CardTitle>{t("solicitacoes.detalhe.chegou")}</CardTitle>
              </CardHeader>
              <CardContent>
                <TextoForm
                  id={s.id}
                  action={receberAction}
                  name="text"
                  label={t("solicitacoes.detalhe.observacaoOpc")}
                  placeholder={t("solicitacoes.detalhe.recebimentoPh")}
                  submitLabel={t("solicitacoes.detalhe.confirmarRecebimento")}
                />
              </CardContent>
            </Card>
          )}

          {pode("cancelar") && (
            <Card>
              <CardHeader>
                <CardTitle>{t("solicitacoes.detalhe.cancelarPedido")}</CardTitle>
              </CardHeader>
              <CardContent>
                <TextoForm id={s.id} action={cancelarAction} name="reason" label={t("solicitacoes.detalhe.motivo")} submitLabel={t("solicitacoes.detalhe.cancelarPedido")} required variant="destructive" />
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground">{t("solicitacoes.detalhe.prioridadeLinha", { p: prioridadeText(t, s.priority) })}</p>
        </div>
      </div>
    </div>
  );
}
