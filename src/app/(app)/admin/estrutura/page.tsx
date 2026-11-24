import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileSpreadsheet, FileUp, Network, Plus, Table2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { isFeishuLoginEnabled } from "@/lib/feishu/config";
import { getT } from "@/i18n/server";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ListaBases } from "./lista-bases";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("estrutura.titulo") };
}

export default async function StructurePage() {
  const me = await requirePermission("estrutura.ver");
  const editable = can(me, "estrutura.editar");
  const t = await getT();
  const lista = await db.regional.findMany({
    orderBy: [{ active: "desc" }, { code: "asc" }],
    include: { bases: { orderBy: [{ active: "desc" }, { code: "asc" }] } },
  });
  // Só o necessário vai para o navegador: os links de webhook do Feishu das regionais e das bases ficam no servidor.
  const regionals = lista.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    active: r.active,
    hasStaffChat: !!r.feishuStaffChatId,
    hasShippingChat: !!r.feishuShippingChatId,
    bases: r.bases.map((b) => ({ id: b.id, code: b.code, name: b.name, type: b.type, city: b.city, state: b.state, active: b.active, hasChat: !!b.feishuChatId })),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("estrutura.titulo")}
        description={t("estrutura.descricao")}
        actions={
          <>
            {/* Exportar vale para quem só vê; modelo e importar, só para quem edita. */}
            <div role="group" aria-label={t("estrutura.planilha.titulo")} className="inline-flex items-center overflow-hidden rounded-lg border bg-card shadow-xs">
              <span className="hidden items-center gap-1.5 self-stretch border-r bg-muted/60 px-2.5 text-[13px] font-medium text-muted-foreground sm:inline-flex">
                <FileSpreadsheet className="size-4" aria-hidden /> {t("estrutura.planilha.titulo")}
              </span>
              <Button asChild variant="ghost" size="sm" className="h-8 rounded-none px-3">
                <a href="/api/exportar/bases" download>
                  <Download /> {t("estrutura.planilha.exportar")}
                </a>
              </Button>
              {editable && (
                <>
                  <Button asChild variant="ghost" size="sm" className="h-8 rounded-none border-l px-3">
                    <a href="/api/modelos/bases" download>
                      <Table2 /> {t("estrutura.planilha.modelo")}
                    </a>
                  </Button>
                  <Button asChild variant="ghost" size="sm" className="h-8 rounded-none border-l px-3">
                    <Link href="/admin/estrutura/importar">
                      <FileUp /> {t("estrutura.planilha.importar")}
                    </Link>
                  </Button>
                </>
              )}
            </div>
            {editable && (
              <>
                {isFeishuLoginEnabled() && (
                  <Button asChild variant="outline">
                    <Link href="/admin/estrutura/feishu">
                      <Network /> {t("estrutura.feishu.botao")}
                    </Link>
                  </Button>
                )}
                <Button asChild variant="outline">
                  <Link href="/admin/estrutura/regionais/novo">
                    <Plus /> {t("estrutura.regional")}
                  </Link>
                </Button>
                <Button asChild disabled={regionals.length === 0}>
                  <Link href="/admin/estrutura/bases/novo">
                    <Plus /> {t("estrutura.base")}
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />
      {regionals.length === 0 ? <EmptyState>{t("estrutura.vazio")}</EmptyState> : <ListaBases regionals={regionals} editable={editable} />}
    </div>
  );
}
