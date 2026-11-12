"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { firstIssue, runAction, type FormState } from "@/lib/action-result";
import { entradaSchema, inventarioSchema, minimoSchema, saidaSchema, transferenciaSchema } from "@/modules/estoque/schemas";
import { ajustarInventario, definirMinimo, lancarEntrada, lancarSaida, transferir } from "@/modules/estoque/service";

const form = (f: FormData) => Object.fromEntries(f);

/** Estado devolvido pelos lançamentos: link para ver o lote nas movimentações. */
export type LancamentoState = FormState & { batchId?: string; warnings?: string[] };

export async function lancarAction(_: LancamentoState, f: FormData): Promise<LancamentoState> {
  const user = await requirePermission("estoque.movimentar");
  const tipo = String(f.get("tipo"));
  let batchId = "";
  const result = await runAction(`estoque.${tipo}`, async () => {
    if (tipo === "entrada") {
      const p = entradaSchema.safeParse(form(f));
      if (!p.success) return { error: firstIssue(p.error) };
      batchId = await lancarEntrada(user, p.data);
    } else if (tipo === "saida") {
      const p = saidaSchema.safeParse(form(f));
      if (!p.success) return { error: firstIssue(p.error) };
      batchId = await lancarSaida(user, p.data);
    } else if (tipo === "transferencia") {
      const p = transferenciaSchema.safeParse(form(f));
      if (!p.success) return { error: firstIssue(p.error) };
      batchId = await transferir(user, p.data);
    } else {
      return { error: "Tipo de lançamento inválido." };
    }
  });
  if (result.error) return result;
  revalidatePath("/estoque");
  return { ok: true, message: "Lançamento registrado.", batchId };
}

export async function inventarioAction(_: LancamentoState, f: FormData): Promise<LancamentoState> {
  const user = await requirePermission("estoque.inventario");
  const p = inventarioSchema.safeParse(form(f));
  if (!p.success) return { error: firstIssue(p.error) };
  const holder: { r?: Awaited<ReturnType<typeof ajustarInventario>> } = {};
  const result = await runAction("estoque.inventario", async () => {
    holder.r = await ajustarInventario(user, p.data);
  });
  if (result.error || !holder.r) return result;
  revalidatePath("/estoque");
  const r = holder.r;
  return {
    ok: true,
    message: `Inventário registrado: ${r.changed} produto(s) com diferença.`,
    batchId: r.batchId,
    warnings: r.warnings.map((w) => `${w.produto}: contado ${w.contado}, mas ${w.reservado} já reservado(s) para solicitações aprovadas.`),
  };
}

export async function definirMinimoAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requirePermission("estoque.movimentar");
  const p = minimoSchema.safeParse(form(f));
  if (!p.success) return { error: firstIssue(p.error) };
  const result = await runAction("estoque.minimo", () => definirMinimo(user, p.data));
  if (!result.error) revalidatePath("/estoque");
  return result;
}
