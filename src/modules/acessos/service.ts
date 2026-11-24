import "server-only";
import { db } from "@/lib/db";
import { audit, diff } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/auth/session";
import { generateTempPassword, hashTempPassword } from "@/lib/auth/password";
import { ALL, sanitizePermissions } from "@/lib/permissions/catalog";
import { isSubsetOf, linksOutsideScopeError, ownProfileEditError, sameLinks, scopeLinksError, scopeWithin } from "./rules";
import type { ProfileInput, UserInput } from "./schemas";

// ============================================================ Usuários

type Links = { baseIds: string[]; regionalIds: string[] };

/** Regional de cada base (para checar alcance). Base inexistente → erro. */
async function baseRegionalMap(baseIds: string[]) {
  const bases = await db.base.findMany({ where: { id: { in: baseIds } }, select: { id: true, regionalId: true } });
  if (bases.length !== new Set(baseIds).size) throw new DomainError("Base não encontrada.");
  return new Map(bases.map((b) => [b.id, b.regionalId]));
}

/**
 * Pode conceder/gerenciar este perfil e estes vínculos? Ninguém concede o que não tem:
 * nem permissões (E4), nem alcance maior que o seu, nem bases/regionais fora do seu alcance (E6).
 */
async function assertCanManage(actor: CurrentUser, profile: { permissions: readonly string[]; scope: "GLOBAL" | "REGIONAL" | "BASE" }, links: Links) {
  if (!isSubsetOf(profile.permissions, actor.permissions))
    throw new DomainError("Você não pode gerenciar usuários com mais permissões do que você.");
  if (!scopeWithin(profile.scope, actor.scope))
    throw new DomainError("Você não pode gerenciar usuários com alcance maior que o seu.");
  const err = linksOutsideScopeError(actor, links, await baseRegionalMap(links.baseIds));
  if (err) throw new DomainError(err);
}

const linksOf = (u: { bases: { baseId: string }[]; regionals: { regionalId: string }[] }): Links => ({
  baseIds: u.bases.map((b) => b.baseId),
  regionalIds: u.regionals.map((r) => r.regionalId),
});

/** Cria ou edita um usuário. Na criação, devolve a senha temporária para mostrar ao admin. */
export async function saveUser(actor: CurrentUser, id: string | null, input: UserInput) {
  const { baseIds, regionalIds, ...data } = input;
  const profile = await db.accessProfile.findUnique({ where: { id: data.profileId } });
  if (!profile) throw new DomainError("Tipo de acesso não encontrado.");
  await assertCanManage(actor, profile, { baseIds, regionalIds });

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
    // Também precisa poder gerenciar o usuário COMO ELE ESTÁ (não edita quem está fora do seu alcance).
    await assertCanManage(actor, before.profile, linksOf(before));
    if (id === actor.id && !sameLinks(linksOf(before), { baseIds, regionalIds }))
      throw new DomainError("Você não pode mudar as próprias bases e regionais.");

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
      data: { ...data, ...links, passwordHash: await hashTempPassword(tempPassword), mustChangePassword: true },
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
  const user = await db.user.findUnique({ where: { id }, include: { profile: true, bases: true, regionals: true } });
  if (!user) throw new DomainError("Usuário não encontrado.");
  await assertCanManage(actor, user.profile, linksOf(user));

  const tempPassword = generateTempPassword();
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { passwordHash: await hashTempPassword(tempPassword), mustChangePassword: true },
    });
    await tx.session.deleteMany({ where: { userId: id } });
    await audit(
      { actorId: actor.id, action: "usuario.senha", entity: "User", entityId: id, summary: `Redefiniu a senha de ${user.login}` },
      tx,
    );
  });
  return { login: user.login, tempPassword };
}

/** Desativa (tira o acesso na hora, encerra as sessões, mantém o histórico) ou reativa. */
export async function setUserActive(actor: CurrentUser, id: string, active: boolean) {
  const user = await db.user.findUnique({ where: { id }, include: { profile: true, bases: true, regionals: true } });
  if (!user) throw new DomainError("Usuário não encontrado.");
  await assertCanManage(actor, user.profile, linksOf(user));
  if (id === actor.id && !active) throw new DomainError("Você não pode desativar o próprio usuário.");
  if (user.active === active) return;
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { active } });
    if (!active) await tx.session.deleteMany({ where: { userId: id } });
    await audit(
      { actorId: actor.id, action: active ? "usuario.reativar" : "usuario.desativar", entity: "User", entityId: id, summary: `${active ? "Reativou" : "Desativou"} ${user.login}` },
      tx,
    );
  });
}

/**
 * Exclui o usuário de vez (E12). Só quem não tem histórico de operação: pedido criado ou movimentação de
 * estoque prendem a pessoa ao registro (quem pediu, quem movimentou), então esses são só desativados.
 * Sessões, vínculos e avisos saem junto; na auditoria o nome some do "quem fez", mas o resumo fica.
 */
export async function deleteUser(actor: CurrentUser, id: string) {
  const user = await db.user.findUnique({ where: { id }, include: { profile: true, bases: true, regionals: true } });
  if (!user) throw new DomainError("Usuário não encontrado.");
  if (id === actor.id) throw new DomainError("Você não pode excluir o próprio usuário.");
  await assertCanManage(actor, user.profile, linksOf(user));
  await db.$transaction(async (tx) => {
    const [pedidos, movimentos] = await Promise.all([
      tx.solicitacao.count({ where: { createdById: id } }),
      tx.stockMovement.count({ where: { actorId: id } }),
    ]);
    if (pedidos || movimentos)
      throw new DomainError("Este usuário tem pedidos ou movimentações de estoque no histórico. Desative em vez de excluir.");
    await tx.user.delete({ where: { id } });
    await audit(
      { actorId: actor.id, action: "usuario.excluir", entity: "User", entityId: id, summary: `Excluiu permanentemente ${user.login} (${user.name})` },
      tx,
    );
  });
  return { login: user.login };
}

// ============================================================ Tipos de acesso (perfis)

export async function saveProfile(actor: CurrentUser, id: string | null, input: ProfileInput) {
  const permissions = sanitizePermissions(input.permissions);
  if (!isSubsetOf(permissions, actor.permissions))
    throw new DomainError("Você não pode conceder permissões que você mesmo não tem.");
  if (!scopeWithin(input.scope, actor.scope))
    throw new DomainError("Você não pode criar um tipo de acesso com alcance maior que o seu.");

  if (id) {
    const ownError = ownProfileEditError({ permissions: actor.permissions, profileId: actor.profile.id }, id);
    if (ownError) throw new DomainError(ownError);
    const before = await db.accessProfile.findUnique({ where: { id } });
    if (!before) throw new DomainError("Tipo de acesso não encontrado.");
    if (!isSubsetOf(before.permissions, actor.permissions))
      throw new DomainError("Você não pode editar um tipo de acesso com mais permissões do que o seu.");
    if (!scopeWithin(before.scope, actor.scope))
      throw new DomainError("Você não pode editar um tipo de acesso com alcance maior que o seu.");
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

/**
 * Aprovar quem entrou pelo Feishu e está "Aguardando liberação" (E11): vira Base (ou Franquia, se alguma
 * base dele for franquia) nas bases que o organograma já vinculou. Passa pelas mesmas checagens do
 * cadastro (saveUser) e avisa a pessoa no sino. Sem base vinculada, o admin escolhe no cadastro.
 */
export async function aprovarAcesso(actor: CurrentUser, id: string) {
  const u = await db.user.findUnique({
    where: { id },
    include: { profile: true, bases: { include: { base: { select: { code: true, type: true } } } } },
  });
  if (!u) throw new DomainError("Usuário não encontrado.");
  if (u.profile.key !== "aguardando") throw new DomainError("Este usuário não está aguardando liberação.");
  const bases = u.bases.filter((b) => b.base.type !== "ALMOXARIFADO");
  if (!bases.length) throw new DomainError("Sem base vinculada: abra o cadastro e escolha o tipo de acesso e a base.");
  const key = bases.some((b) => b.base.type === "FRANQUIA") ? "franquia" : "base";
  const perfil = await db.accessProfile.findUnique({ where: { key } });
  if (!perfil) throw new DomainError("Tipo de acesso não encontrado.");
  await saveUser(actor, id, {
    name: u.name,
    login: u.login,
    email: u.email,
    phone: u.phone,
    registration: u.registration,
    feishuOpenId: u.feishuOpenId,
    profileId: perfil.id,
    active: true,
    baseIds: bases.map((b) => b.baseId),
    regionalIds: [],
  });
  await db.notification.create({
    data: {
      userId: id,
      title: "Seu acesso foi liberado",
      body: `Você já pode pedir insumos para ${bases.map((b) => b.base.code).join(", ")}.`,
      link: "/solicitacoes/nova",
      refType: "usuario",
      refId: id,
    },
  });
  await audit({ actorId: actor.id, action: "usuario.aprovar", entity: "User", entityId: id, summary: `Aprovou o acesso de ${u.login} como ${perfil.name}` });
  return { perfil: perfil.name, login: u.login };
}
