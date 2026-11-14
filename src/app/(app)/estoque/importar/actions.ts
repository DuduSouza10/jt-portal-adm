"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { DomainError } from "@/lib/errors";
import { errorInfo, logger } from "@/lib/logger";
import type { ImportResult } from "@/lib/importacao/csv";
import { MAX_QTY } from "@/modules/estoque/rules";
import * as estoque from "@/modules/estoque/importacao.service";
import { PRODUTO_CODE_RE } from "@/modules/produtos/importacao";
import * as produtos from "@/modules/produtos/importacao.service";

type Result = { ok: true; results: ImportResult[] } | { ok: false; error: string };

async function guard(name: string, fn: () => Promise<ImportResult[]>): Promise<Result> {
  try {
    return { ok: true, results: await fn() };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    logger.error(`action.${name}`, errorInfo(e));
    return { ok: false, error: "Erro ao processar este lote. Tente de novo." };
  }
}
const INVALID: Result = { ok: false, error: "Dados da planilha inválidos. Recarregue o arquivo." };

// ------------------------------------------------------------------ Estoque (saldo contado ou entrada)

const qty = z.number().int().min(0).max(MAX_QTY);
const estoqueRow = z.object({
  line: z.number().int().min(2),
  almoxCode: z.string().max(20).nullable(),
  produtoCode: z.string().min(1).max(40),
  quantity: qty,
  minimum: qty.nullable(),
  unitCost: z.number().min(0).max(10_000_000).nullable(),
});
const estoqueOpts = z.object({
  mode: z.enum(["contado", "entrada"]),
  almoxarifadoId: z.string().max(40).optional().transform((v) => v || null),
  document: z.string().trim().max(60).optional().transform((v) => v || null),
  reason: z.string().trim().max(300).optional().transform((v) => v || null),
});

async function runEstoque(name: string, rows: unknown, opts: unknown, max: number, fn: typeof estoque.validarLote) {
  const actor = await requirePermission(["estoque.inventario", "estoque.movimentar"]);
  const r = z.array(estoqueRow).min(1).max(max).safeParse(rows);
  const o = estoqueOpts.safeParse(opts);
  if (!r.success || !o.success) return INVALID;
  return guard(name, () => fn(actor, r.data, o.data));
}

export async function validarEstoqueAction(rows: unknown, opts: unknown) {
  return runEstoque("estoque.importar.validar", rows, opts, estoque.VALIDATE_BATCH, estoque.validarLote);
}

export async function aplicarEstoqueAction(rows: unknown, opts: unknown) {
  const r = await runEstoque("estoque.importar.aplicar", rows, opts, estoque.APPLY_BATCH, estoque.aplicarLote);
  revalidatePath("/estoque");
  return r;
}

// ------------------------------------------------------------------ Produtos

const produtoRow = z.object({
  line: z.number().int().min(2),
  code: z.string().regex(PRODUTO_CODE_RE),
  name: z.string().trim().min(2).max(200),
  unit: z.string().trim().min(1).max(10),
  active: z.boolean(),
  limitBase: z.number().int().min(0).max(1_000_000).nullable().optional(),
  limitFranquia: z.number().int().min(0).max(1_000_000).nullable().optional(),
  limitBlockDays: z.number().int().min(1).max(3650).optional(),
});

async function runProdutos(name: string, rows: unknown, max: number, fn: typeof produtos.validarLote) {
  const actor = await requirePermission("produtos.editar");
  const r = z.array(produtoRow).min(1).max(max).safeParse(rows);
  if (!r.success) return INVALID;
  return guard(name, () => fn(actor, r.data));
}

export async function validarProdutosAction(rows: unknown) {
  return runProdutos("produtos.importar.validar", rows, produtos.VALIDATE_BATCH, produtos.validarLote);
}

export async function aplicarProdutosAction(rows: unknown) {
  const r = await runProdutos("produtos.importar.aplicar", rows, produtos.APPLY_BATCH, produtos.aplicarLote);
  revalidatePath("/estoque");
  return r;
}
