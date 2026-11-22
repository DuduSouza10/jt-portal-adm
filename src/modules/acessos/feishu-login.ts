import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isUniqueError } from "@/lib/action-result";
import type { FeishuDept, FeishuProfile } from "@/lib/feishu/client";
import { errorInfo, logger } from "@/lib/logger";
import { comSufixo, detectarTodas, loginSugerido, mesmoNome, siglaCortada, type Deteccao } from "./feishu-rules";

type Tx = Prisma.TransactionClient;

/**
 * Login pelo Feishu (E11): acha ou cria o usuário e a base dele, pela cadeia de departamentos.
 *
 * 1. Já tem usuário → entra. Se ele for de base (alcance BASE), ganha também a base do departamento atual
 *    (quem mudou de unidade passa a ver a nova; a base antiga não é tirada, o admin tira se quiser).
 *    Achado pelo open_id: qualquer conta. Achado pela matrícula ou pelo e-mail CORPORATIVO: só conta de base
 *    (alcance BASE). Conta da equipe (admin, gestor, almoxarifado…) só entra pelo Feishu depois que o admin
 *    preenche o open_id no cadastro dela: assim ninguém entra na conta de um admin trocando o e-mail no Feishu.
 * 2. Não tem usuário e está numa unidade → cria com o tipo "Base" ou "Franquia", já na base dela.
 *    Se a base (ou a regional) ainda não existe no portal, é criada na hora, marcada "criada pelo Feishu".
 * 3. Não tem usuário e não está numa unidade (ex.: Gestão Integrada) → cria com "Aguardando liberação",
 *    sem acesso a nada, e avisa os administradores no sino.
 * Tipos de acesso da equipe (Administrador, Gestor, Almoxarifado…) NUNCA vêm do Feishu: o admin escolhe.
 */

export type FeishuLoginResult =
  | { kind: "ok"; userId: string; created: boolean; pending: boolean }
  | { kind: "inactive" }
  | { kind: "conflict" } // e-mail/matrícula já ligados a OUTRA conta do Feishu
  | { kind: "staff" }; // conta da equipe sem open_id: o admin liga no cadastro

type Deps = { getChains: (openId: string) => Promise<FeishuDept[][]> };

/** Primeira sigla livre: a própria, senão com sufixo ("MG" → "MG-2", "MG-3"…). */
async function siglaLivre(code: string, ocupada: (c: string) => Promise<unknown>) {
  for (let n = 1; n < 100; n++) {
    const c = n === 1 ? code : comSufixo(code, n);
    if (!(await ocupada(c))) return c;
  }
  throw new Error(`Sem sigla livre para ${code}`);
}

/**
 * Acha a regional pelo departamento do Feishu; senão, uma regional ainda não ligada ao Feishu com o MESMO
 * nome (cadastrada à mão) é ligada; senão cria. A sigla sozinha não basta: Minas Gerais e Mato Grosso
 * dão as duas "MG", e cada uma tem que ficar na sua regional (a segunda vira "MG-2").
 */
async function regionalDe(tx: Tx, r: Deteccao["regional"]) {
  const ligada = await tx.regional.findUnique({ where: { feishuDepartmentId: r.feishuId } });
  if (ligada) return ligada;
  const soltas = await tx.regional.findMany({ where: { feishuDepartmentId: null } });
  const mesma = soltas.find((x) => mesmoNome(x.name, r.name));
  if (mesma) return tx.regional.update({ where: { id: mesma.id }, data: { feishuDepartmentId: r.feishuId } });
  const code = await siglaLivre(r.code, (c) => tx.regional.findUnique({ where: { code: c }, select: { id: true } }));
  const created = await tx.regional.create({ data: { code, name: r.name, feishuDepartmentId: r.feishuId } });
  await audit({ actorId: null, action: "regional.criar", entity: "Regional", entityId: created.id, summary: `Regional ${r.code} criada pelo login do Feishu` }, tx);
  return created;
}

/**
 * Acha a base pelo departamento do Feishu; senão liga uma base ainda sem Feishu com o mesmo nome ou com a
 * mesma sigla (só quando a sigla não foi cortada em 20 caracteres); senão cria (E11). Base já ligada a
 * OUTRO departamento nunca é reaproveitada: a nova ganha sigla com sufixo.
 */
async function baseDe(tx: Tx, d: Deteccao) {
  const ligada = await tx.base.findUnique({ where: { feishuDepartmentId: d.base.feishuId } });
  if (ligada) return ligada;
  const soltas = await tx.base.findMany({
    where: { feishuDepartmentId: null, OR: [{ code: d.base.code }, { name: { equals: d.base.name, mode: "insensitive" } }] },
  });
  const mesma =
    soltas.find((b) => mesmoNome(b.name, d.base.name)) ?? (siglaCortada(d.base.name) ? undefined : soltas.find((b) => b.code === d.base.code));
  if (mesma) return tx.base.update({ where: { id: mesma.id }, data: { feishuDepartmentId: d.base.feishuId } });
  const regional = await regionalDe(tx, d.regional);
  const code = await siglaLivre(d.base.code, (c) => tx.base.findUnique({ where: { code: c }, select: { id: true } }));
  const created = await tx.base.create({
    data: {
      code,
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

  // Dois primeiros logins ao mesmo tempo podem bater na mesma sigla/matrícula/open_id: tenta de novo
  // (na segunda vez a transação já enxerga o que a outra criou).
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await entrar(profile, deteccoes, onde);
    } catch (e) {
      if (tentativa >= 3 || !isUniqueError(e)) throw e;
      logger.warn("feishu.login.repete", { openId: profile.openId, tentativa });
    }
  }
}

function entrar(profile: FeishuProfile, deteccoes: Deteccao[], onde: string): Promise<FeishuLoginResult> {
  return db.$transaction(async (tx) => {
    const porOpenId = await tx.user.findUnique({ where: { feishuOpenId: profile.openId }, include: { profile: true } });
    const porMatricula =
      !porOpenId && profile.employeeNo ? await tx.user.findUnique({ where: { registration: profile.employeeNo }, include: { profile: true } }) : null;
    // Só o e-mail corporativo (administrado pela empresa) liga a uma conta existente; o pessoal a pessoa troca.
    const porEmail =
      !porOpenId && !porMatricula && profile.enterpriseEmail
        ? await tx.user.findFirst({ where: { OR: [{ email: profile.enterpriseEmail }, { login: profile.enterpriseEmail }] }, include: { profile: true } })
        : null;
    const existing = porOpenId ?? porMatricula ?? porEmail;

    if (existing && !existing.active) return { kind: "inactive" as const };
    // Achou pela matrícula ou e-mail, mas o usuário já está ligado a OUTRA conta do Feishu: não sequestra.
    if (existing?.feishuOpenId && existing.feishuOpenId !== profile.openId) return { kind: "conflict" as const };
    // Conta da equipe (admin, gestor…) nunca é ligada sozinha: o admin preenche o open_id no cadastro.
    if (existing && !porOpenId && existing.profile.scope !== "BASE") return { kind: "staff" as const };

    const bases = [];
    for (const d of deteccoes) bases.push(await baseDe(tx, d));

    if (existing) {
      const matriculaLivre =
        !existing.registration && profile.employeeNo && !(await tx.user.findUnique({ where: { registration: profile.employeeNo }, select: { id: true } }));
      // Conta de base com senha provisória que entra pelo Feishu: a provisória deixa de valer (fica registrado).
      const cancelaProvisoria = existing.mustChangePassword && existing.profile.scope === "BASE";
      await tx.user.update({
        where: { id: existing.id },
        data: {
          feishuOpenId: profile.openId,
          ...(matriculaLivre ? { registration: profile.employeeNo } : {}),
          ...(cancelaProvisoria ? { mustChangePassword: false, passwordHash: null } : {}),
        },
      });
      if (!porOpenId || cancelaProvisoria) {
        await audit(
          {
            actorId: existing.id,
            action: "usuario.feishu.vincular",
            entity: "User",
            entityId: existing.id,
            summary: `${existing.login} entrou pelo Feishu${porOpenId ? "" : porMatricula ? " (ligado pela matrícula)" : " (ligado pelo e-mail corporativo)"}${cancelaProvisoria ? "; senha provisória cancelada" : ""}`,
          },
          tx,
        );
      }
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
    const emailLivre = profile.email && !(await tx.user.findFirst({ where: { OR: [{ email: profile.email }, { login: profile.email }] }, select: { id: true } }));
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
