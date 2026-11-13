import "server-only";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/auth/session";
import { can, canAccessBase } from "@/lib/permissions/check";
import { errorInfo, logger } from "@/lib/logger";
import type { ImportResult } from "@/lib/importacao/csv";
import type { EstoqueImportMode, EstoqueImportRow } from "./importacao";
import { ajustarInventario, definirMinimo, lancarEntrada } from "./service";

/**
 * Importação de estoque — parte com banco (/estoque/importar).
 * "contado" usa ajustarInventario (permissão estoque.inventario); "entrada" usa lancarEntrada
 * (estoque.movimentar). Os dois passam pelo livro-razão e pela auditoria, como o lançamento pela tela.
 * Cada lote vira UM lançamento por almoxarifado, com o mesmo motivo/documento.
 */

export const VALIDATE_BATCH = 500;
/** Linhas por lançamento: cada lote é uma transação por almoxarifado. */
export const APPLY_BATCH = 200;

export type EstoqueImportOptions = { mode: EstoqueImportMode; almoxarifadoId: string | null; document: string | null; reason: string | null };

type Planned = { row: EstoqueImportRow; result: ImportResult; almoxId?: string; produtoId?: string; minimumChange?: boolean };

/** Erro de configuração que vale para o lote inteiro (permissão, opção faltando). */
export function optionsError(actor: CurrentUser, o: EstoqueImportOptions): string | null {
  if (o.mode === "contado" && !can(actor, "estoque.inventario")) return "Você não tem permissão para fazer inventário.";
  if (o.mode === "entrada" && !can(actor, "estoque.movimentar")) return "Você não tem permissão para lançar entradas.";
  if (o.mode === "entrada" && !o.document) return "Informe o número da nota fiscal ou documento.";
  if (o.mode === "contado" && (!o.reason || o.reason.length < 3)) return "Informe o motivo ou a referência do inventário.";
  return null;
}

async function plan(actor: CurrentUser, rows: EstoqueImportRow[], o: EstoqueImportOptions): Promise<Planned[]> {
  const almoxCodes = [...new Set(rows.flatMap((r) => (r.almoxCode ? [r.almoxCode] : [])))];
  const [almoxByCode, defaultAlmox, produtos] = await Promise.all([
    db.base.findMany({ where: { code: { in: almoxCodes } } }),
    o.almoxarifadoId ? db.base.findUnique({ where: { id: o.almoxarifadoId } }) : null,
    db.produto.findMany({ where: { code: { in: [...new Set(rows.map((r) => r.produtoCode))] } } }),
  ]);
  const almoxMap = new Map(almoxByCode.map((b) => [b.code, b]));
  const prodMap = new Map(produtos.map((p) => [p.code, p]));
  const pairs = rows.flatMap((r) => {
    const a = r.almoxCode ? almoxMap.get(r.almoxCode) : defaultAlmox;
    const p = prodMap.get(r.produtoCode);
    return a && p ? [{ baseId: a.id, produtoId: p.id }] : [];
  });
  const balances = new Map(
    (await db.stockBalance.findMany({ where: { OR: pairs.length ? pairs : [{ baseId: "-" }] } })).map((b) => [`${b.baseId}|${b.produtoId}`, b]),
  );
  const podeMinimo = can(actor, "estoque.movimentar");

  return rows.map((row) => {
    const almox = row.almoxCode ? almoxMap.get(row.almoxCode) : defaultAlmox;
    const produto = prodMap.get(row.produtoCode);
    const label = `${row.produtoCode}${almox ? ` · ${almox.code}` : row.almoxCode ? ` · ${row.almoxCode}` : ""}`;
    const result = (action: ImportResult["action"], message: string): ImportResult => ({ line: row.line, key: `${almox?.code ?? row.almoxCode ?? ""}|${row.produtoCode}`, label, action, message });
    const erro = (message: string): Planned => ({ row, result: result("erro", message) });

    if (!almox) return erro(row.almoxCode ? `Almoxarifado "${row.almoxCode}" não encontrado.` : "Escolha o almoxarifado na tela ou informe a coluna almoxarifado.");
    if (almox.type !== "ALMOXARIFADO") return erro(`${almox.code} não é um almoxarifado.`);
    if (!canAccessBase(actor, almox)) return erro(`O almoxarifado ${almox.code} está fora do seu alcance.`);
    if (!almox.active) return erro(`O almoxarifado ${almox.code} está inativo.`);
    if (!produto) return erro(`Produto "${row.produtoCode}" não encontrado. Importe o produto antes.`);
    if (o.mode === "entrada" && !produto.active) return erro(`${produto.code} está inativo: não recebe entrada.`);
    if (o.mode === "entrada" && row.quantity === 0) return erro("Na entrada, a quantidade precisa ser maior que zero.");
    if (row.minimum !== null && !podeMinimo) return erro("Você não tem permissão para mudar o estoque mínimo.");

    const b = balances.get(`${almox.id}|${produto.id}`) ?? { quantity: 0, reserved: 0, minimum: 0 };
    const novo = o.mode === "contado" ? row.quantity : b.quantity + row.quantity;
    const minimumChange = row.minimum !== null && row.minimum !== b.minimum;
    const parts: string[] = [];
    if (novo !== b.quantity) parts.push(o.mode === "entrada" ? `+${row.quantity} (saldo ${b.quantity} → ${novo})` : `Saldo ${b.quantity} → ${novo}`);
    if (minimumChange) parts.push(`mínimo ${b.minimum} → ${row.minimum}`);
    if (o.mode === "contado" && novo < b.reserved) parts.push(`atenção: ${b.reserved} já reservado(s) para solicitações aprovadas`);
    const action: ImportResult["action"] = !parts.length ? "igual" : balances.has(`${almox.id}|${produto.id}`) ? "atualizar" : "criar";
    return { row, almoxId: almox.id, produtoId: produto.id, minimumChange, result: result(action, parts.join(" · ") || "Sem mudança.") };
  });
}

export async function validarLote(actor: CurrentUser, rows: EstoqueImportRow[], o: EstoqueImportOptions): Promise<ImportResult[]> {
  const err = optionsError(actor, o);
  if (err) throw new DomainError(err);
  return (await plan(actor, rows, o)).map((p) => p.result);
}

export async function aplicarLote(actor: CurrentUser, rows: EstoqueImportRow[], o: EstoqueImportOptions): Promise<ImportResult[]> {
  const err = optionsError(actor, o);
  if (err) throw new DomainError(err);
  const planned = await plan(actor, rows, o);
  const results = new Map(planned.map((p) => [p.row.line, p.result]));
  const fail = (lines: number[], message: string) => lines.forEach((l) => results.set(l, { ...results.get(l)!, action: "erro", message }));

  // Um lançamento por almoxarifado. Linhas "igual" ficam de fora (no inventário, recontar o mesmo saldo não gera movimento).
  const groups = new Map<string, Planned[]>();
  for (const p of planned) {
    if (p.result.action === "erro" || p.result.action === "igual" || !p.almoxId) continue;
    groups.set(p.almoxId, [...(groups.get(p.almoxId) ?? []), p]);
  }
  for (const [baseId, list] of groups) {
    const moves = list.filter((p) => (o.mode === "contado" ? true : p.row.quantity > 0));
    const itens = moves.map((p) => ({ produtoId: p.produtoId!, quantity: p.row.quantity }));
    try {
      if (o.mode === "contado") await ajustarInventario(actor, { baseId, reason: `${o.reason} (importação)`, itens });
      else await lancarEntrada(actor, { baseId, document: o.document!, reason: o.reason ? `${o.reason} (importação)` : "Importação por planilha", itens });
    } catch (e) {
      if (!(e instanceof DomainError)) logger.error("estoque.importar", errorInfo(e));
      fail(list.map((p) => p.row.line), e instanceof DomainError ? e.message : "Não foi possível gravar este lote. Tente de novo.");
      continue;
    }
    for (const p of list.filter((x) => x.minimumChange)) {
      try {
        await definirMinimo(actor, { baseId, produtoId: p.produtoId!, minimum: p.row.minimum! });
      } catch (e) {
        if (!(e instanceof DomainError)) logger.error("estoque.importar.minimo", errorInfo(e));
        fail([p.row.line], "O saldo foi gravado, mas o mínimo não. Ajuste o mínimo na tela de saldos.");
      }
    }
  }
  return rows.map((r) => results.get(r.line)!);
}
