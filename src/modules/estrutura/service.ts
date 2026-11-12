import "server-only";
import { db } from "@/lib/db";
import { audit, diff } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/auth/session";
import type { BaseInput, RegionalInput } from "./schemas";

export async function saveRegional(actor: CurrentUser, id: string | null, input: RegionalInput) {
  return db.$transaction(async (tx) => {
    if (id) {
      const before = await tx.regional.findUnique({ where: { id } });
      if (!before) throw new DomainError("Regional não encontrada.");
      await tx.regional.update({ where: { id }, data: input });
      await audit(
        {
          actorId: actor.id,
          action: "regional.editar",
          entity: "Regional",
          entityId: id,
          summary: `Editou a regional ${input.code}`,
          data: diff(before, input),
        },
        tx,
      );
      return id;
    }
    const r = await tx.regional.create({ data: input });
    await audit(
      { actorId: actor.id, action: "regional.criar", entity: "Regional", entityId: r.id, summary: `Criou a regional ${r.code}` },
      tx,
    );
    return r.id;
  });
}

export async function saveBase(actor: CurrentUser, id: string | null, input: BaseInput) {
  return db.$transaction(async (tx) => {
    const regional = await tx.regional.findUnique({ where: { id: input.regionalId } });
    if (!regional) throw new DomainError("Regional não encontrada.");
    if (id) {
      const before = await tx.base.findUnique({ where: { id } });
      if (!before) throw new DomainError("Base não encontrada.");
      await tx.base.update({ where: { id }, data: input });
      await audit(
        {
          actorId: actor.id,
          action: "base.editar",
          entity: "Base",
          entityId: id,
          summary: `Editou a base ${input.code}`,
          data: diff(before, input),
        },
        tx,
      );
      return id;
    }
    const b = await tx.base.create({ data: input });
    await audit(
      { actorId: actor.id, action: "base.criar", entity: "Base", entityId: b.id, summary: `Criou a base ${b.code} (${regional.code})` },
      tx,
    );
    return b.id;
  });
}
