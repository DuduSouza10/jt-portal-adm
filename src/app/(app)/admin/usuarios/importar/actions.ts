"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { errorInfo, logger } from "@/lib/logger";
import { APPLY_BATCH, aplicarLote, validarLote, VALIDATE_BATCH, type RowResult } from "@/modules/acessos/importacao.service";

// O navegador já leu e conferiu a planilha; aqui o formato é conferido de novo (nunca confiar no cliente).
const rowSchema = z.object({
  line: z.number().int().min(2),
  name: z.string().trim().min(2).max(200),
  registration: z.string().trim().max(40).nullable(),
  login: z.string().regex(/^[a-z0-9._-]{3,40}$/),
  email: z.email().max(200).nullable(),
  phone: z.string().trim().max(40).nullable(),
  profile: z.string().trim().max(100).nullable(),
  baseCodes: z.array(z.string().max(20)).max(200),
  regionalCodes: z.array(z.string().max(20)).max(50),
  active: z.boolean(),
});

type Result = { ok: true; results: RowResult[] } | { ok: false; error: string };

async function run(name: string, rowsInput: unknown, defaultProfileId: string | null, max: number, fn: typeof validarLote): Promise<Result> {
  const actor = await requirePermission("usuarios.editar");
  const parsed = z.array(rowSchema).min(1).max(max).safeParse(rowsInput);
  if (!parsed.success) return { ok: false, error: "Dados da planilha inválidos. Recarregue o arquivo." };
  try {
    return { ok: true, results: await fn(actor, parsed.data, defaultProfileId || null) };
  } catch (e) {
    logger.error(`action.${name}`, errorInfo(e));
    return { ok: false, error: "Erro ao processar este lote. Tente de novo." };
  }
}

export async function validarImportacaoAction(rows: unknown, defaultProfileId: string | null) {
  return run("importacao.validar", rows, defaultProfileId, VALIDATE_BATCH, validarLote);
}

export async function aplicarImportacaoAction(rows: unknown, defaultProfileId: string | null) {
  const r = await run("importacao.aplicar", rows, defaultProfileId, APPLY_BATCH, aplicarLote);
  revalidatePath("/admin/usuarios");
  return r;
}
