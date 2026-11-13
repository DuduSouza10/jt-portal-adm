/**
 * Importação de regionais e bases por planilha — parte PURA (navegador e servidor). Testada em importacao.test.ts.
 * Cada linha é uma base (ou franquia, ou almoxarifado), encontrada pela SIGLA. A regional vem pela sigla;
 * se ainda não existir, é criada (com o nome da coluna "nome_regional", ou a própria sigla).
 */
import { mapColumns, MAX_IMPORT_ROWS, normHeader, parseBool, type RowError } from "@/lib/importacao/csv";

type Campo = "sigla" | "nome" | "tipo" | "regional" | "nomeRegional" | "cnpj" | "cidade" | "uf" | "endereco" | "ativo";

const ALIASES: Record<Campo, string[]> = {
  sigla: ["sigla", "codigo", "code", "siglabase", "codigobase", "base"],
  nome: ["nome", "nomebase", "name", "descricao"],
  tipo: ["tipo", "type", "tipobase"],
  regional: ["regional", "siglaregional", "codigoregional"],
  nomeRegional: ["nomeregional", "nomedaregional"],
  cnpj: ["cnpj"],
  cidade: ["cidade", "municipio", "city"],
  uf: ["uf", "estado", "state"],
  endereco: ["endereco", "logradouro", "address"],
  ativo: ["ativo", "ativa", "status", "situacao"],
};

export type BaseType = "BASE" | "FRANQUIA" | "ALMOXARIFADO";

export type BaseImportRow = {
  line: number;
  code: string;
  name: string;
  type: BaseType;
  regionalCode: string;
  regionalName: string | null;
  cnpj: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  active: boolean;
};

export const CODE_RE = /^[A-Z0-9_-]{2,20}$/;

export function parseBaseType(v: string): BaseType | null {
  const n = normHeader(v);
  if (!n || ["base", "propria", "baseproprio", "basepropria"].includes(n)) return "BASE";
  if (["franquia", "franqueado", "franquiado"].includes(n)) return "FRANQUIA";
  if (["almoxarifado", "almox", "cd", "deposito", "centrodedistribuicao"].includes(n)) return "ALMOXARIFADO";
  return null;
}

export function parseBases(table: string[][]) {
  const [headerRow = [], ...data] = table;
  const cols = mapColumns(headerRow, ALIASES, ["sigla", "nome", "regional"]);
  const errors: RowError[] = [];
  const rows: BaseImportRow[] = [];
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
    const code = cols.get(r, "sigla").toUpperCase();
    const name = cols.get(r, "nome").replace(/\s+/g, " ");
    const type = parseBaseType(cols.get(r, "tipo"));
    const regionalCode = cols.get(r, "regional").toUpperCase();
    const state = cols.get(r, "uf").toUpperCase() || null;
    const active = parseBool(cols.get(r, "ativo"));
    if (!CODE_RE.test(code)) return fail(`Sigla "${code}" inválida: 2 a 20 caracteres, só letras, números, - ou _.`);
    if (name.length < 2) return fail("Nome vazio ou muito curto.");
    if (!type) return fail(`Tipo "${cols.get(r, "tipo")}" não reconhecido. Use base, franquia ou almoxarifado.`);
    if (!CODE_RE.test(regionalCode)) return fail(`Regional "${regionalCode}" inválida: informe a sigla da regional.`);
    if (state && !/^[A-Z]{2}$/.test(state)) return fail(`UF "${state}" inválida: use a sigla com 2 letras.`);
    if (active === null) return fail(`Valor de "ativo" não reconhecido: "${cols.get(r, "ativo")}". Use sim/não.`);
    const prev = seen.get(code);
    if (prev) return fail(`Sigla "${code}" repetida (já está na linha ${prev}).`);
    seen.set(code, line);
    rows.push({
      line,
      code,
      name,
      type,
      regionalCode,
      regionalName: cols.get(r, "nomeRegional").replace(/\s+/g, " ") || null,
      cnpj: cols.get(r, "cnpj") || null,
      city: cols.get(r, "cidade") || null,
      state,
      address: cols.get(r, "endereco") || null,
      active,
    });
  });
  return { rows, errors, missing, unknown: cols.unknown };
}

export const BASES_TEMPLATE_CSV =
  "sigla;nome;tipo;regional;nome_regional;cnpj;cidade;uf;endereco;ativo\n" +
  "BHZ01;Belo Horizonte 01;base;MG;Minas Gerais;;Belo Horizonte;MG;Rua Exemplo, 100;sim\n" +
  "CTG01;Contagem 01;franquia;MG;;12.345.678/0001-90;Contagem;MG;;sim\n" +
  "ALM-MG;Almoxarifado MG;almoxarifado;MG;;;Contagem;MG;;sim\n";
