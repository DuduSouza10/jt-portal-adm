import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/password";
import { isSignupBlocked, recordSignupAttempt, SIGNUP_BLOCK_MINUTES } from "@/lib/auth/rate-limit";
import { CADASTRO_PROFILE_KEY, type CadastroInput } from "./cadastro";

/** Regionais e franquias que aparecem na tela pública de criar conta (só ativas; só regional com franquia). */
export async function opcoesCadastro() {
  const franquias = await db.base.findMany({
    where: { type: "FRANQUIA", active: true, regional: { active: true } },
    orderBy: [{ code: "asc" }],
    select: { id: true, code: true, name: true, regionalId: true, regional: { select: { id: true, code: true, name: true } } },
  });
  const regionais = new Map<string, { id: string; code: string; name: string }>();
  for (const f of franquias) regionais.set(f.regionalId, f.regional);
  return {
    regionais: [...regionais.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    franquias: franquias.map((f) => ({ id: f.id, code: f.code, name: f.name, regionalId: f.regionalId })),
  };
}

/**
 * Cria a conta de uma franquia. Sempre com o tipo de acesso "franquia", ligada a UMA franquia da regional
 * escolhida, sem troca de senha obrigatória (a pessoa acabou de escolher a senha).
 */
export async function criarContaFranquia(input: CadastroInput, ip: string) {
  if (await isSignupBlocked(ip)) throw new DomainError(`Muitas tentativas. Aguarde ${SIGNUP_BLOCK_MINUTES} minutos e tente de novo.`);
  await recordSignupAttempt(ip);

  const base = await db.base.findFirst({
    where: { id: input.baseId, regionalId: input.regionalId, type: "FRANQUIA", active: true, regional: { active: true } },
    select: { id: true, code: true, name: true },
  });
  if (!base) throw new DomainError("Franquia não encontrada nessa regional.");
  const profile = await db.accessProfile.findUnique({ where: { key: CADASTRO_PROFILE_KEY }, select: { id: true } });
  if (!profile) throw new DomainError("Criar conta indisponível no momento. Fale com o administrador.");

  const passwordHash = await hashPassword(input.password);
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name.replace(/\s+/g, " "),
        login: input.login,
        passwordHash,
        profileId: profile.id,
        mustChangePassword: false,
        bases: { create: [{ baseId: base.id }] },
      },
      select: { id: true, login: true },
    });
    await audit(
      {
        actorId: null,
        action: "usuario.cadastro",
        entity: "User",
        entityId: user.id,
        summary: `${user.login} criou a própria conta na franquia ${base.code}`,
        data: { baseId: base.id, regionalId: input.regionalId },
      },
      tx,
    );
    return user;
  });
}
