import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { getOrgChart } from "@/lib/feishu/client";
import { isFeishuLoginEnabled } from "@/lib/feishu/config";
import { errorInfo, logger } from "@/lib/logger";
import { getT } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { desceNoOrganograma, estruturaDoOrganograma } from "@/modules/acessos/feishu-rules";
import { importarEstruturaFeishu, type ResultadoEstrutura } from "@/modules/acessos/estrutura-feishu.service";
import { ActionForm } from "@/components/action-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/page-header";
import { importarEstruturaFeishuAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("estrutura.feishu.titulo") };
}

/**
 * Importar regionais e bases do organograma do Feishu (E11). Abre sempre com a PRÉVIA (nada é gravado);
 * o botão grava. Mesmas regras do login: SPN = cada unidade é base; MG = cada CD é base.
 */
export default async function EstruturaFeishuPage() {
  const me = await requirePermission("estrutura.editar");
  const t = await getT();
  const header = (
    <PageHeader title={t("estrutura.feishu.titulo")} description={t("estrutura.feishu.descricao")} back={{ href: "/admin/estrutura", label: t("nav.estrutura.label") }} />
  );
  if (!isFeishuLoginEnabled())
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        {header}
        <EmptyState>{t("estrutura.feishu.desligado")}</EmptyState>
      </div>
    );

  let previa: ResultadoEstrutura | null = null;
  let erro = false;
  try {
    previa = await importarEstruturaFeishu(me, estruturaDoOrganograma(await getOrgChart(desceNoOrganograma)), false);
  } catch (e) {
    logger.error("estrutura.feishu.previa", errorInfo(e));
    erro = true;
  }
  const pendentes = previa ? previa.basesCriadas + previa.basesLigadas : 0;
  const tom = { existe: "text-muted-foreground", ligada: "text-warning", criada: "text-success" } as const;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {header}
      <Card>
        <CardContent className="space-y-3 text-sm">
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>{t("estrutura.feishu.ajuda1")}</li>
            <li>{t("estrutura.feishu.ajuda2")}</li>
            <li>{t("estrutura.feishu.ajuda3")}</li>
          </ul>
        </CardContent>
      </Card>

      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{t("estrutura.feishu.erro")}</AlertDescription>
        </Alert>
      )}

      {previa && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {(
              [
                ["regionaisCriadas", previa.regionaisCriadas],
                ["basesCriadas", previa.basesCriadas],
                ["basesLigadas", previa.basesLigadas],
                ["basesExistentes", previa.basesExistentes],
              ] as const
            ).map(([k, n]) => (
              <Card key={k}>
                <CardContent className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t(`estrutura.feishu.${k}`)}</p>
                  <p className="text-2xl font-semibold tabular-nums">{n}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {previa.linhas.length === 0 ? (
            <EmptyState>{t("estrutura.feishu.nenhuma")}</EmptyState>
          ) : (
            <Card className="overflow-hidden py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-[18px]">{t("estrutura.regional")}</TableHead>
                    <TableHead>{t("estrutura.base")}</TableHead>
                    <TableHead>{t("estrutura.feishu.nome")}</TableHead>
                    <TableHead>{t("estrutura.feishu.tipo")}</TableHead>
                    <TableHead className="pr-[18px]">{t("estrutura.feishu.situacao")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previa.linhas.map((l) => (
                    <TableRow key={l.base.code}>
                      <TableCell className="pl-[18px]">
                        <span className="font-mono font-semibold">{l.regional.code}</span> <span className="text-muted-foreground">{l.regional.name}</span>
                        {l.regional.acao === "criada" && <span className="ml-1.5 text-xs text-success">({t("estrutura.feishu.acao.criada")})</span>}
                      </TableCell>
                      <TableCell className="font-mono">{l.base.code}</TableCell>
                      <TableCell>{l.base.name}</TableCell>
                      <TableCell>{t(l.base.type === "FRANQUIA" ? "estrutura.feishu.franquia" : "estrutura.feishu.propria")}</TableCell>
                      <TableCell className={cn("pr-[18px] font-medium", tom[l.base.acao])}>{t(`estrutura.feishu.acao.${l.base.acao}`)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {pendentes > 0 ? (
            <ActionForm action={importarEstruturaFeishuAction} submitLabel={t("estrutura.feishu.importar", { n: pendentes })} />
          ) : (
            previa.linhas.length > 0 && <p className="text-sm text-muted-foreground">{t("estrutura.feishu.tudoEmDia")}</p>
          )}
        </>
      )}
    </div>
  );
}
