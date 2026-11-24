import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { BASES_TEMPLATE_CSV } from "@/modules/estrutura/importacao";

/** Planilha modelo para importar regionais e bases (abre no Excel: UTF-8 com BOM, separada por ";"). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || !can(user, "estrutura.editar")) return new Response("Sem permissão", { status: 403 });
  return new Response("﻿" + BASES_TEMPLATE_CSV, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="modelo-importacao-bases.csv"',
      "Cache-Control": "no-store",
    },
  });
}
