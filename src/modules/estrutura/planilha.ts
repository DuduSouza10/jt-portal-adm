/**
 * Planilha .xlsx de regionais e bases: o MODELO para importar e a EXPORTAÇÃO do que está cadastrado.
 * As duas usam as mesmas colunas da importação (importacao.ts), então o que se exporta pode ser editado e
 * importado de volta. Só monta o arquivo; quem busca no banco é planilha.service.ts. Testada em planilha.test.ts.
 */
import writeXlsxFile, { type Sheet } from "write-excel-file/node";
import dataValidation, { type DataValidationSheetOptions } from "@onparallel/write-excel-file-data-validation";
import type { BaseType } from "./importacao";

export type RegionalPlanilha = { code: string; name: string; active: boolean; bases: number };
export type BasePlanilha = {
  code: string;
  name: string;
  type: BaseType;
  regionalCode: string;
  regionalName: string;
  cnpj: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  active: boolean;
};

const VERMELHO = "#e60012";
const VERMELHO_ESCURO = "#b3000f";
const GRAFITE = "#3f3f46";
const LINHA = "#e7e7ea";
const CINZA = "#6b6b75";
const ZEBRA = "#f8f8f9";
const EXEMPLO = "#8a8a94";

const TIPO_TEXTO: Record<BaseType, string> = { BASE: "base", FRANQUIA: "franquia", ALMOXARIFADO: "almoxarifado" };

/** Cabeçalhos exatamente como a importação os reconhece (importacao.ts → ALIASES). `obrigatoria` pinta o cabeçalho de vermelho. */
export const COLUNAS = [
  { titulo: "Sigla", largura: 12, obrigatoria: true },
  { titulo: "Nome", largura: 30, obrigatoria: true },
  { titulo: "Tipo", largura: 15, obrigatoria: false },
  { titulo: "Regional", largura: 12, obrigatoria: true },
  { titulo: "Nome da regional", largura: 24, obrigatoria: false },
  { titulo: "CNPJ", largura: 20, obrigatoria: false },
  { titulo: "Cidade", largura: 22, obrigatoria: false },
  { titulo: "UF", largura: 6, obrigatoria: false },
  { titulo: "Endereço", largura: 36, obrigatoria: false },
  { titulo: "Ativo", largura: 9, obrigatoria: false },
] as const;

type Celula = { value: string; type?: StringConstructor; format?: string } & Record<string, unknown>;
type SheetComValidacao = Sheet<Buffer> & DataValidationSheetOptions;

const texto = (value: string | null | undefined, estilo: Record<string, unknown> = {}): Celula => ({
  value: value ?? "",
  type: String,
  format: "@", // texto: o Excel não vira CNPJ ou sigla numérica em número
  alignVertical: "center",
  bottomBorderColor: LINHA,
  bottomBorderStyle: "thin",
  ...estilo,
});

const cabecalho = () =>
  COLUNAS.map((c) => ({
    value: c.titulo,
    type: String,
    fontWeight: "bold",
    textColor: "#ffffff",
    backgroundColor: c.obrigatoria ? VERMELHO : GRAFITE,
    align: "left",
    alignVertical: "center",
    height: 26,
    indent: 1,
  }));

const larguras = () => COLUNAS.map((c) => ({ width: c.largura }));

/** Listas suspensas de tipo e ativo (até a linha `ate`), para a pessoa escolher em vez de digitar. */
function validacoes(ate: number): Pick<DataValidationSheetOptions, "dataValidation"> {
  const faixa = (coluna: number) => ({ from: { row: 2, column: coluna }, to: { row: ate, column: coluna } });
  return {
    dataValidation: [
      { cellRange: faixa(3), validation: { type: "list", values: ["base", "franquia", "almoxarifado"], error: "Escolha base, franquia ou almoxarifado." } },
      { cellRange: faixa(10), validation: { type: "list", values: ["sim", "não"], error: "Escolha sim ou não." } },
    ],
  };
}

function abaRegionais(regionais: RegionalPlanilha[], titulo: string): SheetComValidacao {
  const head = ["Sigla", "Nome", "Situação", "Bases"].map((value) => ({
    value, type: String, fontWeight: "bold", textColor: "#ffffff", backgroundColor: GRAFITE, align: "left", alignVertical: "center", height: 26, indent: 1,
  }));
  const linhas = regionais.map((r, i) => {
    const fundo = i % 2 ? { backgroundColor: ZEBRA } : {};
    return [
      texto(r.code, { fontWeight: "bold", ...fundo }),
      texto(r.name, fundo),
      texto(r.active ? "ativa" : "inativa", { textColor: r.active ? "#0b7d47" : CINZA, ...fundo }),
      { value: r.bases, type: Number, align: "left", alignVertical: "center", bottomBorderColor: LINHA, bottomBorderStyle: "thin", ...fundo },
    ];
  });
  return {
    sheet: titulo,
    data: [head, ...linhas] as never,
    columns: [{ width: 12 }, { width: 32 }, { width: 12 }, { width: 8 }],
    stickyRowsCount: 1,
    showGridLines: false,
  } as SheetComValidacao;
}

function abaBases(bases: BasePlanilha[], exemplo: boolean): SheetComValidacao {
  const linhas = bases.map((b, i) => {
    const fundo = i % 2 ? { backgroundColor: ZEBRA } : {};
    const apagado = exemplo ? { textColor: EXEMPLO, fontStyle: "italic" } : b.active ? {} : { textColor: CINZA };
    const e = { ...fundo, ...apagado };
    return [
      texto(b.code, { fontWeight: "bold", ...e }),
      texto(b.name, e),
      texto(TIPO_TEXTO[b.type], e),
      texto(b.regionalCode, e),
      texto(b.regionalName, e),
      texto(b.cnpj, e),
      texto(b.city, e),
      texto(b.state, e),
      texto(b.address, e),
      texto(b.active ? "sim" : "não", e),
    ];
  });
  return {
    sheet: "Bases",
    data: [cabecalho(), ...linhas] as never,
    columns: larguras(),
    stickyRowsCount: 1,
    showGridLines: false,
    ...validacoes(Math.max(linhas.length + 1 + 200, 500)),
  } as SheetComValidacao;
}

function abaInstrucoes(): SheetComValidacao {
  const titulo = (value: string) => [{ value, type: String, fontWeight: "bold", fontSize: 16, textColor: VERMELHO, height: 30, alignVertical: "center" }];
  const par = (a: string, b: string) => [
    texto(a, { fontWeight: "bold", alignVertical: "top", wrap: true }),
    texto(b, { wrap: true, alignVertical: "top", columnSpan: 3 }),
    null,
    null,
  ];
  const cab = ["Coluna", "Obrigatória?", "O que colocar", "Exemplo"].map((value) => ({
    value, type: String, fontWeight: "bold", textColor: "#ffffff", backgroundColor: GRAFITE, alignVertical: "center", height: 24, indent: 1,
  }));
  const col = (nome: string, obrig: string, oque: string, ex: string, destaque = false) => [
    texto(nome, { fontWeight: "bold", alignVertical: "top", textColor: destaque ? VERMELHO_ESCURO : "#17171a" }),
    texto(obrig, { alignVertical: "top" }),
    texto(oque, { wrap: true, alignVertical: "top" }),
    texto(ex, { alignVertical: "top", textColor: CINZA }),
  ];
  const data = [
    titulo("Como importar regionais e bases"),
    [],
    par("1.", "Preencha a aba \"Bases\": uma linha por base, franquia ou almoxarifado. As 3 linhas em cinza são exemplos: apague ou troque antes de importar."),
    par("2.", "No portal, vá em Administração → Regionais e bases → Importar e escolha este arquivo (.xlsx). Você vê uma prévia do que muda antes de gravar."),
    par("3.", "A base é encontrada pela Sigla. Se já existe, é atualizada; se não, é criada. Base que não está na planilha não muda."),
    par("4.", "Para editar o que já existe, use Exportar na tela de Regionais e bases: o arquivo vem neste mesmo formato."),
    [],
    cab,
    col("Sigla", "sim", "2 a 20 caracteres: letras, números, - ou _. Sempre maiúscula.", "BHZ01", true),
    col("Nome", "sim", "Nome da base.", "Belo Horizonte 01", true),
    col("Tipo", "não", "base, franquia ou almoxarifado. Vazio = base.", "franquia"),
    col("Regional", "sim", "Sigla da regional. Se ainda não existir, ela é criada.", "MG", true),
    col("Nome da regional", "não", "Usado só se a regional for nova. Vazio = a própria sigla.", "Minas Gerais"),
    col("CNPJ", "não", "Do jeito que for escrito.", "12.345.678/0001-90"),
    col("Cidade", "não", "", "Contagem"),
    col("UF", "não", "2 letras.", "MG"),
    col("Endereço", "não", "", "Rua Exemplo, 100"),
    col("Ativo", "não", "sim ou não. Vazio = sim. \"não\" tira a base das listas e mantém o histórico.", "sim"),
    [],
    [texto("Cabeçalhos em vermelho são obrigatórios. Não troque os nomes das colunas.", { textColor: CINZA, fontStyle: "italic", columnSpan: 4 }), null, null, null],
  ];
  return {
    sheet: "Instruções",
    data: data as never,
    columns: [{ width: 20 }, { width: 14 }, { width: 62 }, { width: 24 }],
    showGridLines: false,
  } as SheetComValidacao;
}

const opcoes = { features: [dataValidation], fontFamily: "Calibri", fontSize: 11 } as never;

/** Modelo em branco: abas Bases (com 3 exemplos), Instruções e as regionais que já existem. */
export async function montarModelo(regionais: RegionalPlanilha[]): Promise<Buffer> {
  const exemplos: BasePlanilha[] = [
    { code: "BHZ01", name: "Belo Horizonte 01", type: "BASE", regionalCode: "MG", regionalName: "Minas Gerais", cnpj: null, city: "Belo Horizonte", state: "MG", address: "Rua Exemplo, 100", active: true },
    { code: "CTG01", name: "Contagem 01", type: "FRANQUIA", regionalCode: "MG", regionalName: "Minas Gerais", cnpj: "12.345.678/0001-90", city: "Contagem", state: "MG", address: null, active: true },
    { code: "ALM-MG", name: "Almoxarifado MG", type: "ALMOXARIFADO", regionalCode: "MG", regionalName: "Minas Gerais", cnpj: null, city: "Contagem", state: "MG", address: null, active: true },
  ];
  const abas = [abaBases(exemplos, true), abaInstrucoes()];
  if (regionais.length) abas.push(abaRegionais(regionais, "Regionais cadastradas"));
  return writeXlsxFile(abas as never, opcoes).toBuffer();
}

/** Tudo o que está cadastrado, no mesmo formato da importação (aba Bases) + a aba Regionais. */
export async function montarExportacao(regionais: RegionalPlanilha[], bases: BasePlanilha[]): Promise<Buffer> {
  return writeXlsxFile([abaBases(bases, false), abaRegionais(regionais, "Regionais")] as never, opcoes).toBuffer();
}
