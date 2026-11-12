import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import type { Permission } from "@/lib/permissions/catalog";
import { can, canAny, type Actor } from "@/lib/permissions/check";

// Sessões no banco (não JWT): desativar um usuário ou mudar o perfil vale na próxima requisição.
export const SESSION_COOKIE = "portal_session";
const SESSION_DAYS = 14;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const h = await headers();
  await db.session.create({
    data: { id: hash(token), userId, expiresAt, userAgent: h.get("user-agent")?.slice(0, 200) },
  });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hash(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Encerra todas as sessões do usuário, menos a desta requisição (ex.: depois de trocar a senha). */
export async function destroyOtherSessions(userId: string) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await db.session.deleteMany({ where: { userId, ...(token && { id: { not: hash(token) } }) } });
}

export type CurrentUser = Actor & {
  name: string;
  login: string;
  email: string | null;
  mustChangePassword: boolean;
  profile: { id: string; key: string; name: string };
  bases: { id: string; code: string; name: string }[];
};

/** Usuário da requisição atual (memoizado por request). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Tudo que depende do usuário é renderizado por requisição (nunca no build).
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: hash(token) },
    include: {
      user: {
        include: {
          profile: true,
          bases: { include: { base: { select: { id: true, code: true, name: true } } } },
          regionals: { select: { regionalId: true } },
        },
      },
    },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  const u = session.user;
  return {
    id: u.id,
    name: u.name,
    login: u.login,
    email: u.email,
    mustChangePassword: u.mustChangePassword,
    profile: { id: u.profile.id, key: u.profile.key, name: u.profile.name },
    permissions: u.profile.permissions,
    scope: u.profile.scope,
    bases: u.bases.map((b) => b.base),
    baseIds: u.bases.map((b) => b.base.id),
    regionalIds: u.regionals.map((r) => r.regionalId),
  };
});

/** Exige login. Use em toda page/action/route protegida. */
export async function requireUser(opts: { allowPendingPasswordChange?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Senha resetada pelo admin: obriga a trocar antes de usar o sistema.
  if (user.mustChangePassword && !opts.allowPendingPasswordChange) redirect("/conta/senha");
  return user;
}

/**
 * Exige login E a permissão. Sem permissão → 404 (não revela que a página existe).
 * Esconder o link no menu não basta: TODA page, action e route handler chama isto.
 */
export async function requirePermission(permission: Permission | Permission[]): Promise<CurrentUser> {
  const user = await requireUser();
  const ok = Array.isArray(permission) ? canAny(user, permission) : can(user, permission);
  if (!ok) notFound();
  return user;
}
