/**
 * Regras puras das telas de Minhas bases (E20): busca por código/nome (sem acento, espaço ou hífen),
 * filtro por tipo e a seleção que acompanha o que a tela mostra. Testadas em filtro.test.ts.
 */
import { normHeader } from "@/lib/importacao/csv";

export type BaseItem = { id: string; code: string; name: string; type: string };
export type RegionalItem = { id: string; code: string; name: string; bases: BaseItem[] };
export type TipoFiltro = "todos" | "BASE" | "FRANQUIA";
export type SupervisorItem = { id: string; name: string; bases: (BaseItem & { regionalCode: string })[] };

const casa = (b: BaseItem, q: string, tipo: TipoFiltro) => (tipo === "todos" || b.type === tipo) && (!q || normHeader(`${b.code} ${b.name}`).includes(q));

/** Regionais com as bases que combinam com a busca e o tipo; regional sem nenhuma combinação some. */
export function filtrarRegionais<R extends RegionalItem>(regionais: R[], busca: string, tipo: TipoFiltro): (R & { mostradas: BaseItem[] })[] {
  const q = normHeader(busca);
  return regionais.map((r) => ({ ...r, mostradas: r.bases.filter((b) => casa(b, q, tipo)) })).filter((r) => r.mostradas.length > 0);
}

/** A seleção só guarda o que ainda existe na tela (a base pode ter sido pega por outro supervisor enquanto a pessoa marcava). */
export function podarSelecao(sel: Iterable<string>, disponiveis: Iterable<string>): Set<string> {
  const ok = new Set(disponiveis);
  return new Set([...sel].filter((id) => ok.has(id)));
}

/** Busca na lista de supervisores: casou o nome, vale tudo dele; casou só uma base, mostra só as bases que casaram. */
export function filtrarSupervisores(lista: SupervisorItem[], busca: string): SupervisorItem[] {
  const q = normHeader(busca);
  if (!q) return lista;
  return lista.flatMap((s) => {
    if (normHeader(s.name).includes(q)) return [s];
    const bases = s.bases.filter((b) => normHeader(`${b.code} ${b.name} ${b.regionalCode}`).includes(q));
    return bases.length ? [{ ...s, bases }] : [];
  });
}

/** Bases de uma lista agrupadas por regional, na ordem em que as regionais aparecem pela primeira vez. */
export function agruparPorRegional<T extends { regionalCode: string }>(bases: T[]): { regionalCode: string; bases: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const b of bases) grupos.set(b.regionalCode, [...(grupos.get(b.regionalCode) ?? []), b]);
  return [...grupos].sort(([a], [b]) => a.localeCompare(b)).map(([regionalCode, bs]) => ({ regionalCode, bases: bs }));
}
