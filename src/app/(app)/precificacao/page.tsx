import type { Metadata } from "next";
import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { listaPrecificacao, ultimasAlteracoes } from "@/modules/produtos/precificacao.service";
import { variacaoPreco } from "@/modules/produtos/preco";
import { param } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { PrecoForm } from "./preco-form";
import { PlanilhaPrecosForm } from "./planilha-form";

// Atualizar por planilha grava um produto por vez: dá tempo para centenas de linhas.
export const maxDuration = 300;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("precificacao.titulo") };
}

/**
 * Precificação (P6): o administrador altera o preço dos produtos. O preço vira o custo médio em todos os
 * almoxarifados e vale na hora para o valor do estoque e para os próximos envios.
 */
export default async function PrecificacaoPage(props: PageProps<"/precificacao">) {
  await requirePermission("produtos.precificar");
  const t = await getT();
  const sp = await props.searchParams;
  const q = param(sp, "q") ?? "";
  const soSemPreco = param(sp, "filtro") === "sem-preco";
  const [linhas, todas, historico] = await Promise.all([listaPrecificacao(q, soSemPreco), listaPrecificacao(), ultimasAlteracoes(30)]);
  const semPreco = todas.filter((l) => l.preco.valor == null).length;
  const money = new Intl.NumberFormat(t.locale, { style: "currency", currency: "BRL" });
  const pct = new Intl.NumberFormat(t.locale, { maximumFractionDigits: 1, signDisplay: "always" });
  const link = (over: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const all = { q: q || undefined, filtro: soSemPreco ? "sem-preco" : undefined, ...over };
    for (const [k, v] of Object.entries(all)) if (v) u.set(k, v);
    const s = u.toString();
    return `/precificacao${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t("precificacao.titulo")} description={t("precificacao.descricao")} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("precificacao.kpiProdutos")}</p>
            <p className="text-2xl font-semibold tabular-nums">{todas.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("precificacao.kpiComPreco")}</p>
            <p className="text-2xl font-semibold text-success tabular-nums">{todas.length - semPreco}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("precificacao.kpiSemPreco")}</p>
            <p className={cn("text-2xl font-semibold tabular-nums", semPreco ? "text-warning" : "text-muted-foreground")}>{semPreco}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-2">
          <div>
            <h2 className="text-[15px] font-semibold">{t("precificacao.planilhaTitulo")}</h2>
            <p className="text-xs text-muted-foreground">{t("precificacao.planilhaAjuda")}</p>
          </div>
          <PlanilhaPrecosForm />
        </CardContent>
      </Card>

      <form className="flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={q} placeholder={t("precificacao.buscar")} className="w-72" aria-label={t("comum.buscar")} />
        {soSemPreco && <input type="hidden" name="filtro" value="sem-preco" />}
        <Button type="submit" variant="outline">
          {t("comum.filtrar")}
        </Button>
        <div className="ml-auto flex gap-1">
          <Button asChild variant={soSemPreco ? "ghost" : "secondary"} size="sm">
            <Link href={link({ filtro: undefined })}>{t("precificacao.todos")}</Link>
          </Button>
          <Button asChild variant={soSemPreco ? "secondary" : "ghost"} size="sm">
            <Link href={link({ filtro: "sem-preco" })}>{t("precificacao.semPreco", { n: semPreco })}</Link>
          </Button>
        </div>
      </form>

      {linhas.length === 0 ? (
        <EmptyState>{t("precificacao.nenhum")}</EmptyState>
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-[18px]">{t("precificacao.produto")}</TableHead>
                <TableHead>{t("precificacao.unidade")}</TableHead>
                <TableHead className="text-right">{t("precificacao.precoAtual")}</TableHead>
                <TableHead>{t("precificacao.ultima")}</TableHead>
                <TableHead className="pr-[18px] text-right">{t("precificacao.novoPreco")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="pl-[18px]">
                    <span className="font-medium">{l.name}</span> <span className="font-mono text-xs text-muted-foreground">{l.code}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{l.unit}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.preco.valor == null ? (
                      <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">{t("precificacao.semPrecoTag")}</span>
                    ) : (
                      <>
                        <span className="font-semibold">{money.format(l.preco.valor)}</span>
                        {l.preco.varia && (
                          <span className="block text-xs text-muted-foreground">
                            {t("precificacao.varia", { min: money.format(l.preco.min!), max: money.format(l.preco.max!) })}
                          </span>
                        )}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.ultima ? `${fmtDateTime(l.ultima.quando, t.locale)} · ${l.ultima.quem}` : "—"}
                  </TableCell>
                  <TableCell className="pr-[18px]">
                    <PrecoForm produtoId={l.id} valor={l.preco.valor} nome={l.name} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <section className="overflow-hidden rounded-[14px] border bg-card shadow-xs">
        <div className="px-[18px] pt-4 pb-2">
          <h2 className="text-[15px] font-semibold">{t("precificacao.historico")}</h2>
          <p className="text-xs text-muted-foreground">{t("precificacao.historicoNota")}</p>
        </div>
        {historico.length === 0 ? (
          <p className="px-[18px] pt-1 pb-5 text-sm text-muted-foreground">{t("precificacao.historicoVazio")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-[18px]">{t("precificacao.quando")}</TableHead>
                <TableHead>{t("precificacao.produto")}</TableHead>
                <TableHead className="text-right">{t("precificacao.antes")}</TableHead>
                <TableHead className="text-right">{t("precificacao.depois")}</TableHead>
                <TableHead>{t("precificacao.quem")}</TableHead>
                <TableHead className="pr-[18px]">{t("precificacao.motivoCol")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historico.map((h) => {
                const antes = h.valorAnterior == null ? null : Number(h.valorAnterior);
                const depois = Number(h.valorNovo);
                const v = variacaoPreco(antes, depois);
                return (
                  <TableRow key={h.id}>
                    <TableCell className="pl-[18px] text-xs text-muted-foreground">{fmtDateTime(h.createdAt, t.locale)}</TableCell>
                    <TableCell>
                      <span className="font-medium">{h.produto.name}</span> <span className="font-mono text-xs text-muted-foreground">{h.produto.code}</span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">{antes == null ? t("precificacao.semPrecoTag") : money.format(antes)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {money.format(depois)}
                      {v != null && (
                        <span className={cn("ml-1.5 inline-flex items-center gap-0.5 text-xs", v > 0 ? "text-accent-foreground" : "text-success")}>
                          {v > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                          {pct.format(v)}%
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{h.actor.name}</TableCell>
                    <TableCell className="pr-[18px] text-xs text-muted-foreground">{h.motivo ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
