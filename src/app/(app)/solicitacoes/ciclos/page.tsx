import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { baseScopeWhere, can } from "@/lib/permissions/check";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { getPedidoSettings } from "@/lib/settings";
import { getT } from "@/i18n/server";
import { formatNumber } from "@/modules/solicitacoes/rules";
import { COUNTED, diaDeHoje, holdActive } from "@/modules/solicitacoes/limites";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { AjusteForm } from "./ajuste-form";
import { CancelarLiberacaoForm, LiberarDiaForm } from "./liberar-dia-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("ciclos.titulo") };
}

const dateInput = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Ciclos das bases (S1) e das franquias (S20) e produtos bloqueados por limite (S3), com liberação manual. */
export default async function CiclosPage() {
  const user = await requirePermission("solicitacoes.aprovar");
  const t = await getT();
  const podeLiberar = can(user, "solicitacoes.liberar");
  const scope = baseScopeWhere(user);
  const now = new Date();
  const hoje = diaDeHoje(now);
  const [cfg, ciclos, bloqueios, liberacoes, basesProprias] = await Promise.all([
    getPedidoSettings(),
    db.cicloBase.findMany({ where: { revokedAt: null, blockedUntil: { gt: now }, ...(scope && { base: scope }) }, include: { base: true }, orderBy: { blockedUntil: "asc" } }),
    db.bloqueioProduto.findMany({ where: { revokedAt: null, blockedUntil: { gt: now }, ...(scope && { base: scope }) }, include: { base: true, produto: true }, orderBy: { blockedUntil: "asc" } }),
    // S23: liberações de urgência de hoje e as bases próprias que ainda podem receber uma.
    podeLiberar ? db.liberacaoDia.findMany({ where: { dia: hoje, ...(scope && { base: scope }) }, include: { base: true }, orderBy: { createdAt: "asc" } }) : [],
    podeLiberar ? db.base.findMany({ where: { active: true, type: "BASE", ...(scope && { AND: [scope] }) }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }) : [],
  ]);
  const liberadas = new Set(liberacoes.map((l) => l.baseId));
  const baseParaLiberar = basesProprias.filter((b) => !liberadas.has(b.id));
  // Ciclo/bloqueio cujo pedido de origem foi recusado ou cancelado não vale mais.
  const ids = [...ciclos, ...bloqueios].flatMap((x) => (x.sourceSolicitacaoId ? [x.sourceSolicitacaoId] : []));
  const origens = new Map((await db.solicitacao.findMany({ where: { id: { in: ids } }, select: { id: true, number: true, status: true } })).map((s) => [s.id, s]));
  const valendo = <T extends { blockedUntil: Date; revokedAt: Date | null; sourceSolicitacaoId: string | null }>(x: T) =>
    holdActive({ ...x, sourceStatus: x.sourceSolicitacaoId ? (origens.get(x.sourceSolicitacaoId)?.status ?? "CANCELADA") : null }, now);
  const origem = (id: string | null) => (id && origens.get(id) && COUNTED.includes(origens.get(id)!.status) ? formatNumber(origens.get(id)!.number) : "—");
  const ciclosAtivos = cfg.cicloAtivo ? ciclos.filter(valendo) : [];
  const bloqueiosAtivos = cfg.limitesAtivos ? bloqueios.filter(valendo) : [];

  return (
    <div className="space-y-4">
      <PageHeader title={t("ciclos.titulo")} description={t("ciclos.descricao", { meses: cfg.cicloMeses })} back={{ href: "/solicitacoes", label: t("solicitacoes.titulo") }} />
      {!cfg.cicloAtivo && (
        <Alert>
          <AlertDescription className="text-foreground">{t("ciclos.desligado")}</AlertDescription>
        </Alert>
      )}
      {!cfg.limitesAtivos && (
        <Alert>
          <AlertDescription className="text-foreground">{t("ciclos.limitesDesligados")}</AlertDescription>
        </Alert>
      )}

      {podeLiberar && (
        <section className="space-y-2">
          <h2 className="font-semibold">{t("ciclos.liberarDia.titulo", { n: liberacoes.length })}</h2>
          <p className="text-sm text-muted-foreground">{t("ciclos.liberarDia.descricao")}</p>
          <LiberarDiaForm bases={baseParaLiberar} />
          {liberacoes.length > 0 && (
            <Card className="py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("ciclos.base")}</TableHead>
                    <TableHead>{t("ciclos.liberarDia.liberadaEm")}</TableHead>
                    <TableHead className="text-right">{t("ciclos.acoes")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liberacoes.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <span className="font-medium">{l.base.code}</span> <span className="text-muted-foreground">{l.base.name}</span>
                      </TableCell>
                      <TableCell className="tabular-nums">{fmtDateTime(l.createdAt, t.locale)}</TableCell>
                      <TableCell>
                        <CancelarLiberacaoForm id={l.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">{t("ciclos.basesNoCiclo", { n: ciclosAtivos.length })}</h2>
        {ciclosAtivos.length === 0 ? (
          <EmptyState>{t("ciclos.nenhumCiclo")}</EmptyState>
        ) : (
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ciclos.base")}</TableHead>
                  <TableHead>{t("ciclos.ate")}</TableHead>
                  <TableHead>{t("ciclos.origem")}</TableHead>
                  {podeLiberar && <TableHead className="text-right">{t("ciclos.acoes")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ciclosAtivos.map((c) => (
                  <TableRow key={c.baseId}>
                    <TableCell>
                      <span className="font-medium">{c.base.code}</span> <span className="text-muted-foreground">{c.base.name}</span>
                    </TableCell>
                    <TableCell className="tabular-nums">{fmtDateTime(c.blockedUntil, t.locale)}</TableCell>
                    <TableCell className="font-mono text-sm">{origem(c.sourceSolicitacaoId)}</TableCell>
                    {podeLiberar && (
                      <TableCell>
                        <AjusteForm tipo="ciclo" id={c.baseId} ate={dateInput(c.blockedUntil)} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("ciclos.produtosBloqueados", { n: bloqueiosAtivos.length })}</h2>
        {bloqueiosAtivos.length === 0 ? (
          <EmptyState>{t("ciclos.nenhumBloqueio")}</EmptyState>
        ) : (
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ciclos.base")}</TableHead>
                  <TableHead>{t("ciclos.produto")}</TableHead>
                  <TableHead>{t("ciclos.ate")}</TableHead>
                  <TableHead>{t("ciclos.motivo")}</TableHead>
                  {podeLiberar && <TableHead className="text-right">{t("ciclos.acoes")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {bloqueiosAtivos.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.base.code}</TableCell>
                    <TableCell>
                      <span className="font-medium">{b.produto.code}</span> <span className="text-muted-foreground">{b.produto.name}</span>
                    </TableCell>
                    <TableCell className="tabular-nums">{fmtDateTime(b.blockedUntil, t.locale)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {b.reason} {origem(b.sourceSolicitacaoId) !== "—" && `(${origem(b.sourceSolicitacaoId)})`}
                    </TableCell>
                    {podeLiberar && (
                      <TableCell>
                        <AjusteForm tipo="bloqueio" id={b.id} ate={dateInput(b.blockedUntil)} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
