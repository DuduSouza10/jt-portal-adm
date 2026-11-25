/**
 * Regras puras das telas de Minhas bases (E23): busca por código/nome (sem acento, espaço ou hífen),
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

const MINUSCULAS = new Set(["da", "de", "di", "do", "du", "das", "dos", "e"]);

/** Nomes que vêm do Feishu em CAIXA ALTA viram "Nome Sobrenome"; nomes já bem escritos ficam como estão. */
export function nomeBonito(nome: string): string {
  const n = nome.trim();
  if (n !== n.toLocaleUpperCase("pt-BR") || n === n.toLocaleLowerCase("pt-BR")) return n;
  return n
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1)))
    .join(" ");
}

export type GrupoSupervisores = { regionalCode: string; supervisores: SupervisorItem[]; totalBases: number };

/**
 * Supervisores separados por regional (MG de um lado, SPN do outro...). Quem tem base em mais de uma regional aparece
 * em cada uma, só com as bases daquela regional. Quem ainda não tem nenhuma base fica à parte. Regionais em ordem de código.
 */
export function agruparSupervisoresPorRegional(lista: SupervisorItem[]): { grupos: GrupoSupervisores[]; semBases: SupervisorItem[] } {
  const porRegional = new Map<string, SupervisorItem[]>();
  for (const s of lista)
    for (const g of agruparPorRegional(s.bases)) porRegional.set(g.regionalCode, [...(porRegional.get(g.regionalCode) ?? []), { ...s, bases: g.bases }]);
  const grupos = [...porRegional]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([regionalCode, supervisores]) => ({
      regionalCode,
      supervisores: supervisores.sort((a, b) => nomeBonito(a.name).localeCompare(nomeBonito(b.name), "pt-BR")),
      totalBases: supervisores.reduce((n, s) => n + s.bases.length, 0),
    }));
  return { grupos, semBases: lista.filter((s) => s.bases.length === 0) };
}
