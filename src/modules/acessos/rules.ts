import { ALL } from "@/lib/permissions/catalog";

/**
 * Regras puras de acesso (sem banco — testadas em rules.test.ts).
 *
 * Princípio: ninguém concede o que não tem. Quem tem "usuarios.editar" não pode se promover a Dev
 * nem dar a outro usuário um perfil mais poderoso que o seu.
 */

/** `granted` cabe dentro de `own`? */
export function isSubsetOf(granted: readonly string[], own: readonly string[]): boolean {
  if (own.includes(ALL)) return true;
  if (granted.includes(ALL)) return false;
  return granted.every((p) => own.includes(p));
}

type ScopeInput = { scope: "GLOBAL" | "REGIONAL" | "BASE"; baseIds: string[]; regionalIds: string[] };

/** Valida os vínculos exigidos pelo alcance do perfil. Retorna a mensagem de erro ou null. */
export function scopeLinksError({ scope, baseIds, regionalIds }: ScopeInput): string | null {
  if (scope === "BASE" && baseIds.length === 0) return "Este tipo de acesso exige ao menos uma base.";
  if (scope === "REGIONAL" && regionalIds.length === 0 && baseIds.length === 0)
    return "Este tipo de acesso exige ao menos uma regional.";
  return null;
}

// ------------------------------------------------------------------ Alcance

type Scope = "GLOBAL" | "REGIONAL" | "BASE";
const SCOPE_RANK: Record<Scope, number> = { BASE: 1, REGIONAL: 2, GLOBAL: 3 };

/** Alcance do ator, como vem da sessão. */
export type ScopeActor = { scope: Scope; baseIds: readonly string[]; regionalIds: readonly string[] };

/** O alcance `target` cabe no alcance do ator? (ninguém concede alcance maior que o seu) */
export const scopeWithin = (target: Scope, actor: Scope) => SCOPE_RANK[target] <= SCOPE_RANK[actor];

/**
 * Os vínculos (regionais e bases) estão dentro do alcance do ator?
 * `baseRegional` diz a regional de cada base em `baseIds` (vem do banco).
 * Retorna a mensagem de erro ou null.
 */
export function linksOutsideScopeError(
  actor: ScopeActor,
  links: { baseIds: readonly string[]; regionalIds: readonly string[] },
  baseRegional: ReadonlyMap<string, string>,
): string | null {
  if (actor.scope === "GLOBAL") return null;
  if (actor.scope === "BASE" && links.regionalIds.length) return "Você não pode vincular regionais.";
  const outRegional = links.regionalIds.some((r) => !actor.regionalIds.includes(r));
  if (outRegional) return "Você só pode vincular regionais do seu alcance.";
  const baseOk = (b: string) =>
    actor.baseIds.includes(b) || (actor.scope === "REGIONAL" && actor.regionalIds.includes(baseRegional.get(b) ?? ""));
  if (links.baseIds.some((b) => !baseOk(b))) return "Você só pode vincular bases do seu alcance.";
  return null;
}

/** Mudou o conjunto de vínculos? (para bloquear o usuário de mexer nos próprios) */
export function sameLinks(
  a: { baseIds: readonly string[]; regionalIds: readonly string[] },
  b: { baseIds: readonly string[]; regionalIds: readonly string[] },
) {
  const eq = (x: readonly string[], y: readonly string[]) => x.length === y.length && [...x].sort().join() === [...y].sort().join();
  return eq(a.baseIds, b.baseIds) && eq(a.regionalIds, b.regionalIds);
}
