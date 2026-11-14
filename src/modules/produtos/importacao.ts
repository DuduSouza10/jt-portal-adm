/**
 * Importação de produtos (catálogo de insumos) por planilha — parte PURA. Testada em importacao.test.ts.
 * Feita pelo Claude do Diogo a pedido do Eduardo (2026-11-13), com os campos que o model tem hoje
 * (código, nome, unidade, ativo). Quando o Eduardo completar o cadastro, é só acrescentar colunas aqui.
 */
import { mapColumns, MAX_IMPORT_ROWS, parseBool, parseIntBR, type RowError } from "@/lib/importacao/csv";

type Campo = "codigo" | "nome" | "unidade" | "ativo" | "limiteBase" | "limiteFranquia" | "diasBloqueio";

const ALIASES: Record<Campo, string[]> = {
  codigo: ["codigo", "code", "sku", "codigoproduto", "codigodoproduto", "referencia"],
  nome: ["nome", "descricao", "produto", "nomeproduto", "insumo"],
  unidade: ["unidade", "un", "unid", "unit", "medida", "unidadedemedida"],
  ativo: ["ativo", "status", "situacao"],
  limiteBase: ["limitebase", "limiteparabase", "limitebases"],
  limiteFranquia: ["limitefranquia", "limiteparafranquia", "limitefranquias"],
  diasBloqueio: ["diasbloqueio", "diasdebloqueio", "periodolimite", "diaslimite", "periodo"],
};

export type ProdutoImportRow = {
  line: number;
  code: string;
  name: string;
  unit: string;
  active: boolean;
  /** S3: limites por período. undefined = coluna ausente (não mexe); null = sem limite. */
  limitBase?: number | null;
  limitFranquia?: number | null;
  limitBlockDays?: number;
};

export const PRODUTO_CODE_RE = /^[A-Z0-9][A-Z0-9._/-]{0,39}$/;

export function parseProdutos(table: string[][]) {
  const [headerRow = [], ...data] = table;
  const cols = mapColumns(headerRow, ALIASES, ["codigo", "nome"]);
  const errors: RowError[] = [];
  const rows: ProdutoImportRow[] = [];
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
    const code = cols.get(r, "codigo").toUpperCase().replace(/\s+/g, "");
    const name = cols.get(r, "nome").replace(/\s+/g, " ");
    const unit = (cols.get(r, "unidade") || "un").toLowerCase();
    const active = parseBool(cols.get(r, "ativo"));
    if (!PRODUTO_CODE_RE.test(code)) return fail(`Código "${code}" inválido: até 40 caracteres, só letras, números, ponto, barra, hífen ou _.`);
    if (name.length < 2 || name.length > 200) return fail("Nome vazio, muito curto ou muito longo.");
    if (unit.length > 10) return fail(`Unidade "${unit}" muito longa (máximo 10 caracteres).`);
    if (active === null) return fail(`Valor de "ativo" não reconhecido: "${cols.get(r, "ativo")}". Use sim/não.`);
    // Limites (S3): coluna presente e vazia = sem limite.
    const lim = (c: "limiteBase" | "limiteFranquia") => {
      if (cols.indexOf[c] === undefined) return undefined;
      const raw = cols.get(r, c);
      return raw ? parseIntBR(raw) : null;
    };
    const limitBase = lim("limiteBase");
    const limitFranquia = lim("limiteFranquia");
    const dRaw = cols.get(r, "diasBloqueio");
    const limitBlockDays = dRaw ? parseIntBR(dRaw) : undefined;
    for (const [v, raw] of [[limitBase, cols.get(r, "limiteBase")], [limitFranquia, cols.get(r, "limiteFranquia")]] as const)
      if (raw && (v == null || v < 0 || v > 1_000_000)) return fail(`Limite "${raw}" inválido: use um número inteiro (vazio = sem limite).`);
    if (dRaw && (limitBlockDays == null || limitBlockDays < 1 || limitBlockDays > 3650)) return fail(`Dias de bloqueio "${dRaw}" inválido: use de 1 a 3650.`);
    const prev = seen.get(code);
    if (prev) return fail(`Código "${code}" repetido (já está na linha ${prev}).`);
    seen.set(code, line);
    rows.push({ line, code, name, unit, active, limitBase, limitFranquia, limitBlockDays: limitBlockDays ?? undefined });
  });
  return { rows, errors, missing, unknown: cols.unknown };
}

export const PRODUTOS_TEMPLATE_CSV =
  "codigo;nome;unidade;ativo;limite_base;limite_franquia;dias_bloqueio\n" +
  "LUVA-M;Luva de látex M;cx;sim;10;5;60\n" +
  "FITA-48;Fita adesiva 48mm;un;sim;;;\n" +
  "ETIQ-100;Etiqueta térmica 100x150;rolo;sim;20;20;30\n";
