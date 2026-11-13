// Chamadas à Open Platform do Feishu (sem SDK: só fetch, para rodar bem em serverless).
import { feishuConfig } from "@/lib/feishu/config";

export class FeishuError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
  }
}

// Cache por instância (o token vale ~2h; renovamos 5 min antes).
let tenantCache: { token: string; expiresAt: number } | null = null;

/** Token do app (tenant_access_token) para mandar mensagens pelo app bot. */
export async function getTenantAccessToken() {
  if (tenantCache && tenantCache.expiresAt > Date.now() + 5 * 60_000) return tenantCache.token;
  const { baseUrl, appId, appSecret } = feishuConfig();
  const res = await fetch(`${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => null)) as { code?: number; msg?: string; tenant_access_token?: string; expire?: number } | null;
  if (!body || body.code !== 0 || !body.tenant_access_token)
    throw new FeishuError(`Feishu token: ${body?.msg ?? `HTTP ${res.status}`} (código ${body?.code})`, body?.code);
  tenantCache = { token: body.tenant_access_token, expiresAt: Date.now() + (body.expire ?? 7200) * 1000 };
  return body.tenant_access_token;
}

/** Só para testes. */
export function _resetTenantCache() {
  tenantCache = null;
}
