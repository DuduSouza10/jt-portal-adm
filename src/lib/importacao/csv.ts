/**
 * Leitura de planilhas CSV — parte PURA e comum a todas as importações (usuários, estrutura,
 * produtos, estoque). Roda no navegador e no servidor. Testada em csv.test.ts.
 */

// ------------------------------------------------------------------ Leitura do arquivo

/**
 * Excel no Brasil salva CSV em Windows-1252 (a menos que se escolha "CSV UTF-8").
 * Tenta UTF-8 estrito; se não for UTF-8 válido, lê como Windows-1252.
 */
export function decodeCsvBytes(bytes: ArrayBuffer | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder("windows-1252").decode(buf);
  }
  return text.replace(/^﻿/, ""); // BOM
}

/** CSV no padrão RFC 4180 (aspas, aspas duplicadas, quebra de linha dentro de aspas). Separador detectado. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = { ";": 0, ",": 0, "\t": 0 } as Record<string, number>;
  let inQ = false;
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]++;
  }
  // Separador = o que mais aparece no cabeçalho (fora de aspas); padrão ";" (Excel em português).
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const sep = n > 0 ? best : ";";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Linhas totalmente vazias (comum no fim de arquivos do Excel) são descartadas.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ------------------------------------------------------------------ Colunas e valores

export const normHeader = (h: string) =>
  h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_\-.]/g, "");

/**
 * Encontra as colunas pelo nome (aceita apelidos; compara sem acento, maiúscula, espaço, _ ou -).
 * `required`: campos obrigatórios que faltam vão em `missing`.
 */
export function mapColumns<C extends string>(header: string[], aliases: Record<C, string[]>, required: NoInfer<C>[] = []) {
  const indexOf: Partial<Record<C, number>> = {};
  const unknown: string[] = [];
  header.forEach((h, i) => {
    const n = normHeader(h);
    const campo = (Object.keys(aliases) as C[]).find((c) => aliases[c].includes(n));
    if (campo && indexOf[campo] === undefined) indexOf[campo] = i;
    else if (n) unknown.push(h.trim());
  });
  const missing = required.filter((c) => indexOf[c] === undefined);
  const get = (row: string[], c: C) => {
    const i = indexOf[c];
    return i === undefined ? "" : (row[i] ?? "").trim();
  };
  return { indexOf, unknown, missing, get };
}

/** sim/não, ativo/inativo, 1/0... Vazio = `empty`. Valor desconhecido = null. */
export function parseBool(v: string, empty = true): boolean | null {
  const n = normHeader(v);
  if (!n) return empty;
  if (["sim", "s", "ativo", "1", "true", "yes", "ok"].includes(n)) return true;
  if (["nao", "n", "inativo", "0", "false", "no", "desligado", "demitido", "afastado", "bloqueado"].includes(n)) return false;
  return null;
}

/** Número inteiro escrito em planilha brasileira: "1.250", "1250", "12,0". Retorna null se não for inteiro. */
export function parseIntBR(v: string): number | null {
  const s = v.trim().replace(/\s/g, "");
  if (!s) return null;
  let n: number;
  if (/^-?\d{1,3}(\.\d{3})+(,0+)?$/.test(s)) n = Number(s.replace(/\./g, "").replace(/,0+$/, ""));
  else if (/^-?\d+([.,]0+)?$/.test(s)) n = Number(s.replace(/[.,]0+$/, ""));
  else return null;
  return Number.isSafeInteger(n) ? n : null;
}

export const MAX_IMPORT_ROWS = 10_000;

export type RowError = { line: number; message: string };

/** Resultado de cada linha na prévia e na gravação (comum a todas as importações). */
export type ImportAction = "criar" | "atualizar" | "igual" | "erro";
export type ImportResult = { line: number; key: string; label: string; action: ImportAction; message?: string };

/** Divide em lotes (validação e gravação vão ao servidor em partes). */
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

