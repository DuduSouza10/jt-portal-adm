import "server-only";
import type { AccessScope } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit, diff } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";
import { generateTempPassword, hashTempPassword } from "@/lib/auth/password";
import { errorInfo, logger } from "@/lib/logger";
import type { ImportRow } from "./importacao";
import { isSubsetOf, linksOutsideScopeError, scopeLinksError, scopeWithin } from "./rules";

/**
 * Importação de usuários — parte com banco. Chamada em lotes pela tela (/admin/usuarios/importar):
 *   1. validarLote() em lotes de 500: diz o que vai acontecer com cada linha, sem gravar nada;
 *   2. aplicarLote() em lotes de 25: grava (cada usuário na sua transação) e devolve as senhas temporárias.
 * aplicarLote() valida de novo: entre a prévia e a gravação o banco pode ter mudado.
 *
 * Quem já existe é encontrado pela MATRÍCULA (se a linha tiver) ou pelo LOGIN. O login de quem já existe
 * não muda. A senha de quem já existe não muda. Usuário que não está na planilha não é tocado.
 */

export const VALIDATE_BATCH = 500;
/** 25 usuários ≈ 2–4 s por requisição (senha temporária com custo baixo + 4 consultas cada). */
export const APPLY_BATCH = 25;

export type RowAction = "criar" | "atualizar" | "igual" | "erro";
export type RowResult = { line: number; login: string; name: string; action: RowAction; message?: string; tempPassword?: string };

type Profile = { id: string; key: string; name: string; scope: AccessScope; permissions: string[] };

type Planned =
  | { row: ImportRow; action: "erro"; message: string }
  | {
      row: ImportRow;
      action: "criar" | "atualizar" | "igual";
      profile: Profile;
      baseIds: string[];
      regionalIds: string[];
      existing: Awaited<ReturnType<typeof loadExisting>>[number] | null;
      changes?: Record<string, unknown>;
    };

const MAX_LIST = 12;
const listCodes = (codes: string[]) => (codes.length > MAX_LIST ? `${codes.slice(0, MAX_LIST).join(", ")}…` : codes.join(", "));

function loadExisting(rows: ImportRow[]) {
  const logins = rows.map((r) => r.login);
  const regs = rows.flatMap((r) => (r.registration ? [r.registration] : []));
  const emails = rows.flatMap((r) => (r.email ? [r.email] : []));
  return db.user.findMany({
    where: { OR: [{ login: { in: logins } }, { registration: { in: regs } }, { email: { in: emails } }] },
    include: { profile: true, bases: { include: { base: true } }, regionals: true },
  });
}

async function plan(actor: CurrentUser, rows: ImportRow[], defaultProfileId: string | null): Promise<Planned[]> {
  const baseCodes = [...new Set(rows.flatMap((r) => r.baseCodes))];
  const regionalCodes = [...new Set(rows.flatMap((r) => r.regionalCodes))];
  const [profiles, bases, regionals, existing] = await Promise.all([
    db.accessProfile.findMany(),
    db.base.findMany({ where: { code: { in: baseCodes } }, select: { id: true, code: true, regionalId: true, active: true } }),
    db.regional.findMany({ where: { code: { in: regionalCodes } }, select: { id: true, code: true, active: true } }),
    loadExisting(rows),
  ]);

  const profileByRef = new Map<string, Profile>();
  for (const p of profiles) {
    profileByRef.set(p.key.toLowerCase(), p);
    profileByRef.set(p.name.toLowerCase(), p);
  }
  const defaultProfile = profiles.find((p) => p.id === defaultProfileId) ?? null;
  const baseByCode = new Map(bases.map((b) => [b.code, b]));
  const regionalByCode = new Map(regionals.map((r) => [r.code, r]));
  const baseRegional = new Map(bases.map((b) => [b.id, b.regionalId]));
  // Usuários existentes também podem ter bases fora da planilha: o alcance deles precisa do mapa completo.
  for (const u of existing) for (const ub of u.bases) baseRegional.set(ub.baseId, ub.base.regionalId);
  const byLogin = new Map(existing.map((u) => [u.login, u]));
  const byReg = new Map(existing.flatMap((u) => (u.registration ? [[u.registration, u] as const] : [])));
  const byEmail = new Map(existing.flatMap((u) => (u.email ? [[u.email, u] as const] : [])));

  return rows.map((row): Planned => {
    const err = (message: string): Planned => ({ row, action: "erro", message });

    // Tipo de acesso
    const profile = row.profile ? profileByRef.get(row.profile.toLowerCase()) : defaultProfile;
    if (!profile) return err(row.profile ? `Tipo de acesso "${row.profile}" não existe.` : "Tipo de acesso não informado (nem na planilha, nem o padrão).");

    // Vínculos
    const missingBases = row.baseCodes.filter((c) => !baseByCode.get(c)?.active);
    if (missingBases.length) return err(`Base(s) inexistente(s) ou inativa(s): ${listCodes(missingBases)}.`);
    const missingRegs = row.regionalCodes.filter((c) => !regionalByCode.get(c)?.active);
    if (missingRegs.length) return err(`Regional(is) inexistente(s) ou inativa(s): ${listCodes(missingRegs)}.`);
    const baseIds = row.baseCodes.map((c) => baseByCode.get(c)!.id);
    const regionalIds = row.regionalCodes.map((c) => regionalByCode.get(c)!.id);
    const linkErr = scopeLinksError({ scope: profile.scope, baseIds, regionalIds });
    if (linkErr) return err(`${linkErr} (tipo "${profile.name}").`);

    // Quem importa só concede o que tem (E4, E6)
    if (!isSubsetOf(profile.permissions, actor.permissions)) return err(`Você não pode conceder o tipo de acesso "${profile.name}".`);
    if (!scopeWithin(profile.scope, actor.scope)) return err(`O tipo "${profile.name}" tem alcance maior que o seu.`);
    const scopeErr = linksOutsideScopeError(actor, { baseIds, regionalIds }, baseRegional);
    if (scopeErr) return err(scopeErr);

    // Já existe?
    const fromReg = row.registration ? byReg.get(row.registration) : undefined;
    const fromLogin = byLogin.get(row.login);
    if (fromReg && fromLogin && fromReg.id !== fromLogin.id)
      return err(`O login "${row.login}" já é de outra pessoa (${fromLogin.name}). Informe outro login na planilha.`);
    if (!fromReg && fromLogin && row.registration && fromLogin.registration && fromLogin.registration !== row.registration)
      return err(`O login "${row.login}" já é de ${fromLogin.name}, com outra matrícula (${fromLogin.registration}).`);
    const ex = fromReg ?? fromLogin ?? null;
    if (row.email) {
      const owner = byEmail.get(row.email);
      if (owner && owner.id !== ex?.id) return err(`O e-mail ${row.email} já é de outra pessoa (${owner.name}).`);
    }

    if (!ex) return { row, action: "criar", profile, baseIds, regionalIds, existing: null };

    if (ex.id === actor.id) return err("O seu próprio usuário não pode ser alterado pela importação.");
    const exLinks = { baseIds: ex.bases.map((b) => b.baseId), regionalIds: ex.regionals.map((r) => r.regionalId) };
    if (!isSubsetOf(ex.profile.permissions, actor.permissions) || !scopeWithin(ex.profile.scope, actor.scope) || linksOutsideScopeError(actor, exLinks, baseRegional))
      return err(`Você não pode alterar ${ex.name} (${ex.login}): está fora do seu alcance.`);

    const before = {
      name: ex.name,
      email: ex.email,
      phone: ex.phone,
      registration: ex.registration,
      profileId: ex.profileId,
      active: ex.active,
      baseIds: [...exLinks.baseIds].sort(),
      regionalIds: [...exLinks.regionalIds].sort(),
    };
    const after = {
      name: row.name,
      email: row.email ?? ex.email, // célula vazia não apaga o que já existe
      phone: row.phone ?? ex.phone,
      registration: row.registration ?? ex.registration,
      profileId: profile.id,
      active: row.active,
      baseIds: [...baseIds].sort(),
      regionalIds: [...regionalIds].sort(),
    };
    const changes = diff(before, after) as Record<string, unknown>;
    return { row, action: Object.keys(changes).length ? "atualizar" : "igual", profile, baseIds, regionalIds, existing: ex, changes };
  });
}

const toResult = (p: Planned, extra: Partial<RowResult> = {}): RowResult => ({
  line: p.row.line,
  login: (p.action !== "erro" && p.existing?.login) || p.row.login,
  name: p.row.name,
  action: p.action,
  ...(p.action === "erro" ? { message: p.message } : p.action === "atualizar" ? { message: Object.keys(p.changes ?? {}).join(", ") } : {}),
  ...extra,
});

/** Prévia: o que vai acontecer com cada linha. Não grava nada. */
export async function validarLote(actor: CurrentUser, rows: ImportRow[], defaultProfileId: string | null) {
  return (await plan(actor, rows, defaultProfileId)).map((p) => toResult(p));
}

/** Grava um lote. Cada usuário na sua transação, com auditoria; erro numa linha não derruba as outras. */
export async function aplicarLote(actor: CurrentUser, rows: ImportRow[], defaultProfileId: string | null) {
  const planned = await plan(actor, rows, defaultProfileId);
  const results: RowResult[] = [];
  for (const p of planned) {
    if (p.action === "erro" || p.action === "igual") {
      results.push(toResult(p));
      continue;
    }
    const { row, profile, baseIds, regionalIds } = p;
    const links = {
      bases: { create: baseIds.map((baseId) => ({ baseId })) },
      regionals: { create: regionalIds.map((regionalId) => ({ regionalId })) },
    };
    try {
      if (p.action === "criar") {
        const tempPassword = generateTempPassword();
        const passwordHash = await hashTempPassword(tempPassword);
        await db.$transaction(async (tx) => {
          const u = await tx.user.create({
            data: {
              name: row.name,
              login: row.login,
              email: row.email,
              phone: row.phone,
              registration: row.registration,
              profileId: profile.id,
              active: row.active,
              passwordHash,
              mustChangePassword: true,
              ...links,
            },
          });
          await audit(
            { actorId: actor.id, action: "usuario.importar", entity: "User", entityId: u.id, summary: `Importou o usuário ${u.login} (${profile.name})` },
            tx,
          );
        });
        results.push(toResult(p, { tempPassword }));
      } else {
        const ex = p.existing!;
        await db.$transaction(async (tx) => {
          await tx.userBase.deleteMany({ where: { userId: ex.id } });
          await tx.userRegional.deleteMany({ where: { userId: ex.id } });
          await tx.user.update({
            where: { id: ex.id },
            data: {
              name: row.name,
              email: row.email ?? ex.email,
              phone: row.phone ?? ex.phone,
              registration: row.registration ?? ex.registration,
              profileId: profile.id,
              active: row.active,
              ...links,
            },
          });
          // Desativado pela planilha (ex.: desligado no RH): perde o acesso na hora.
          if (!row.active) await tx.session.deleteMany({ where: { userId: ex.id } });
          await audit(
            {
              actorId: actor.id,
              action: "usuario.importar",
              entity: "User",
              entityId: ex.id,
              summary: `Atualizou ${ex.login} pela importação`,
              data: p.changes as never,
            },
            tx,
          );
        });
        results.push(toResult(p));
      }
    } catch (e) {
      logger.error("importacao.linha", { ...errorInfo(e), line: row.line });
      results.push({ line: row.line, login: row.login, name: row.name, action: "erro", message: "Não foi possível gravar esta linha (conflito com outro cadastro). Tente de novo." });
    }
  }
  return results;
}
