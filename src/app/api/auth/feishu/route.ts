import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/redirect";
import { buildAuthorizeUrl } from "@/lib/feishu/client";
import { FEISHU_STATE_COOKIE, feishuCallbackUrl, isFeishuLoginEnabled } from "@/lib/feishu/config";

// Início do login: gera um "state" anti-CSRF e manda a pessoa para o Feishu autorizar.
export async function GET(req: NextRequest) {
  if (!isFeishuLoginEnabled()) redirect("/login?erro=feishu_desligado");
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const state = randomBytes(16).toString("base64url");
  (await cookies()).set(FEISHU_STATE_COOKIE, JSON.stringify({ state, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/feishu",
    maxAge: 600,
  });
  redirect(buildAuthorizeUrl(state, feishuCallbackUrl(req.nextUrl.origin)));
}
