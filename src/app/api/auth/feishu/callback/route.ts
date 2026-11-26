import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createSession } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/redirect";
import { exchangeCode, getUserDepartmentChains, getUserInfo } from "@/lib/feishu/client";
import { FEISHU_STATE_COOKIE, feishuCallbackUrl, isFeishuLoginEnabled } from "@/lib/feishu/config";
import { errorInfo, logger } from "@/lib/logger";
import { resolveFeishuLogin } from "@/modules/acessos/feishu-login";

// Volta do Feishu: confere o state, troca o code pelo token, identifica a pessoa, acha/cria base e usuário (E11).
export async function GET(req: NextRequest) {
  if (!isFeishuLoginEnabled()) redirect("/login?erro=feishu_desligado");

  const jar = await cookies();
  const saved = jar.get(FEISHU_STATE_COOKIE)?.value;
  jar.delete({ name: FEISHU_STATE_COOKIE, path: "/api/auth/feishu" });

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  let expected: { state: string; next: string } | null = null;
  try {
    expected = saved ? JSON.parse(saved) : null;
  } catch {}
  if (!code) redirect("/login?erro=feishu_cancelado"); // a pessoa recusou a autorização
  if (!expected || expected.state !== state) redirect("/login?erro=feishu_expirado");

  let result;
  try {
    const token = await exchangeCode(code, feishuCallbackUrl(req.nextUrl.origin));
    const profile = await getUserInfo(token);
    result = await resolveFeishuLogin(profile, { getChains: getUserDepartmentChains });
  } catch (e) {
    logger.error("feishu.login.falhou", errorInfo(e));
    redirect("/login?erro=feishu_falhou");
  }

  if (result.kind === "inactive") redirect("/login?erro=desativado");
  if (result.kind === "conflict") redirect("/login?erro=feishu_conflito");
  if (result.kind === "staff") redirect("/login?erro=feishu_equipe");

  await createSession(result.userId);
  logger.info("login.feishu.ok", { userId: result.userId, created: result.created, pending: result.pending });
  redirect(safeNext(expected.next));
}
