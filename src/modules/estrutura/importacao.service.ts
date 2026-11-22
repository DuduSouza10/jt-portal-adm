import "server-only";
import { db } from "@/lib/db";
import { audit, diff } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";
import { errorInfo, logger } from "@/lib/logger";
import type { ImportResult } from "@/lib/importacao/csv";
import type { BaseImportRow } from "./importacao";

/**
 * Importação de regionais e bases — parte com banco (/admin/estrutura/importar, permissão estrutura.editar).
 * validarLote() não grava nada; aplicarLote() valida de novo e grava cada linha na sua transação.
 * Base que não está na planilha não é tocada.
 */

export const VALIDATE_BATCH = 500;
export const APPLY_BATCH = 50;

const FIELDS = ["name", "type", "regionalId", "cnpj", "city", "state", "address", "active"] as const;
const LABEL: Record<(typeof FIELDS)[number], string> = {
  name: "nome",
  type: "tipo",
  regionalId: "regional",
  cnpj: "CNPJ",
  city: "cidade",
  state: "UF",
  address: "endereço",
  active: "ativo",
};

async function planRow(r: BaseImportRow) {
  const [regional, base] = await Promise.all([
    db.regional.findUnique({ where: { code: r.regionalCode } }),
    db.base.findUnique({ where: { code: r.code }, include: { regional: true, _count: { select: { stockBalances: true } } } }),
  ]);
  const novaRegional = !regional;
  const result = (action: ImportResult["action"], message: string): ImportResult => ({ line: r.line, key: r.code, label: `${r.code} ${r.name}`, action, message });

  const novo = r.type === "ALMOXARIFADO" ? `Novo almoxarifado em ${r.regionalCode}` : r.type === "FRANQUIA" ? `Nova franquia em ${r.regionalCode}` : `Nova base em ${r.regionalCode}`;
  if (!base) return { result: result("criar", [novo, novaRegional && `cria a regional ${r.regionalCode}`].filter(Boolean).join(" · ")), regional, base };

  if (base.type === "ALMOXARIFADO" && r.type !== "ALMOXARIFADO" && base._count.stockBalances > 0)
    return { result: result("erro", `${r.code} é almoxarifado e tem estoque: o tipo não pode mudar pela planilha.`), regional, base };

  const changes: string[] = [];
  const next = { name: r.name, type: r.type, regionalId: regional?.id ?? "nova", cnpj: r.cnpj, city: r.city, state: r.state, address: r.address, active: r.active };
  for (const f of FIELDS) {
    if (f === "regionalId") {
      if (base.regional.code !== r.regionalCode) changes.push(`regional ${base.regional.code} → ${r.regionalCode}`);
    } else if ((base[f] ?? null) !== (next[f] ?? null)) changes.push(LABEL[f]);
  }
  if (!changes.length) return { result: result("igual", "Sem mudança."), regional, base };
  return { result: result("atualizar", `Muda: ${changes.join(", ")}${novaRegional ? ` · cria a regional ${r.regionalCode}` : ""}`), regional, base };
}

export async function validarLote(_actor: CurrentUser, rows: BaseImportRow[]): Promise<ImportResult[]> {
  return Promise.all(rows.map(async (r) => (await planRow(r)).result));
}

export async function aplicarLote(actor: CurrentUser, rows: BaseImportRow[]): Promise<ImportResult[]> {
  const out: ImportResult[] = [];
  for (const r of rows) {
    const { result } = await planRow(r);
    if (result.action === "erro" || result.action === "igual") {
      out.push(result);
      continue;
    }
    try {
      await db.$transaction(async (tx) => {
        let regional = await tx.regional.findUnique({ where: { code: r.regionalCode } });
        if (!regional) {
          regional = await tx.regional.create({ data: { code: r.regionalCode, name: r.regionalName ?? r.regionalCode } });
          await audit({ actorId: actor.id, action: "regional.criar", entity: "Regional", entityId: regional.id, summary: `Criou a regional ${regional.code} (importação)` }, tx);
        }
        const data = { code: r.code, name: r.name, type: r.type, regionalId: regional.id, cnpj: r.cnpj, city: r.city, state: r.state, address: r.address, active: r.active };
        const before = await tx.base.findUnique({ where: { code: r.code } });
        if (before) {
          await tx.base.update({ where: { id: before.id }, data });
          await audit({ actorId: actor.id, action: "base.editar", entity: "Base", entityId: before.id, summary: `Editou a base ${r.code} (importação)`, data: diff(before, data) }, tx);
        } else {
          const b = await tx.base.create({ data });
          await audit({ actorId: actor.id, action: "base.criar", entity: "Base", entityId: b.id, summary: `Criou a base ${b.code} (${regional.code}, importação)` }, tx);
        }
      });
      out.push(result);
    } catch (e) {
      logger.error("estrutura.importar", { ...errorInfo(e), line: r.line });
      out.push({ ...result, action: "erro", message: "Não foi possível gravar esta linha. Tente de novo." });
    }
  }
  return out;
}
