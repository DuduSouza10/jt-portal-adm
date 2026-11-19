"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { errorInfo, logger } from "@/lib/logger";
import type { ImportResult } from "@/lib/importacao/csv";
import { CODE_RE } from "@/modules/estrutura/importacao";
import { APPLY_BATCH, aplicarLote, validarLote, VALIDATE_BATCH } from "@/modules/estrutura/importacao.service";

// O navegador já conferiu a planilha; aqui o formato é conferido de novo (nunca confiar no cliente).
const text = (max: number) => z.string().trim().max(max).nullable();
const rowSchema = z.object({
  line: z.number().int().min(2),
  code: z.string().regex(CODE_RE),
  name: z.string().trim().min(2).max(200),
  type: z.enum(["BASE", "FRANQUIA", "ALMOXARIFADO"]),
  regionalCode: z.string().regex(CODE_RE),
  regionalName: text(200),
  cnpj: text(30),
  city: text(100),
  state: z.string().regex(/^[A-Z]{2}$/).nullable(),
  address: text(300),
  active: z.boolean(),
});

type Result = { ok: true; results: ImportResult[] } | { ok: false; error: string };

async function run(name: string, input: unknown, max: number, fn: typeof validarLote): Promise<Result> {
  const actor = await requirePermission("estrutura.editar");
  const parsed = z.array(rowSchema).min(1).max(max).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dados da planilha inválidos. Recarregue o arquivo." };
  try {
    return { ok: true, results: await fn(actor, parsed.data) };
  } catch (e) {
    logger.error(`action.${name}`, errorInfo(e));
    return { ok: false, error: "Erro ao processar este lote. Tente de novo." };
  }
}

export async function validarBasesAction(rows: unknown) {
  return run("estrutura.importar.validar", rows, VALIDATE_BATCH, validarLote);
}

export async function aplicarBasesAction(rows: unknown) {
  const r = await run("estrutura.importar.aplicar", rows, APPLY_BATCH, aplicarLote);
  revalidatePath("/admin/estrutura");
  return r;
}
