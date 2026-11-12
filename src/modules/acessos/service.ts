import "server-only";
import { db } from "@/lib/db";
import { audit, diff } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/auth/session";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { ALL, sanitizePermissions } from "@/lib/permissions/catalog";
import { isSubsetOf, scopeLinksError } from "./rules";
import type { ProfileInput, UserInput } from "./schemas";

// ============================================================ Usuários

async function assertCanManage(actor: CurrentUser, targetProfilePermissions: readonly string[]) {
  if (!isSubsetOf(targetProfilePermissions, actor.permissions))
    throw new DomainError("Você não pode gerenciar usuários com mais permissões do que você.");
}

/** Cria ou edita um usuário. Na criação, devolve a senha temporária para mostrar ao admin. */
export async function saveUser(actor: CurrentUser, id: string | null, input: UserInput) {
  const { baseIds, regionalIds, ...data } = input;
  const profile = await db.accessProfile.findUnique({ where: { id: data.profileId } });
  if (!profile) throw new DomainError("Tipo de acesso não encontrado.");
  await assertCanManage(actor, profile.permissions);

  const linkError = scopeLinksError({ scope: profile.scope, baseIds, regionalIds });
  if (linkError) throw new DomainError(linkError);

  if (id === actor.id) {
    if (!data.active) throw new DomainError("Você não pode desativar o próprio usuário.");
    if (data.profileId !== actor.profile.id) throw new DomainError("Você não pode mudar o próprio tipo de acesso.");
  }

  const links = {
    bases: { create: baseIds.map((baseId) => ({ baseId })) },
    regionals: { create: regionalIds.map((regionalId) => ({ regionalId })) },
  };

  if (id) {
    const before = await db.user.findUnique({
      where: { id },
      include: { profile: true, bases: true, regionals: true },
    });
    if (!before) throw new DomainError("Usuário não encontrado.");
    await assertCanManage(actor, before.profile.permissions);

    await db.$transaction(async (tx) => {
      await tx.userBase.deleteMany({ where: { userId: id } });
      await tx.userRegional.deleteMany({ where: { userId: id } });
      await tx.user.update({ where: { id }, data: { ...data, ...links } });
      // Desativado: derruba as sessões abertas na hora.
      if (!data.active) await tx.session.deleteMany({ where: { userId: id } });
      await audit(
        {
          actorId: actor.id,
          action: "usuario.editar",
          entity: "User",
          entityId: id,
          summary: `Editou o usuário ${data.login}`,
          data: diff(
            {
              ...before,
              baseIds: before.bases.map((b) => b.baseId).sort(),
              regionalIds: before.regionals.map((r) => r.regionalId).sort(),
            },
            { ...data, baseIds: [...baseIds].sort(), regionalIds: [...regionalIds].sort() },
          ),
        },
        tx,
      );
    });
    return { id, tempPassword: null };
  }

  const tempPassword = generateTempPassword();
  const created = await db.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { ...data, ...links, passwordHash: await hashPassword(tempPassword), mustChangePassword: true },
    });
    await audit(
      {
        actorId: actor.id,
        action: "usuario.criar",
        entity: "User",
        entityId: u.id,
        summary: `Criou o usuário ${u.login} (${profile.name})`,
      },
      tx,
    );
    return u;
  });
  return { id: created.id, tempPassword };
}

export async function resetPassword(actor: CurrentUser, id: string) {
  const user = await db.user.findUnique({ where: { id }, include: { profile: true } });
  if (!user) throw new DomainError("Usuário não encontrado.");
  await assertCanManage(actor, user.profile.permissions);

  const tempPassword = generateTempPassword();
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true },
    });
    await tx.session.deleteMany({ where: { userId: id } });
    await audit(
      { actorId: actor.id, action: "usuario.senha", entity: "User", entityId: id, summary: `Redefiniu a senha de ${user.login}` },
      tx,
    );
  });
  return { login: user.login, tempPassword };
}

// ============================================================ Tipos de acesso (perfis)

export async function saveProfile(actor: CurrentUser, id: string | null, input: ProfileInput) {
  const permissions = sanitizePermissions(input.permissions);
  if (!isSubsetOf(permissions, actor.permissions))
    throw new DomainError("Você não pode conceder permissões que você mesmo não tem.");

  if (id) {
    const before = await db.accessProfile.findUnique({ where: { id } });
    if (!before) throw new DomainError("Tipo de acesso não encontrado.");
    if (!isSubsetOf(before.permissions, actor.permissions))
      throw new DomainError("Você não pode editar um tipo de acesso com mais permissões do que o seu.");
    if (before.permissions.includes(ALL) && !permissions.includes(ALL))
      throw new DomainError("O curinga (*) do perfil Dev não pode ser removido por aqui.");
    // A chave dos perfis do sistema é usada no seed e no código: não muda.
    const key = before.system ? before.key : input.key;

    await db.$transaction(async (tx) => {
      await tx.accessProfile.update({ where: { id }, data: { ...input, key, permissions } });
      await audit(
        {
          actorId: actor.id,
          action: "perfil.editar",
          entity: "AccessProfile",
          entityId: id,
          summary: `Editou o tipo de acesso ${input.name}`,
          data: diff(
            { ...before, permissions: [...before.permissions].sort() },
            { ...input, key, permissions: [...permissions].sort() },
          ),
        },
        tx,
      );
    });
    return id;
  }

  return db.$transaction(async (tx) => {
    const p = await tx.accessProfile.create({ data: { ...input, permissions } });
    await audit(
      { actorId: actor.id, action: "perfil.criar", entity: "AccessProfile", entityId: p.id, summary: `Criou o tipo de acesso ${p.name}` },
      tx,
    );
    return p.id;
  });
}
