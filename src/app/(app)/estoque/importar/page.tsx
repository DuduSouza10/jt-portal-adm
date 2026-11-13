import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";
import { listAlmoxarifados } from "@/modules/estoque/queries";
import type { ImportOption } from "@/components/import-wizard";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/page-header";
import { param } from "@/components/pagination";
import { EstoqueNav } from "../nav";
import { EstoqueImportWizard, ProdutosImportWizard } from "./wizards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("importacao.estoque.titulo") };
}

/** Importação por planilha: saldos/entradas do estoque e o catálogo de produtos. */
export default async function ImportarEstoquePage(props: PageProps<"/estoque/importar">) {
  const user = await requirePermission(["estoque.inventario", "estoque.movimentar", "produtos.editar"]);
  const t = await getT();
  const podeEstoque = can(user, "estoque.inventario") || can(user, "estoque.movimentar");
  const podeProdutos = can(user, "produtos.editar");
  const pedido = param(await props.searchParams, "tipo");
  const tipo = pedido === "produtos" || !podeEstoque ? "produtos" : "estoque";
  if (tipo === "produtos" && !podeProdutos) notFound();

  const almox = tipo === "estoque" ? await listAlmoxarifados(user) : [];
  const modos = [
    can(user, "estoque.inventario") && { value: "contado", label: t("importacao.estoque.modoContado") },
    can(user, "estoque.movimentar") && { value: "entrada", label: t("importacao.estoque.modoEntrada") },
  ].filter((m): m is { value: string; label: string } => !!m);
  const options: ImportOption[] = [
    { name: "mode", label: t("importacao.estoque.modo"), kind: "select", required: true, choices: modos, hint: t("importacao.estoque.modoAjuda") },
    {
      name: "almoxarifadoId",
      label: t("importacao.estoque.almox"),
      kind: "select",
      choices: almox.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
      defaultValue: almox.length === 1 ? almox[0].id : "",
      hint: t("importacao.estoque.almoxAjuda"),
    },
    { name: "document", label: t("importacao.estoque.documento"), kind: "text", required: true, showIf: { name: "mode", value: "entrada" }, placeholder: "NF 12345" },
    { name: "reason", label: t("importacao.estoque.motivo"), kind: "text", required: true, showIf: { name: "mode", value: "contado" }, placeholder: t("importacao.estoque.motivoExemplo") },
  ];

  const tabs = [
    podeEstoque && { href: "/estoque/importar", label: t("importacao.estoque.abaEstoque"), active: tipo === "estoque" },
    podeProdutos && { href: "/estoque/importar?tipo=produtos", label: t("importacao.estoque.abaProdutos"), active: tipo === "produtos" },
  ].filter((x): x is { href: string; label: string; active: boolean } => !!x);

  return (
    <div className="space-y-4">
      <PageHeader title={t("importacao.estoque.titulo")} description={t("importacao.estoque.descricao")} />
      {can(user, "estoque.ver") && <EstoqueNav user={user} current="/estoque/importar" />}
      {tabs.length > 1 && (
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={cn("rounded-md border px-3 py-1.5 text-sm", tab.active ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      )}
      <Card className="max-w-5xl">
        <CardContent>
          {tipo === "produtos" ? (
            <ProdutosImportWizard
              key="produtos"
              instructions={
                <ul className="list-disc space-y-1 pl-5">
                  <li>{t("importacao.produtos.ajuda1")}</li>
                  <li>{t("importacao.produtos.ajuda2")}</li>
                </ul>
              }
            />
          ) : almox.length === 0 ? (
            <EmptyState>{t("importacao.estoque.semAlmox")}</EmptyState>
          ) : (
            <EstoqueImportWizard
              key="estoque"
              options={options}
              instructions={
                <ul className="list-disc space-y-1 pl-5">
                  <li>{t("importacao.estoque.ajuda1")}</li>
                  <li>{t("importacao.estoque.ajuda2")}</li>
                  <li>{t("importacao.estoque.ajuda3")}</li>
                </ul>
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
