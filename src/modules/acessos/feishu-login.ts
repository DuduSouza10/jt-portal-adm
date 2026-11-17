import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { FeishuDept, FeishuProfile } from "@/lib/feishu/client";
import { errorInfo, logger } from "@/lib/logger";
import { detectarTodas, loginSugerido, type Deteccao } from "./feishu-rules";

type Tx = Prisma.TransactionClient;

/**
 * Login pelo Feishu (E11): acha ou cria o usuário e a base dele, pela cadeia de departamentos.
 *
 * 1. Já tem usuário (pelo open_id, matrícula ou e-mail) → entra. Se ele for de base (alcance BASE),
 *    ganha também a base do departamento atual (quem mudou de unidade passa a ver a nova).
 * 2. Não tem usuário e está numa unidade → cria com o tipo "Base" ou "Franquia", já na base dela.
 *    Se a base (ou a regional) ainda não existe no portal, é criada na hora, marcada "criada pelo Feishu".
 * 3. Não tem usuário e não está numa unidade (ex.: Gestão Integrada) → cria com "Aguardando liberação",
 *    sem acesso a nada, e avisa os administradores no sino.
 * Tipos de acesso da equipe (Administrador, Gestor, Almoxarifado…) NUNCA vêm do Feishu: o admin escolhe.
 */

export type FeishuLoginResult =
  | { kind: "ok"; userId: string; created: boolean; pending: boolean }
  | { kind: "inactive" }
  | { kind: "conflict" }; // e-mail/matrícula já ligados a OUTRA conta do Feishu

type Deps = { getChains: (openId: string) => Promise<FeishuDept[][]> };

/** Acha a regional pelo departamento do Feishu, pela sigla ou pelo nome; senão cria. */
async function regionalDe(tx: Tx, r: Deteccao["regional"]) {
  const found =
    (await tx.regional.findUnique({ where: { feishuDepartmentId: r.feishuId } })) ??
    (await tx.regional.findFirst({ where: { OR: [{ code: r.code }, { name: { equals: r.name, mode: "insensitive" } }] } }));
  if (found) {
    if (!found.feishuDepartmentId) await tx.regional.update({ where: { id: found.id }, data: { feishuDepartmentId: r.feishuId } });
    return found;
  }
  const created = await tx.regional.create({ data: { code: r.code, name: r.name, feishuDepartmentId: r.feishuId } });
  await audit({ actorId: null, action: "regional.criar", entity: "Regional", entityId: created.id, summary: `Regional ${r.code} criada pelo login do Feishu` }, tx);
  return created;
}

/** Acha a base pelo departamento do Feishu, pela sigla ou pelo nome; senão cria (E11). */
async function baseDe(tx: Tx, d: Deteccao) {
  const found =
    (await tx.base.findUnique({ where: { feishuDepartmentId: d.base.feishuId } })) ??
    (await tx.base.findFirst({ where: { OR: [{ code: d.base.code }, { name: { equals: d.base.name, mode: "insensitive" } }] } }));
  if (found) {
    if (!found.feishuDepartmentId) await tx.base.update({ where: { id: found.id }, data: { feishuDepartmentId: d.base.feishuId } });
    return found;
  }
  const regional = await regionalDe(tx, d.regional);
  const created = await tx.base.create({
    data: {
      code: d.base.code,
      name: d.base.name,
      type: d.base.type,
      regionalId: regional.id,
      feishuDepartmentId: d.base.feishuId,
      autoCreated: true,
    },
  });
  await audit(
    { actorId: null, action: "base.criar", entity: "Base", entityId: created.id, summary: `Base ${created.code} (${regional.code}) criada pelo login do Feishu` },
    tx,
  );
  return created;
}

async function loginLivre(tx: Tx, p: FeishuProfile) {
  const raw = loginSugerido(p);
  for (let i = 0; i < 50; i++) {
    const candidate = i ? `${raw}${i + 1}` : raw;
    if (!(await tx.user.findUnique({ where: { login: candidate }, select: { id: true } }))) return candidate;
  }
  return `feishu.${p.openId.toLowerCase()}`.slice(0, 40);
}

async function avisarAdmins(tx: Tx, userId: string, nome: string, onde: string) {
  const admins = await tx.user.findMany({
    where: { active: true, profile: { scope: "GLOBAL", permissions: { has: "usuarios.editar" } } },
    select: { id: true },
  });
  if (!admins.length) return;
  await tx.notification.createMany({
    data: admins.map((a) => ({
      userId: a.id,
      title: `Novo acesso pelo Feishu: ${nome}`,
      body: `Aguardando liberação. Departamento: ${onde}`.slice(0, 300),
      link: `/admin/usuarios/${userId}`,
      refType: "usuario",
      refId: userId,
    })),
  });
}

export async function resolveFeishuLogin(profile: FeishuProfile, deps: Deps): Promise<FeishuLoginResult> {
  // Departamentos: se o Feishu falhar, segue sem eles (a pessoa entra como "aguardando").
  let chains: FeishuDept[][] = [];
  try {
    chains = await deps.getChains(profile.openId);
  } catch (e) {
    logger.warn("feishu.departamentos.falhou", { openId: profile.openId, ...errorInfo(e) });
  }
  const deteccoes = detectarTodas(chains);
  const onde = chains[0]?.map((c) => c.name).reverse().join(" › ") ?? "não informado";

  return db.$transaction(async (tx) => {
    const existing =
      (await tx.user.findUnique({ where: { feishuOpenId: profile.openId }, include: { profile: true } })) ??
      (profile.employeeNo ? await tx.user.findUnique({ where: { registration: profile.employeeNo }, include: { profile: true } }) : null) ??
      (profile.email ? await tx.user.findFirst({ where: { OR: [{ email: profile.email }, { login: profile.email }] }, include: { profile: true } }) : null);

    if (existing && !existing.active) return { kind: "inactive" as const };
    // Achou pela matrícula ou e-mail, mas o usuário já está ligado a OUTRA conta do Feishu: não sequestra.
    if (existing?.feishuOpenId && existing.feishuOpenId !== profile.openId) return { kind: "conflict" as const };

    const bases = [];
    for (const d of deteccoes) bases.push(await baseDe(tx, d));

    if (existing) {
      await tx.user.update({
        where: { id: existing.id },
        data: {
          feishuOpenId: profile.openId,
          registration: existing.registration ?? profile.employeeNo ?? null,
          // Tinha senha temporária e entrou pelo Feishu: não obriga a criar senha (a temporária deixa de valer).
          ...(existing.mustChangePassword ? { mustChangePassword: false, passwordHash: null } : {}),
        },
      });
      // Só quem é de base ganha a base do departamento; a equipe (regional/global) não é mexida.
      if (existing.profile.scope === "BASE" && bases.length) {
        await tx.userBase.createMany({ data: bases.map((b) => ({ userId: existing.id, baseId: b.id })), skipDuplicates: true });
      }
      await audit({ actorId: existing.id, action: "usuario.feishu", entity: "User", entityId: existing.id, summary: `${existing.login} entrou pelo Feishu` }, tx);
      return { kind: "ok" as const, userId: existing.id, created: false, pending: existing.profile.key === "aguardando" };
    }

    // Novo: tipo de acesso pela unidade (Franquia se alguma base for franquia), ou "aguardando".
    const key = !bases.length ? "aguardando" : bases.some((b) => b.type === "FRANQUIA") ? "franquia" : "base";
    const perfil = await tx.accessProfile.findUnique({ where: { key } });
    if (!perfil) throw new Error(`Tipo de acesso "${key}" não existe: rode o seed (npm run db:seed).`);
    const emailLivre = profile.email && !(await tx.user.findUnique({ where: { email: profile.email }, select: { id: true } }));
    const matriculaLivre = profile.employeeNo && !(await tx.user.findUnique({ where: { registration: profile.employeeNo }, select: { id: true } }));
    const user = await tx.user.create({
      data: {
        name: profile.name,
        login: await loginLivre(tx, profile),
        email: emailLivre ? profile.email : null,
        registration: matriculaLivre ? profile.employeeNo : null,
        feishuOpenId: profile.openId,
        profileId: perfil.id,
        bases: { create: bases.map((b) => ({ baseId: b.id })) },
      },
    });
    await audit(
      {
        actorId: null,
        action: "usuario.criar",
        entity: "User",
        entityId: user.id,
        summary: `${user.login} criado pelo login do Feishu (${perfil.name}${bases.length ? `, ${bases.map((b) => b.code).join(", ")}` : ""})`,
      },
      tx,
    );
    if (!bases.length) await avisarAdmins(tx, user.id, profile.name, onde);
    return { kind: "ok" as const, userId: user.id, created: true, pending: !bases.length };
  });
}
