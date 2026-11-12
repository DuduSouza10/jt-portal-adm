import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { listAlmoxarifados, listProdutosAtivos } from "@/modules/estoque/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { selectClass } from "@/components/form-field";
import { param } from "@/components/pagination";
import { EstoqueNav } from "../nav";
import { InventarioForm } from "./inventario-form";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("inventario.titulo") };
}

export default async function InventarioPage(props: PageProps<"/estoque/inventario">) {
  const user = await requirePermission("estoque.inventario");
  const t = await getT();
  const almox = await listAlmoxarifados(user);
  const baseId = param(await props.searchParams, "base");
  const base = almox.find((a) => a.id === baseId) ?? (almox.length === 1 ? almox[0] : undefined);

  const [produtos, saldos] = base
    ? await Promise.all([
        listProdutosAtivos(),
        db.stockBalance.findMany({ where: { baseId: base.id }, select: { produtoId: true, quantity: true, reserved: true } }),
      ])
    : [[], []];
  const saldoMap = new Map(saldos.map((s) => [s.produtoId, s]));

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("inventario.titulo")}
        description={t("inventario.descricao")}
      />
      <EstoqueNav user={user} current="/estoque/inventario" />
      {almox.length === 0 ? (
        <EmptyState>{t("estoque.semAlmoxCurto")}</EmptyState>
      ) : (
        <>
          <form className="flex gap-2">
            <select name="base" defaultValue={base?.id ?? ""} className={`${selectClass} max-w-72`} required>
              <option value="" disabled>
                {t("inventario.escolhaAlmox")}
              </option>
              {almox.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              {t("comum.abrir")}
            </Button>
          </form>
          {base && (
            <Card>
              <CardContent>
                <InventarioForm
                  key={base.id}
                  baseId={base.id}
                  baseLabel={`${base.code} · ${base.name}`}
                  linhas={produtos.map((p) => ({
                    produtoId: p.id,
                    code: p.code,
                    name: p.name,
                    unit: p.unit,
                    atual: saldoMap.get(p.id)?.quantity ?? 0,
                    reservado: saldoMap.get(p.id)?.reserved ?? 0,
                  }))}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
