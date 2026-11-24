/**
 * Login pelo Feishu/Lark: em que base e regional a pessoa está, lendo a cadeia de departamentos (E11).
 * Funções PURAS (testadas em feishu-rules.test.ts). Quem consulta o Feishu e grava é feishu-login.ts.
 *
 * Organograma real da J&T Brasil (Subsidiária MN, lido em 2026-11-17):
 *
 *   Subsidiária MN
 *   ├─ Subsidiária São Paulo Norte → Gestão Regional → SJP SP, BAU SP, F ORLN SP…   (a unidade já é a base)
 *   ├─ Subsidiária Minas Gerais    → Gestão Regional → DC MNH 001 → CD MNH 001, CD CTG 001…  (cada CD é uma base)
 *   └─ Gestão Integrada, Presidência, Marketing…                                       (administrativo: sem base)
 *
 * Regra: a REGIONAL é a "Subsidiária X" logo acima de "Gestão Regional"; a BASE é o departamento até dois
 * níveis abaixo de "Gestão Regional": o CD, quando a unidade é um DC (MG); senão a própria unidade (SPN).
 * Quem está direto num DC de MG, sem CD, cai na base do DC. Fora de "Gestão Regional" → sem base.
 */

export type Dept = { id: string; name: string };

export type Deteccao = {
  regional: { feishuId: string; name: string; code: string };
  base: { feishuId: string; name: string; code: string; type: "BASE" | "FRANQUIA" };
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const isGestaoRegional = (d: Dept) => norm(d.name) === "gestao regional";
const SUBSIDIARIA = /^subsidiaria\s+/;

/** "Subsidiária São Paulo Norte" → "São Paulo Norte". */
export const nomeRegional = (name: string) => name.trim().replace(/^subsidi[aá]ria\s+/i, "").trim();

/** Sigla da regional pelas iniciais: "São Paulo Norte" → "SPN", "Minas Gerais" → "MG". */
export function codigoRegional(name: string) {
  const palavras = nomeRegional(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-Z]{2,}$/.test(p));
  const sigla = palavras.map((p) => p[0].toUpperCase()).join("");
  return sigla.length >= 2 ? sigla.slice(0, 20) : nomeRegional(name).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
}

/** Sigla da base a partir do nome no Feishu: "SJP SP" → "SJP-SP", "CD MNH 001" → "CD-MNH-001". */
export function codigoBase(name: string) {
  return siglaCompleta(name).slice(0, 20);
}

function siglaCompleta(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Mesmo nome, ignorando acento, maiúsculas e espaços: "Minas  Gerais" = "minas gerais". */
export const mesmoNome = (a: string, b: string) => norm(a) === norm(b);

/** A sigla da base foi cortada em 20 caracteres? Aí a sigla sozinha não identifica a base. */
export const siglaCortada = (name: string) => siglaCompleta(name).length > 20;

/** Sigla com sufixo para desempatar, sem passar de 20 caracteres: ("MG", 2) → "MG-2". */
export function comSufixo(code: string, n: number) {
  const suf = `-${n}`;
  return code.slice(0, 20 - suf.length).replace(/-+$/, "") + suf;
}

/** "F ORLN SP" é franquia (decisão do Diogo, 2026-11-17); o resto é base própria. */
export const tipoBase = (name: string): "BASE" | "FRANQUIA" => (/^f\s/i.test(name.trim()) ? "FRANQUIA" : "BASE");

/**
 * Lê UMA cadeia de departamentos (do setor da pessoa até a raiz, como o Feishu devolve subindo pelos "pais").
 * Retorna a base e a regional, ou null se a pessoa não estiver numa unidade (ex.: Gestão Integrada).
 */
export function detectar(chain: Dept[]): Deteccao | null {
  const gr = chain.findIndex(isGestaoRegional);
  if (gr < 1) return null; // não está abaixo de "Gestão Regional" (ou está nela mesma)
  const sub = chain[gr + 1];
  if (!sub || !SUBSIDIARIA.test(norm(sub.name))) return null;
  // Filho de Gestão Regional = a unidade. Se ela for um DC (MG) e a pessoa estiver num CD abaixo dele, a base é o CD.
  const filho = chain[gr - 1];
  const base = gr >= 2 && /^dc\s/.test(norm(filho.name)) ? chain[gr - 2] : filho;
  const nomeReg = nomeRegional(sub.name);
  const code = codigoBase(base.name);
  if (code.length < 2) return null;
  return {
    regional: { feishuId: sub.id, name: nomeReg, code: codigoRegional(sub.name) },
    base: { feishuId: base.id, name: base.name.trim().replace(/\s+/g, " "), code, type: tipoBase(base.name) },
  };
}

/** Pessoa pode estar em mais de um departamento: uma detecção por base, sem repetir. */
export function detectarTodas(chains: Dept[][]): Deteccao[] {
  const out = new Map<string, Deteccao>();
  for (const c of chains) {
    const d = detectar(c);
    if (d && !out.has(d.base.feishuId)) out.set(d.base.feishuId, d);
  }
  return [...out.values()];
}

/** Login a partir do e-mail (antes do @) ou do nome: "Maria Souza" → "maria.souza". */
export function loginSugerido(p: { name: string; email?: string | null; openId: string }) {
  const raw = (p.email?.split("@")[0] ?? p.name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 36);
  return raw.length >= 3 ? raw : `feishu.${p.openId.slice(-8).toLowerCase()}`;
}

/**
 * Onde descer ao ler o organograma inteiro (importação da estrutura): Subsidiárias, "Gestão Regional"
 * e, logo abaixo dela, os DCs (para achar os CDs de MG). O resto (setores das unidades, administrativo)
 * não interessa para montar regionais e bases.
 */
export function desceNoOrganograma(d: Dept, pai?: Dept) {
  const n = norm(d.name);
  return SUBSIDIARIA.test(n) || n === "gestao regional" || (!!pai && isGestaoRegional(pai) && /^dc\s/.test(n));
}

/**
 * Todas as regionais e bases do organograma (E11), com as mesmas regras do login.
 * Um DC que tem CDs não vira base (cada CD é a base); DC sem CD vira base.
 * Ordenado por regional e base.
 */
export function estruturaDoOrganograma(depts: (Dept & { parentId?: string })[]): Deteccao[] {
  const map = new Map(depts.map((d) => [d.id, d]));
  const cadeia = (d: Dept & { parentId?: string }) => {
    const c: Dept[] = [d];
    let p = d.parentId;
    for (let i = 0; p && map.has(p) && i < 12; i++) {
      const pd = map.get(p)!;
      c.push(pd);
      p = pd.parentId;
    }
    return c;
  };
  const temCd = (id: string) => depts.some((x) => x.parentId === id && /^cd\s/.test(norm(x.name)));
  const out = new Map<string, Deteccao>();
  for (const d of depts) {
    const det = detectar(cadeia(d));
    if (!det || det.base.feishuId !== d.id) continue;
    if (/^dc\s/.test(norm(d.name)) && temCd(d.id)) continue;
    out.set(d.id, det);
  }
  return [...out.values()].sort((a, b) => a.regional.code.localeCompare(b.regional.code) || a.base.code.localeCompare(b.base.code));
}

/**
 * Tipo de acesso de quem entra pelo Feishu pela primeira vez (E11, decisão do Diogo, 2026-11-24):
 * só UMA pessoa por base entra sozinha. Se alguma base dela ainda não tem ninguém com acesso, entra como
 * Base (ou Franquia, se for franquia). Base já ocupada, ou pessoa sem base → "aguardando" (o admin libera).
 */
export function perfilDoNovo(
  bases: readonly { id: string; type: string }[],
  ocupadas: ReadonlySet<string>,
): "base" | "franquia" | "aguardando" {
  const livre = bases.find((b) => !ocupadas.has(b.id));
  if (!livre) return "aguardando";
  return livre.type === "FRANQUIA" ? "franquia" : "base";
}
