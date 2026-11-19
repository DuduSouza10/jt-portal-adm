/**
 * Importação de usuários por planilha (CSV) — parte PURA, sem banco.
 * Roda no navegador (lê e confere o arquivo antes de enviar) e no servidor (normaliza de novo, por segurança).
 * Testada em importacao.test.ts.
 *
 * Fluxo: arquivo → decodeCsvBytes → parseCsv → mapHeaders → normalizeRows → (servidor) validar/aplicar em lotes.
 */

import { chunk, decodeCsvBytes, normHeader, parseBool, parseCsv, MAX_IMPORT_ROWS, type RowError } from "@/lib/importacao/csv";

// Leitura do CSV é comum a todas as importações (src/lib/importacao/csv.ts).
export { chunk, decodeCsvBytes, normHeader, parseCsv, MAX_IMPORT_ROWS, type RowError };

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

const LOGIN_RE = /^[a-z0-9._-]{3,40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const splitCodes = (v: string) =>
  v
    .split(/[,|/;]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

const parseActive = (v: string) => parseBool(v);

/** Login padrão: o informado; senão a matrícula; senão a parte antes do @ do e-mail. */
export function defaultLogin(login: string, registration: string, email: string) {
  const l = (login || registration || email.split("@")[0] || "").trim().toLowerCase();
  return l.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, ".");
}

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

/** Planilha modelo (separador ; para abrir direto no Excel em português). */
export const TEMPLATE_CSV =
  "nome;matricula;email;telefone;tipo_de_acesso;bases;regionais;ativo\n" +
  "Maria Souza;102030;maria.souza@empresa.com;31999990000;base;BHZ01;;sim\n" +
  "João Lima;102031;;;gestor-regional;;MG;sim\n" +
  "Ana Costa;102032;ana.costa@empresa.com;;franquia;CTG01,BHZ01;;sim\n";
