"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { firstIssue, runAction, type FormState } from "@/lib/action-result";
import { pedidoSettingsSchema, savePedidoSettings, saveSlaSettings, slaSettingsSchema } from "@/lib/settings";

/** Feriado digitado como 25/12/2026 ou 2026-12-25 → 2026-12-25. Linhas vazias são ignoradas. */
function parseHolidays(text: string) {
  return text
    .split(/[\n,;]+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(l);
      return br ? `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}` : l;
    });
}

export async function salvarSlaAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requirePermission("configuracoes.editar");
  const n = (k: string) => String(f.get(k) ?? "").replace(",", ".");
  const parsed = slaSettingsSchema.safeParse({
    targets: {
      aprovacao: { normal: n("aprovacao.normal"), urgente: n("aprovacao.urgente") },
      separacao: { normal: n("separacao.normal"), urgente: n("separacao.urgente") },
      expedicao: { normal: n("expedicao.normal"), urgente: n("expedicao.urgente") },
    },
    businessHours: {
      start: String(f.get("start") ?? ""),
      end: String(f.get("end") ?? ""),
      days: f.getAll("days").map(Number),
      holidays: [...new Set(parseHolidays(String(f.get("holidays") ?? "")))].sort(),
    },
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const r = await runAction("configuracao.sla", () => saveSlaSettings(user, parsed.data));
  if (r.error) return r;
  revalidatePath("/admin/configuracoes");
  revalidatePath("/relatorios");
  return { ok: true, message: "Configurações salvas." };
}

/** Ciclo de 3 meses da base (S1): ligar/desligar e quantos meses. */
export async function salvarPedidosAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requirePermission("configuracoes.editar");
  const parsed = pedidoSettingsSchema.safeParse({ cicloAtivo: f.get("cicloAtivo") === "on", cicloMeses: f.get("cicloMeses") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const r = await runAction("configuracao.pedidos", () => savePedidoSettings(user, parsed.data));
  if (r.error) return r;
  revalidatePath("/admin/configuracoes");
  revalidatePath("/solicitacoes/ciclos");
  return { ok: true, message: "Configurações salvas." };
}
