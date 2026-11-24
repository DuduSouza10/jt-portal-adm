import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { getCurrentUser } from "@/lib/auth/session";
import { TZ } from "@/lib/format";
import { can } from "@/lib/permissions/check";
import { exportarBases } from "@/modules/estrutura/planilha.service";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Todas as regionais e bases (.xlsx), no mesmo formato da importação: dá para editar e importar de volta. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || !can(user, "estrutura.ver")) return new Response("Sem permissão", { status: 403 });
  const dia = format(new TZDate(new Date(), TZ), "yyyy-MM-dd");
  return new Response(new Uint8Array(await exportarBases()), {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="bases-${dia}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
