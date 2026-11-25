import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/password";
import { isSignupBlocked, recordSignupAttempt, SIGNUP_BLOCK_MINUTES } from "@/lib/auth/rate-limit";
import { CADASTRO_PROFILE_KEY, type CadastroInput } from "./cadastro";
import { codigoBase } from "./feishu-rules";

/** Regionais e franquias que aparecem na tela pública de criar conta (só ativas; só regional com franquia). */
export async function opcoesCadastro() {
  const [franquias, todas] = await Promise.all([
    db.base.findMany({
      where: { type: "FRANQUIA", active: true, regional: { active: true } },
      orderBy: [{ code: "asc" }],
      select: { id: true, code: true, name: true, regionalId: true },
    }),
    // Todas as regionais ativas: a franquia que não está na lista pode ser criada em qualquer uma.
    db.regional.findMany({ where: { active: true }, select: { id: true, code: true, name: true } }),
  ]);
  return {
    regionais: todas.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    franquias: franquias.map((f) => ({ id: f.id, code: f.code, name: f.name, regionalId: f.regionalId })),
  };
}

/**
 * Franquia digitada (não estava na lista): reaproveita a franquia com o mesmo nome ou sigla na regional;
 * senão cria (tipo Franquia, marcada "criada pela tela de cadastro" via autoCreated, auditada). Nome com
 * sigla de base que já existe (outra base, outra regional) ganha sufixo para não juntar duas.
 */
async function franquiaPeloNome(regional: { id: string; code: string }, nome: string) {
  const code = codigoBase(nome) || "FRANQUIA";
  const existente = await db.base.findFirst({
    where: { regionalId: regional.id, type: "FRANQUIA", OR: [{ code }, { name: { equals: nome, mode: "insensitive" } }] },
    select: { id: true, code: true, name: true, active: true },
  });
  if (existente) {
    if (!existente.active) throw new DomainError("Essa franquia está desativada. Fale com o administrador.");
    return existente;
  }
  let livre = code;
  for (let i = 2; await db.base.findUnique({ where: { code: livre }, select: { id: true } }); i++) livre = `${code.slice(0, 17)}-${i}`;
  return db.$transaction(async (tx) => {
    const b = await tx.base.create({
      data: { code: livre, name: nome, type: "FRANQUIA", regionalId: regional.id, autoCreated: true },
      select: { id: true, code: true, name: true },
    });
    await audit({ actorId: null, action: "base.criar", entity: "Base", entityId: b.id, summary: `Franquia ${b.code} (${regional.code}) criada pela tela de cadastro` }, tx);
    return b;
  });
}

/**
 * Cria a conta de uma franquia. Sempre com o tipo de acesso "franquia", ligada a UMA franquia da regional
 * escolhida, sem troca de senha obrigatória (a pessoa acabou de escolher a senha).
 */
export async function criarContaFranquia(input: CadastroInput, ip: string) {
  if (await isSignupBlocked(ip)) throw new DomainError(`Muitas tentativas. Aguarde ${SIGNUP_BLOCK_MINUTES} minutos e tente de novo.`);
  await recordSignupAttempt(ip);

  const regional = await db.regional.findFirst({ where: { id: input.regionalId, active: true }, select: { id: true, code: true } });
  if (!regional) throw new DomainError("Regional não encontrada.");
  const base = input.baseId
    ? await db.base.findFirst({
        where: { id: input.baseId, regionalId: regional.id, type: "FRANQUIA", active: true },
        select: { id: true, code: true, name: true },
      })
    : await franquiaPeloNome(regional, input.novaFranquia!);
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
