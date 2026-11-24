import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { baseScopeWhere, can } from "@/lib/permissions/check";
import { db } from "@/lib/db";
import { getT } from "@/i18n/server";
import { listProdutosAtivos, listSaldos, PAGE_SIZE } from "@/modules/estoque/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionForm } from "@/components/action-form";
import { EmptyState } from "@/components/page-header";
import { Field, selectClass } from "@/components/form-field";
import { Pagination, pageParam, param } from "@/components/pagination";
import { FranquiasNav } from "../nav";
import { registrarUsoAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("franquias.abas.estoque") };
}

/** Franquias → Estoque: o estoque de cada franquia (K7). Entra pelo recebimento; sai pelo "Registrar uso". */
export default async function FranquiasEstoquePage(props: PageProps<"/franquias/estoque">) {
  const user = await requirePermission("franquias.ver");
  const t = await getT();
  const sp = await props.searchParams;
  const scope = baseScopeWhere(user);
  const franquias = await db.base.findMany({
    where: { type: "FRANQUIA", active: true, ...(scope && { AND: [scope] }) },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  const base = param(sp, "base");
  const q = param(sp, "q");
  const page = pageParam(sp);
  const baseIds = base && franquias.some((f) => f.id === base) ? [base] : franquias.map((f) => f.id);
  const [{ rows, total }, produtos] = await Promise.all([listSaldos({ baseIds, q, page }), listProdutosAtivos()]);
  const podeUsar = can(user, "franquias.estoque");

  return (
    <div className="space-y-4">
      <FranquiasNav user={user} current="/franquias/estoque" />
      <p className="text-sm text-muted-foreground">{t("franquias.estoque.descricao")}</p>
      {franquias.length === 0 ? (
        <EmptyState>{t("solicitacoes.nova.semBase")}</EmptyState>
      ) : (
        <>
          {podeUsar && (
            <Card>
              <CardHeader>
                <CardTitle>{t("franquias.estoque.registrarUso")}</CardTitle>
                <CardDescription>{t("franquias.estoque.usoAjuda")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ActionForm action={registrarUsoAction} submitLabel={t("franquias.estoque.salvar")}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t("franquias.estoque.franquia")} htmlFor="baseId">
                      <select id="baseId" name="baseId" defaultValue={baseIds.length === 1 ? baseIds[0] : ""} required className={selectClass}>
                        {franquias.length > 1 && <option value="">{t("comum.escolha")}</option>}
                        {franquias.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.code} · {f.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={t("franquias.estoque.produto")} htmlFor="produtoId">
                      <select id="produtoId" name="produtoId" defaultValue="" required className={selectClass}>
                        <option value="">{t("comum.escolha")}</option>
                        {produtos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} · {p.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={t("franquias.estoque.quantidade")} htmlFor="quantity">
                      <Input id="quantity" name="quantity" type="number" min={1} step={1} required />
                    </Field>
                    <Field label={t("franquias.estoque.motivo")} htmlFor="reason">
                      <Input id="reason" name="reason" maxLength={200} />
                    </Field>
                  </div>
                </ActionForm>
              </CardContent>
            </Card>
          )}
          <form className="flex flex-wrap items-center gap-2">
            {franquias.length > 1 && (
              <select name="base" defaultValue={base} className={`${selectClass} max-w-64`}>
                <option value="">{t("franquias.titulo")}</option>
                {franquias.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} · {f.name}
                  </option>
                ))}
              </select>
            )}
            <Input name="q" defaultValue={q} placeholder={t("estoque.produtoBusca")} className="max-w-xs" />
            <Button type="submit" variant="outline">
              {t("comum.filtrar")}
            </Button>
          </form>
          {rows.length === 0 ? (
            <EmptyState>{t("franquias.estoque.vazio")}</EmptyState>
          ) : (
            <Card className="py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("franquias.estoque.franquia")}</TableHead>
                    <TableHead>{t("franquias.estoque.col.codigo")}</TableHead>
                    <TableHead>{t("franquias.estoque.col.produto")}</TableHead>
                    <TableHead className="text-right">{t("franquias.estoque.col.saldo")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={`${r.baseId}:${r.produtoId}`}>
                      <TableCell className="font-medium">{r.base.code}</TableCell>
                      <TableCell className="font-mono">{r.produto.code}</TableCell>
                      <TableCell>{r.produto.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.quantity} {r.produto.unit}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath="/franquias/estoque" params={{ base, q }} />
        </>
      )}
    </div>
  );
}
