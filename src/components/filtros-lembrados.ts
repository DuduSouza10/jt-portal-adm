/**
 * Filtros lembrados (pedido do Eduardo, 2026-11-25): quem aplica um filtro numa lista, abre um registro e volta
 * encontra o filtro como deixou. Regras PURAS (testadas em filtros-lembrados.test.ts); o armazenamento fica em
 * `useFiltrosLembrados`/`FiltroForm`, e dura só a sessão da aba (`sessionStorage`): fechou a aba, começa limpo.
 */

export const PREFIXO_FILTROS = "filtros:";

/** Parâmetros que nunca são lembrados: a paginação volta para a primeira página. */
const NAO_LEMBRAR = new Set(["p"]);

export const chaveFiltros = (pathname: string) => `${PREFIXO_FILTROS}${pathname}`;

/** Query dos filtros (sem a página e sem campos vazios), pronta para guardar. "" = nenhum filtro. */
export function filtrosParaLembrar(params: URLSearchParams, campos: readonly string[]): string {
  const out = new URLSearchParams();
  for (const [k, v] of params) if (v !== "" && campos.includes(k) && !NAO_LEMBRAR.has(k)) out.append(k, v);
  return out.toString();
}

/**
 * Ao entrar na tela: devolve a query nova (a atual + os filtros guardados) ou `null` se não há o que restaurar.
 * Não restaura quando a URL já traz algum filtro (link de outro lugar, ex.: o painel) nem quando nada foi guardado.
 * Parâmetros que não são filtro (aba, ordem) ficam como estão.
 */
export function restaurarFiltros(atual: string, guardado: string | null, campos: readonly string[]): string | null {
  if (!guardado) return null;
  const params = new URLSearchParams(atual);
  if (campos.some((c) => (params.get(c) ?? "") !== "")) return null;
  const salvo = new URLSearchParams(guardado);
  let mudou = false;
  for (const [k, v] of salvo) {
    if (!campos.includes(k) || NAO_LEMBRAR.has(k)) continue;
    params.append(k, v);
    mudou = true;
  }
  return mudou ? params.toString() : null;
}

/** Quantos filtros estão aplicados (para o aviso "N filtros lembrados"). */
export function contarFiltros(query: string): number {
  return new Set([...new URLSearchParams(query).keys()]).size;
}
