import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/lib/permissions/check";

/**
 * Usuários que o ator enxerga na administração (E6):
 * - GLOBAL: todos
 * - REGIONAL: quem tem vínculo com as suas regionais ou com bases delas (ou com as suas bases avulsas)
 * - BASE: quem tem vínculo com as suas bases
 * Usuários sem vínculo (perfis globais) só aparecem para quem é GLOBAL.
 */
export function usersScopeWhere(actor: Actor): Prisma.UserWhereInput | undefined {
  if (actor.scope === "GLOBAL") return undefined;
  const byBase: Prisma.UserWhereInput = { bases: { some: { baseId: { in: [...actor.baseIds] } } } };
  if (actor.scope === "BASE") return byBase;
  return {
    OR: [
      byBase,
      { regionals: { some: { regionalId: { in: [...actor.regionalIds] } } } },
      { bases: { some: { base: { regionalId: { in: [...actor.regionalIds] } } } } },
    ],
  };
}
