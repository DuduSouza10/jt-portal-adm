import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { modeloBases } from "@/modules/estrutura/planilha.service";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";


/** Planilha modelo (.xlsx) para importar regionais e bases: exemplos, instruções e as regionais que já existem. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || !can(user, "estrutura.editar")) return new Response("Sem permissão", { status: 403 });
  return new Response(new Uint8Array(await modeloBases()), {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": 'attachment; filename="modelo-importacao-bases.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
