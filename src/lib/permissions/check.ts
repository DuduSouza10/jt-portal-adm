import { ALL, type Permission } from "./catalog";

/** O mínimo que as regras de permissão precisam saber do usuário. Puro: sem banco, fácil de testar. */
export type Actor = {
  id: string;
  permissions: readonly string[];
  scope: "GLOBAL" | "REGIONAL" | "BASE";
  /** Bases vinculadas direto ao usuário. */
  baseIds: readonly string[];
  /** Regionais vinculadas ao usuário (usadas no alcance REGIONAL). */
  regionalIds: readonly string[];
};

export function can(actor: Pick<Actor, "permissions">, permission: Permission): boolean {
  return actor.permissions.includes(ALL) || actor.permissions.includes(permission);
}

export function canAny(actor: Pick<Actor, "permissions">, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(actor, p));
}

/**
 * Filtro de alcance para consultas Prisma em tabelas ligadas a uma base.
 * Uso: `db.pedido.findMany({ where: { base: baseScopeWhere(actor) } })`
 * Retorna `undefined` para alcance GLOBAL (sem filtro).
 */
export function baseScopeWhere(actor: Actor) {
  switch (actor.scope) {
    case "GLOBAL":
      return undefined;
    case "REGIONAL":
      return { OR: [{ regionalId: { in: [...actor.regionalIds] } }, { id: { in: [...actor.baseIds] } }] };
    case "BASE":
      return { id: { in: [...actor.baseIds] } };
  }
}

/** O usuário pode agir sobre esta base? (para checar um registro que já foi carregado) */
export function canAccessBase(actor: Actor, base: { id: string; regionalId: string }): boolean {
  switch (actor.scope) {
    case "GLOBAL":
      return true;
    case "REGIONAL":
      return actor.regionalIds.includes(base.regionalId) || actor.baseIds.includes(base.id);
    case "BASE":
      return actor.baseIds.includes(base.id);
  }
}
