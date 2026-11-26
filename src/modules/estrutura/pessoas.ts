/**
 * Regras puras da aba "Pessoas" de Regionais e bases (busca e filtro por tipo de acesso). Testadas em pessoas.test.ts.
 */
import { normHeader } from "@/lib/importacao/csv";

export type BasePessoa = { id: string; code: string; name: string; type: string; regionalCode: string };
export type PessoaComBases = { id: string; name: string; login: string; active: boolean; perfil: { key: string; name: string }; bases: BasePessoa[] };

/**
 * Busca por nome, login, tipo de acesso ou base (código, nome ou regional). Casou o nome, o login ou o tipo de acesso,
 * vale tudo da pessoa; casou só uma base, mostra só as bases que casaram. `perfil` "todos" não filtra.
 */
export function filtrarPessoas(lista: PessoaComBases[], busca: string, perfil: string): PessoaComBases[] {
  const q = normHeader(busca);
  return lista
    .filter((p) => perfil === "todos" || p.perfil.key === perfil)
    .flatMap((p) => {
      if (!q || normHeader(`${p.name} ${p.login} ${p.perfil.name}`).includes(q)) return [p];
      const bases = p.bases.filter((b) => normHeader(`${b.code} ${b.name} ${b.regionalCode}`).includes(q));
      return bases.length ? [{ ...p, bases }] : [];
    });
}

/** Tipos de acesso presentes na lista, com quantas pessoas cada um tem (mais pessoas primeiro). */
export function perfisDaLista(lista: PessoaComBases[]): { key: string; name: string; n: number }[] {
  const m = new Map<string, { key: string; name: string; n: number }>();
  for (const p of lista) m.set(p.perfil.key, { ...p.perfil, n: (m.get(p.perfil.key)?.n ?? 0) + 1 });
  return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "pt-BR"));
}

/** Quantas bases diferentes têm pelo menos uma pessoa (só pessoas ativas contam como "atendida"). */
export function basesComPessoa(lista: PessoaComBases[]): number {
  return new Set(lista.filter((p) => p.active).flatMap((p) => p.bases.map((b) => b.id))).size;
}

/** Bases agrupadas por regional, em ordem de sigla. */
export function agruparPorRegional<T extends { regionalCode: string }>(bases: T[]): { regionalCode: string; bases: T[] }[] {
  const g = new Map<string, T[]>();
  for (const b of bases) g.set(b.regionalCode, [...(g.get(b.regionalCode) ?? []), b]);
  return [...g].sort(([a], [b]) => a.localeCompare(b)).map(([regionalCode, bs]) => ({ regionalCode, bases: bs }));
}
