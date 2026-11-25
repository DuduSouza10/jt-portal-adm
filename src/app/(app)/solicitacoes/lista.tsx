import Link from "next/link";
import { Ban, CircleCheck, Clock, Layers, PackageCheck, PackageOpen, Search, Send, Truck, X } from "lucide-react";
import type { ReactNode } from "react";
import type { CurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { fmtDateTime } from "@/lib/format";
import { formatDuration } from "@/lib/sla";
import { getT } from "@/i18n/server";
import { abaDe, ABAS, formatNumber, totalDaAba, type AbaKey } from "@/modules/solicitacoes/rules";
import { basesParaPedir, contagemPorStatus, listSolicitacoes, PAGE_SIZE } from "@/modules/solicitacoes/queries";
import { Abas, type Aba } from "@/components/abas";
import { FiltroForm } from "@/components/filtro-form";
import { Pagination, pageParam, param } from "@/components/pagination";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SelectBox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PriorityBadge, StatusBadge } from "./badges";

const ICONE: Record<AbaKey, Aba["icon"]> = {
  abertas: Layers,
  PENDENTE: Clock,
  APROVADA: CircleCheck,
  EM_SEPARACAO: PackageOpen,
  SEPARADA: Truck,
  ENVIADA: Send,
  RECEBIDA: PackageCheck,
  ENCERRADAS: Ban,
};

/**
 * Lista de solicitações com filtros. Usada em /solicitacoes e, só com as franquias, em /franquias
 * (soFranquias: filtra pedidos de bases do tipo Franquia; basePath: para onde vão os filtros e a paginação).
 */
export async function SolicitacoesLista({
  user,
  sp,
  soFranquias = false,
  basePath = "/solicitacoes",
  header,
}: {
  user: CurrentUser;
  sp: Record<string, string | string[] | undefined>;
  soFranquias?: boolean;
  basePath?: string;
  header?: ReactNode;
}) {
  const t = await getT();
  const aba = abaDe(param(sp, "status"));
  const baseId = param(sp, "base");
  const regionalId = param(sp, "regional");
  const qRaw = param(sp, "q");
  const q = Number(qRaw?.replace(/\D/g, "")) || undefined;
  const page = pageParam(sp);
  const filtro = { baseId, regionalId, q, soFranquias };
  const [bases, porStatus, { rows, total, agora }] = await Promise.all([
    basesParaPedir(user).then((l) => (soFranquias ? l.filter((b) => b.type === "FRANQUIA") : l)),
    contagemPorStatus(user, filtro),
    listSolicitacoes(user, { ...filtro, status: aba.statuses, page }),
  ]);
  // Regionais do alcance de quem vê (vêm das bases que ele enxerga).
  const regionais = [...new Map(bases.map((b) => [b.regional.id, b.regional])).values()].sort((a, b) => a.code.localeCompare(b.code));
  const filtrando = !!(baseId || regionalId || qRaw);

  // Cada aba é um link com a sua URL e leva junto os filtros de regional, base e número.
  const href = (key: AbaKey, comFiltros = true) => {
    const qs = new URLSearchParams();
    if (key !== "abertas") qs.set("status", key);
    if (comFiltros) {
      if (regionalId) qs.set("regional", regionalId);
      if (baseId) qs.set("base", baseId);
      if (qRaw) qs.set("q", qRaw);
    }
    return qs.size ? `${basePath}?${qs}` : basePath;
  };
  // O número da aba chama atenção quando há trabalho esperando por quem está vendo.
  const espera: Partial<Record<AbaKey, boolean>> = {
    PENDENTE: can(user, "solicitacoes.aprovar"),
    APROVADA: can(user, "expedicao.separar"),
    EM_SEPARACAO: can(user, "expedicao.separar"),
    SEPARADA: can(user, "expedicao.enviar"),
  };
  const abas: Aba[] = ABAS.map((a) => ({
    href: href(a.key),
    label: t(`solicitacoes.abas.${a.key}`),
    icon: ICONE[a.key],
    count: totalDaAba(a, porStatus),
    tone: espera[a.key] ? "alerta" : undefined,
    ativa: a.key === aba.key,
  }));
  const misto = aba.statuses.length > 1;
  const mostraAlmox = aba.key !== "PENDENTE";

  return (
    <>
      {header ?? (
        <PageHeader
          title={t("solicitacoes.titulo")}
          description={t("solicitacoes.descricao")}
          actions={
            <>
              {can(user, "solicitacoes.aprovar") && (
                <Button asChild variant="outline">
                  <Link href="/solicitacoes/ciclos">{t("ciclos.titulo")}</Link>
                </Button>
              )}
              {can(user, "solicitacoes.criar") && (
                <Button asChild>
                  <Link href="/solicitacoes/nova">{t("solicitacoes.solicitar")}</Link>
                </Button>
              )}
            </>
          }
        />
      )}

      <Abas items={abas} label={t("solicitacoes.abas.nav")} />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <FiltroForm className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {aba.key !== "abertas" && <input type="hidden" name="status" value={aba.key} />}
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={qRaw} placeholder={t("solicitacoes.numPh")} aria-label={t("solicitacoes.numPh")} className="pl-9" />
          </div>
          {regionais.length > 1 && (
            <SelectBox name="regional" defaultValue={regionalId} className="max-w-56">
              <option value="">{t("solicitacoes.todasRegionais")}</option>
              {regionais.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.name}
                </option>
              ))}
            </SelectBox>
          )}
          {bases.length > 1 && (
            <SelectBox name="base" defaultValue={baseId} className="max-w-56">
              <option value="">{t("solicitacoes.todasBases")}</option>
              {bases.filter((b) => !regionalId || b.regionalId === regionalId).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.name}
                </option>
              ))}
            </SelectBox>
          )}
          {filtrando && (
            <Button asChild variant="ghost" size="sm">
              <Link href={href(aba.key, false)}>
                <X /> {t("solicitacoes.limparFiltros")}
              </Link>
            </Button>
          )}
        </FiltroForm>
        <p className="text-sm text-muted-foreground tabular-nums">{t("solicitacoes.total", { n: total })}</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState>{filtrando ? t("solicitacoes.vazioFiltro") : t(`solicitacoes.vazioAba.${aba.key}`)}</EmptyState>
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("solicitacoes.col.num")}</TableHead>
                <TableHead>{t("solicitacoes.col.base")}</TableHead>
                {misto && <TableHead>{t("solicitacoes.col.status")}</TableHead>}
                {mostraAlmox && <TableHead className="hidden md:table-cell">{t("solicitacoes.col.almox")}</TableHead>}
                <TableHead className="hidden text-right sm:table-cell">{t("solicitacoes.col.itens")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("solicitacoes.col.criada")}</TableHead>
                <TableHead className="text-right">{aba.final ? t("solicitacoes.col.finalizada") : t("solicitacoes.col.naEtapa")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="relative cursor-pointer">
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/solicitacoes/${r.id}`} className="font-mono font-semibold after:absolute after:inset-0 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                        {formatNumber(r.number)}
                      </Link>
                      <PriorityBadge priority={r.priority} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{r.base.code}</span>
                    {r.base.name !== r.base.code && <span className="ml-1.5 hidden text-muted-foreground sm:inline">{r.base.name}</span>}
                    {regionais.length > 1 && <span className="ml-2 hidden rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground sm:inline">{r.base.regional.code}</span>}
                  </TableCell>
                  {misto && (
                    <TableCell>
                      <StatusBadge status={r.status} />
                      {r.partial && <span className="ml-1 text-xs text-muted-foreground">{t("solicitacoes.parcial")}</span>}
                    </TableCell>
                  )}
                  {mostraAlmox && <TableCell className="hidden text-muted-foreground md:table-cell">{r.almoxarifado?.code ?? "—"}</TableCell>}
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{r._count.itens}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{fmtDateTime(r.createdAt, t.locale)}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums" title={fmtDateTime(r.statusChangedAt, t.locale)}>
                    {aba.final ? <span className="whitespace-nowrap">{fmtDateTime(r.statusChangedAt, t.locale).split(" ")[0]}<span className="hidden sm:inline"> {fmtDateTime(r.statusChangedAt, t.locale).split(" ").slice(1).join(" ")}</span></span> : formatDuration(agora - r.statusChangedAt.getTime())}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        basePath={basePath}
        params={{ status: aba.key === "abertas" ? undefined : aba.key, regional: regionalId, base: baseId, q: qRaw }}
      />
    </>
  );
}
