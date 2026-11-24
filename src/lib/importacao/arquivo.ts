/**
 * Leitura do arquivo escolhido numa importação: .xlsx (Excel) ou .csv. Devolve sempre a tabela de TEXTO que
 * os `parse*` de cada módulo esperam (primeira linha = cabeçalho). Roda no navegador; a biblioteca de
 * xlsx só é baixada quando alguém escolhe um .xlsx. Testada em arquivo.test.ts (parte pura).
 */
import { decodeCsvBytes, parseCsv } from "./csv";

export const MAX_ARQUIVO_BYTES = 8 * 1024 * 1024;

export type TipoArquivo = "xlsx" | "csv";

export function tipoDoArquivo(nome: string): TipoArquivo | null {
  if (/\.xlsx$/i.test(nome)) return "xlsx";
  if (/\.(csv|txt)$/i.test(nome)) return "csv";
  return null;
}

/** Célula do Excel → texto como a pessoa vê: número inteiro sem ".0", sim/não, data em AAAA-MM-DD. */
export function celulaParaTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  return String(v).trim();
}

/** Linhas do Excel → tabela de texto, sem as linhas totalmente vazias (como o CSV). */
export function tabelaDeCelulas(rows: unknown[][]): string[][] {
  return rows.map((r) => r.map(celulaParaTexto)).filter((r) => r.some((c) => c !== ""));
}

export class ArquivoInvalido extends Error {}

export async function lerArquivoPlanilha(file: File): Promise<string[][]> {
  const tipo = tipoDoArquivo(file.name);
  if (!tipo) throw new ArquivoInvalido("tipo");
  if (file.size > MAX_ARQUIVO_BYTES) throw new ArquivoInvalido("tamanho");
  if (tipo === "csv") return parseCsv(decodeCsvBytes(await file.arrayBuffer()));
  try {
    const { readSheet } = await import("read-excel-file/browser");
    return tabelaDeCelulas((await readSheet(file)) as unknown[][]);
  } catch {
    throw new ArquivoInvalido("xlsx");
  }
}
