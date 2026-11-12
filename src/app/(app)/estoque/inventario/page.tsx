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

export const metadata: Metadata = { title: "Inventário" };

export default async function InventarioPage(props: PageProps<"/estoque/inventario">) {
  const user = await requirePermission("estoque.inventario");
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
        title="Inventário"
        description="Informe a quantidade contada de cada produto. O saldo físico passa a ser exatamente o contado."
      />
      <EstoqueNav user={user} current="/estoque/inventario" />
      {almox.length === 0 ? (
        <EmptyState>Nenhum almoxarifado no seu alcance.</EmptyState>
      ) : (
        <>
          <form className="flex gap-2">
            <select name="base" defaultValue={base?.id ?? ""} className={`${selectClass} max-w-72`} required>
              <option value="" disabled>
                Escolha o almoxarifado…
              </option>
              {almox.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              Abrir
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
