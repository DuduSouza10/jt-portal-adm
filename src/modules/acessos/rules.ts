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
