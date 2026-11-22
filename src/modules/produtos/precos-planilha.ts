/**
 * Precificação por planilha (P6): lê "código; preço" de um CSV (aceita a planilha de estoque da J&T, com
 * as colunas Código e ValorMedio). Puro: quem grava é precificacao.service.ts.
 */
import { decodeCsvBytes, mapColumns, MAX_IMPORT_ROWS, parseCsv, parseMoneyBR } from "@/lib/importacao/csv";

export const PRECO_ALIASES = {
  codigo: ["codigo", "code", "sku", "codigoproduto", "codigodoproduto", "produto", "referencia"],
  preco: ["preco", "precounitario", "valor", "valorunitario", "valorunit", "valormedio", "customedio", "custo", "custounitario"],
};

export type LinhaPreco = { line: number; codigo: string; preco: number | null };

/**
 * Lê a planilha. Linhas sem código são ignoradas; preço vazio ou 0 também (não "zera" o preço de ninguém).
 * Devolve o erro de cabeçalho quando faltam as colunas.
 */
export function lerPlanilhaPrecos(bytes: ArrayBuffer | Uint8Array): { erro: string | null; linhas: LinhaPreco[]; ignoradas: number } {
  const rows = parseCsv(decodeCsvBytes(bytes)).filter((r) => r.some((c) => c.trim()));
  if (rows.length < 2) return { erro: "A planilha está vazia.", linhas: [], ignoradas: 0 };
  if (rows.length - 1 > MAX_IMPORT_ROWS) return { erro: `A planilha passa do limite de ${MAX_IMPORT_ROWS} linhas.`, linhas: [], ignoradas: 0 };
  const cols = mapColumns(rows[0], PRECO_ALIASES, ["codigo", "preco"]);
  if (cols.missing.length) return { erro: "A planilha precisa das colunas código e preço (ou valor médio).", linhas: [], ignoradas: 0 };
  const linhas: LinhaPreco[] = [];
  let ignoradas = 0;
  rows.slice(1).forEach((r, i) => {
    const codigo = cols.get(r, "codigo").toUpperCase();
    const bruto = cols.get(r, "preco");
    const preco = bruto ? parseMoneyBR(bruto) : null;
    if (!codigo || preco === 0 || !bruto) {
      ignoradas++;
      return;
    }
    linhas.push({ line: i + 2, codigo, preco });
  });
  return { erro: null, linhas, ignoradas };
}
