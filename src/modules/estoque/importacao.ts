/**
 * Importação de estoque por planilha — parte PURA. Testada em importacao.test.ts.
 * Dois modos, escolhidos na tela:
 *   - "contado": o saldo de cada produto passa a ser o número da planilha (implantação e inventário, K2);
 *   - "entrada": soma ao saldo, como o recebimento de uma compra (exige o nº da NF/documento).
 * Sempre pelo livro-razão do estoque (StockMovement) e com auditoria. Coluna "minimo" opcional.
 */
import { mapColumns, MAX_IMPORT_ROWS, parseIntBR, type RowError } from "@/lib/importacao/csv";
import { MAX_QTY } from "./rules";

type Campo = "produto" | "quantidade" | "almoxarifado" | "minimo";

const ALIASES: Record<Campo, string[]> = {
  produto: ["produto", "codigo", "codigoproduto", "codigodoproduto", "sku", "item", "insumo"],
  quantidade: ["quantidade", "qtd", "qtde", "quant", "saldo", "contado", "quantidadecontada", "estoque"],
  almoxarifado: ["almoxarifado", "almox", "deposito", "cd", "siglaalmoxarifado"],
  minimo: ["minimo", "estoqueminimo", "min"],
};

export type EstoqueImportMode = "contado" | "entrada";

export type EstoqueImportRow = {
  line: number;
  /** Sigla do almoxarifado; null = o escolhido na tela. */
  almoxCode: string | null;
  produtoCode: string;
  quantity: number;
  minimum: number | null;
};

export function parseEstoque(table: string[][]) {
  const [headerRow = [], ...data] = table;
  const cols = mapColumns(headerRow, ALIASES, ["produto", "quantidade"]);
  const errors: RowError[] = [];
  const rows: EstoqueImportRow[] = [];
  const missing = cols.missing.map(String);
  if (missing.length) return { rows, errors, missing, unknown: cols.unknown };
  if (data.length > MAX_IMPORT_ROWS) {
    errors.push({ line: 1, message: `A planilha tem ${data.length} linhas; o máximo por importação é ${MAX_IMPORT_ROWS}.` });
    return { rows, errors, missing, unknown: cols.unknown };
  }
  const seen = new Map<string, number>();
  data.forEach((r, i) => {
    const line = i + 2;
    const fail = (message: string) => errors.push({ line, message });
    const produtoCode = cols.get(r, "produto").toUpperCase().replace(/\s+/g, "");
    const almoxCode = cols.get(r, "almoxarifado").toUpperCase() || null;
    const qRaw = cols.get(r, "quantidade");
    const quantity = parseIntBR(qRaw);
    const mRaw = cols.get(r, "minimo");
    const minimum = mRaw ? parseIntBR(mRaw) : null;
    if (!produtoCode) return fail("Informe o código do produto.");
    if (quantity === null || quantity < 0 || quantity > MAX_QTY) return fail(`Quantidade "${qRaw}" inválida: use um número inteiro de 0 a ${MAX_QTY}.`);
    if (mRaw && (minimum === null || minimum < 0 || minimum > MAX_QTY)) return fail(`Mínimo "${mRaw}" inválido: use um número inteiro de 0 a ${MAX_QTY}.`);
    const key = `${almoxCode ?? ""}|${produtoCode}`;
    const prev = seen.get(key);
    if (prev) return fail(`Produto "${produtoCode}" repetido para o mesmo almoxarifado (já está na linha ${prev}).`);
    seen.set(key, line);
    rows.push({ line, almoxCode, produtoCode, quantity, minimum });
  });
  return { rows, errors, missing, unknown: cols.unknown };
}

export const ESTOQUE_TEMPLATE_CSV = "produto;quantidade;almoxarifado;minimo\n" + "LUVA-M;120;ALM-MG;20\n" + "FITA-48;300;ALM-MG;\n" + "ETIQ-100;45;;10\n";
