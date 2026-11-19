import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requirePermission } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { getT } from "@/i18n/server";
import { formatNumber } from "@/modules/solicitacoes/rules";
import { getSolicitacao } from "@/modules/solicitacoes/queries";
import { allowed } from "@/modules/solicitacoes/service";
import { PrintButton } from "./print-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("solicitacoes.guia.titulo") };
}

/**
 * Guia de separação (A4). O QR leva ao link do pedido: a expedição bipa a guia e o pedido entra no envio.
 * Também dá para digitar o número (SOL-000123).
 */
export default async function GuiaPage(props: PageProps<"/solicitacoes/[id]/guia">) {
  const user = await requirePermission("expedicao.separar");
  const t = await getT();
  const { id } = await props.params;
  const s = await getSolicitacao(id);
  if (!s || !s.almoxarifado || !allowed(user, "separar", s)) notFound();

  const number = formatNumber(s.number);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const qr = await QRCode.toDataURL(`${appUrl}/solicitacoes/${s.id}`, { margin: 0, width: 220 });
  const itens = s.itens.filter((i) => (i.approved ?? 0) > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">{t("solicitacoes.guia.pronta")}</p>
        <PrintButton />
      </div>
      {/* O papel é sempre branco com tinta preta (impressão), por isso não usa os tokens do tema. */}
      <article className="mx-auto max-w-[210mm] space-y-4 rounded-lg border bg-white p-8 text-black print:max-w-none print:rounded-none print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-4 border-b-2 border-black pb-4">
          <div>
            <p className="text-sm font-bold tracking-wide">{t("solicitacoes.guia.cabecalho")}</p>
            <p className="font-mono text-3xl font-bold">{number}</p>
            {s.priority === "URGENTE" && <p className="mt-1 inline-block bg-black px-2 py-0.5 text-sm font-bold text-white">{t("solicitacoes.guia.urgente")}</p>}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={t("solicitacoes.guia.qrAlt", { n: number })} className="size-28" />
        </header>
        <section className="space-y-1 text-sm">
          <p>
            <b>{t("solicitacoes.guia.destino")}</b> {s.base.code} — {s.base.name}
          </p>
          {(s.base.address || s.base.city) && (
            <p>
              <b>{t("solicitacoes.guia.endereco")}</b> {[s.base.address, s.base.city && `${s.base.city}/${s.base.state ?? ""}`].filter(Boolean).join(" · ")}
            </p>
          )}
          <p>
            <b>{t("solicitacoes.guia.almoxarifado")}</b> {s.almoxarifado.code} — {s.almoxarifado.name}
          </p>
          <p>
            <b>{t("solicitacoes.guia.pedidaPor")}</b> {s.createdBy.name} {t("solicitacoes.guia.emData", { data: fmtDateTime(s.createdAt, t.locale) })} · <b>{t("solicitacoes.guia.aprovadaEm")}</b> {fmtDateTime(s.approvedAt, t.locale)}
          </p>
          {s.notes && (
            <p>
              <b>{t("solicitacoes.detalhe.observacao")}</b> {s.notes}
            </p>
          )}
        </section>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="py-1">{t("solicitacoes.guia.codigo")}</th>
              <th className="py-1">{t("solicitacoes.detalhe.col.insumo")}</th>
              <th className="py-1 text-right">{t("solicitacoes.detalhe.col.aprovado")}</th>
              <th className="w-28 py-1 text-right">{t("solicitacoes.detalhe.col.separado")}</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id} className="border-b border-black/30">
                <td className="py-2 font-mono">{i.produto.code}</td>
                <td className="py-2">{i.produto.name}</td>
                <td className="py-2 text-right tabular-nums">
                  {i.approved} {i.produto.unit}
                </td>
                <td className="py-2 text-right">______</td>
              </tr>
            ))}
          </tbody>
        </table>
        <footer className="grid grid-cols-2 gap-8 pt-10 text-sm">
          <p className="border-t border-black pt-1">{t("solicitacoes.guia.separadoPor")}</p>
          <p className="border-t border-black pt-1">{t("solicitacoes.guia.conferidoPor")}</p>
        </footer>
      </article>
    </div>
  );
}
