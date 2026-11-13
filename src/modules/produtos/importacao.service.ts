import "server-only";
import { db } from "@/lib/db";
import { audit, diff } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";
import { errorInfo, logger } from "@/lib/logger";
import type { ImportResult } from "@/lib/importacao/csv";
import type { ProdutoImportRow } from "./importacao";

/**
 * Importação de produtos — parte com banco (/estoque/importar?tipo=produtos, permissão produtos.editar).
 * Produto é encontrado pelo CÓDIGO. Produto que não está na planilha não é tocado.
 */

export const VALIDATE_BATCH = 500;
export const APPLY_BATCH = 100;

const FIELDS = ["name", "unit", "active"] as const;
const LABEL = { name: "nome", unit: "unidade", active: "ativo" } as const;

type Existing = { id: string; code: string; name: string; unit: string; active: boolean };

function plan(r: ProdutoImportRow, existing: Existing | undefined): ImportResult {
  const base = { line: r.line, key: r.code, label: `${r.code} ${r.name}` };
  if (!existing) return { ...base, action: "criar", message: `Novo produto (${r.unit})` };
  const changes = FIELDS.filter((f) => existing[f] !== r[f]).map((f) =>
    f === "active" ? (r.active ? "reativa" : "desativa") : f === "unit" ? `unidade ${existing.unit} → ${r.unit}` : LABEL[f],
  );
  return changes.length ? { ...base, action: "atualizar", message: `Muda: ${changes.join(", ")}` } : { ...base, action: "igual", message: "Sem mudança." };
}

const load = async (rows: ProdutoImportRow[]) =>
  new Map((await db.produto.findMany({ where: { code: { in: rows.map((r) => r.code) } } })).map((p) => [p.code, p]));

export async function validarLote(_actor: CurrentUser, rows: ProdutoImportRow[]): Promise<ImportResult[]> {
  const existing = await load(rows);
  return rows.map((r) => plan(r, existing.get(r.code)));
}

export async function aplicarLote(actor: CurrentUser, rows: ProdutoImportRow[]): Promise<ImportResult[]> {
  const existing = await load(rows);
  const out: ImportResult[] = [];
  for (const r of rows) {
    const before = existing.get(r.code);
    const result = plan(r, before);
    if (result.action === "igual") {
      out.push(result);
      continue;
    }
    const data = { code: r.code, name: r.name, unit: r.unit, active: r.active };
    try {
      await db.$transaction(async (tx) => {
        if (before) {
          await tx.produto.update({ where: { id: before.id }, data });
          await audit({ actorId: actor.id, action: "produto.editar", entity: "Produto", entityId: before.id, summary: `Editou o produto ${r.code} (importação)`, data: diff(before, data) }, tx);
        } else {
          const p = await tx.produto.create({ data });
          await audit({ actorId: actor.id, action: "produto.criar", entity: "Produto", entityId: p.id, summary: `Criou o produto ${r.code} (importação)` }, tx);
        }
      });
      out.push(result);
    } catch (e) {
      logger.error("produtos.importar", { ...errorInfo(e), line: r.line });
      out.push({ ...result, action: "erro", message: "Não foi possível gravar esta linha. Tente de novo." });
    }
  }
  return out;
}
