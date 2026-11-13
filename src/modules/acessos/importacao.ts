/**
 * Importação de usuários por planilha (CSV) — parte PURA, sem banco.
 * Roda no navegador (lê e confere o arquivo antes de enviar) e no servidor (normaliza de novo, por segurança).
 * Testada em importacao.test.ts.
 *
 * Fluxo: arquivo → decodeCsvBytes → parseCsv → mapHeaders → normalizeRows → (servidor) validar/aplicar em lotes.
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

// ------------------------------------------------------------------ Colunas

export type Campo = "nome" | "matricula" | "login" | "email" | "telefone" | "tipo" | "bases" | "regionais" | "ativo";

/** Nomes de coluna aceitos (comparados sem acento, maiúscula, espaço, _ ou -). */
const ALIASES: Record<Campo, string[]> = {
  nome: ["nome", "nomecompleto", "name", "funcionario", "colaborador"],
  matricula: ["matricula", "registro", "re", "chapa", "codigofuncionario", "idfuncionario"],
  login: ["login", "usuario", "user"],
  email: ["email", "emailcorporativo", "correio"],
  telefone: ["telefone", "celular", "fone", "whatsapp"],
  tipo: ["tipodeacesso", "tipoacesso", "perfil", "acesso", "tipo"],
  bases: ["base", "bases", "unidade", "unidades", "filial", "codigobase"],
  regionais: ["regional", "regionais"],
  ativo: ["ativo", "status", "situacao"],
};

export const normHeader = (h: string) =>
  h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_\-.]/g, "");

export type HeaderMap = { indexOf: Partial<Record<Campo, number>>; unknown: string[]; missing: Campo[] };

export function mapHeaders(header: string[]): HeaderMap {
  const indexOf: Partial<Record<Campo, number>> = {};
  const unknown: string[] = [];
  header.forEach((h, i) => {
    const n = normHeader(h);
    const campo = (Object.keys(ALIASES) as Campo[]).find((c) => ALIASES[c].includes(n));
    if (campo && indexOf[campo] === undefined) indexOf[campo] = i;
    else if (n) unknown.push(h.trim());
  });
  const missing: Campo[] = (["nome"] as Campo[]).filter((c) => indexOf[c] === undefined);
  if (indexOf.matricula === undefined && indexOf.login === undefined && indexOf.email === undefined) missing.push("matricula");
  return { indexOf, unknown, missing };
}

// ------------------------------------------------------------------ Linhas

export type ImportRow = {
  /** Linha no arquivo (1 = cabeçalho), para as mensagens. */
  line: number;
  name: string;
  registration: string | null;
  login: string;
  email: string | null;
  phone: string | null;
  /** Chave ou nome do tipo de acesso; null = usar o padrão escolhido na tela. */
  profile: string | null;
  baseCodes: string[];
  regionalCodes: string[];
  active: boolean;
};

export type RowError = { line: number; message: string };

const LOGIN_RE = /^[a-z0-9._-]{3,40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const splitCodes = (v: string) =>
  v
    .split(/[,|/;]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

function parseActive(v: string): boolean | null {
  const n = normHeader(v);
  if (!n || ["sim", "s", "ativo", "1", "true", "yes", "ok"].includes(n)) return true;
  if (["nao", "n", "inativo", "0", "false", "no", "desligado", "demitido", "afastado", "bloqueado"].includes(n)) return false;
  return null;
}

/** Login padrão: o informado; senão a matrícula; senão a parte antes do @ do e-mail. */
export function defaultLogin(login: string, registration: string, email: string) {
  const l = (login || registration || email.split("@")[0] || "").trim().toLowerCase();
  return l.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, ".");
}

export const MAX_IMPORT_ROWS = 10_000;

/**
 * Converte a planilha em linhas prontas, com os erros de formato e de repetição DENTRO do arquivo.
 * As checagens que dependem do banco (perfil existe, base existe, alcance, e-mail já usado) ficam no servidor.
 */
export function normalizeRows(table: string[][]): { header: HeaderMap; rows: ImportRow[]; errors: RowError[] } {
  const [headerRow = [], ...data] = table;
  const header = mapHeaders(headerRow);
  const errors: RowError[] = [];
  const rows: ImportRow[] = [];
  if (header.missing.length) return { header, rows, errors };
  if (data.length > MAX_IMPORT_ROWS) {
    errors.push({ line: 1, message: `A planilha tem ${data.length} linhas; o máximo por importação é ${MAX_IMPORT_ROWS}.` });
    return { header, rows, errors };
  }

  const get = (r: string[], c: Campo) => {
    const i = header.indexOf[c];
    return i === undefined ? "" : (r[i] ?? "").trim();
  };
  const seen = { login: new Map<string, number>(), email: new Map<string, number>(), registration: new Map<string, number>() };

  data.forEach((r, idx) => {
    const line = idx + 2;
    const fail = (message: string) => errors.push({ line, message });
    const name = get(r, "nome").replace(/\s+/g, " ");
    const registration = get(r, "matricula") || null;
    const email = get(r, "email").toLowerCase() || null;
    const login = defaultLogin(get(r, "login"), registration ?? "", email ?? "");
    const active = parseActive(get(r, "ativo"));

    if (name.length < 2) return fail("Nome vazio ou muito curto.");
    if (!LOGIN_RE.test(login))
      return fail(`Login "${login}" inválido: 3 a 40 caracteres, só letras minúsculas, números, ponto, hífen ou _.`);
    if (email && !EMAIL_RE.test(email)) return fail(`E-mail "${email}" inválido.`);
    if (active === null) return fail(`Valor de "ativo" não reconhecido: "${get(r, "ativo")}". Use sim/não.`);

    for (const [k, v] of [["login", login], ["email", email], ["registration", registration]] as const) {
      if (!v) continue;
      const prev = seen[k].get(v);
      if (prev) return fail(`${k === "registration" ? "Matrícula" : k === "email" ? "E-mail" : "Login"} "${v}" repetido (já está na linha ${prev}).`);
    }
    seen.login.set(login, line);
    if (email) seen.email.set(email, line);
    if (registration) seen.registration.set(registration, line);

    rows.push({
      line,
      name,
      registration,
      login,
      email,
      phone: get(r, "telefone") || null,
      profile: get(r, "tipo") || null,
      baseCodes: splitCodes(get(r, "bases")),
      regionalCodes: splitCodes(get(r, "regionais")),
      active,
    });
  });
  return { header, rows, errors };
}

/** Divide em lotes (validação e gravação vão ao servidor em partes). */
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Planilha modelo (separador ; para abrir direto no Excel em português). */
export const TEMPLATE_CSV =
  "nome;matricula;email;telefone;tipo_de_acesso;bases;regionais;ativo\n" +
  "Maria Souza;102030;maria.souza@empresa.com;31999990000;base;BHZ01;;sim\n" +
  "João Lima;102031;;;gestor-regional;;MG;sim\n" +
  "Ana Costa;102032;ana.costa@empresa.com;;franquia;CTG01,BHZ01;;sim\n";
