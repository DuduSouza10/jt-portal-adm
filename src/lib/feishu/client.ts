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

// ---------------------------------------------------------------- Chamadas genéricas

type Envelope<T> = { code: number; msg?: string; data?: T };

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { baseUrl } = feishuConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => null)) as (Envelope<T> & Record<string, unknown>) | null;
  if (!body) throw new FeishuError(`Feishu respondeu HTTP ${res.status} sem JSON (${path})`);
  if (body.code !== 0) throw new FeishuError(`Feishu ${path}: ${body.msg ?? "erro"} (código ${body.code})`, body.code);
  return body as unknown as T;
}

// ---------------------------------------------------------------- OAuth (login)

export function buildAuthorizeUrl(state: string, redirectUri: string) {
  const { accountsUrl, appId } = feishuConfig();
  const u = new URL(`${accountsUrl}/open-apis/authen/v1/authorize`);
  u.searchParams.set("client_id", appId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  return u.toString();
}

/** Troca o code do OAuth pelo user_access_token (endpoint v2, padrão RFC 6749). */
export async function exchangeCode(code: string, redirectUri: string) {
  const { appId, appSecret } = feishuConfig();
  const r = await call<{ access_token: string }>("/open-apis/authen/v2/oauth/token", {
    method: "POST",
    body: JSON.stringify({ grant_type: "authorization_code", client_id: appId, client_secret: appSecret, code, redirect_uri: redirectUri }),
  });
  return r.access_token;
}

/**
 * `email` é o que aparece (corporativo, ou o pessoal se não houver), usado só para sugerir o login.
 * `enterpriseEmail` é o corporativo, administrado pela empresa: é o ÚNICO e-mail que serve para ligar
 * o Feishu a uma conta que já existe (o pessoal a própria pessoa pode trocar).
 */
export type FeishuProfile = { openId: string; name: string; email?: string; enterpriseEmail?: string; employeeNo?: string };

export async function getUserInfo(userAccessToken: string): Promise<FeishuProfile> {
  const r = await call<{ data: { open_id: string; name: string; email?: string; enterprise_email?: string; employee_no?: string } }>(
    "/open-apis/authen/v1/user_info",
    { token: userAccessToken },
  );
  const d = r.data;
  return {
    openId: d.open_id,
    name: d.name,
    email: (d.enterprise_email || d.email || "").toLowerCase() || undefined,
    enterpriseEmail: (d.enterprise_email || "").toLowerCase() || undefined,
    employeeNo: d.employee_no || undefined,
  };
}

// ---------------------------------------------------------------- Departamentos

export type FeishuDept = { id: string; name: string; parentId?: string };

async function getDepartment(id: string, token: string): Promise<FeishuDept> {
  const r = await call<{ data: { department: { name: string; open_department_id: string; parent_department_id?: string } } }>(
    `/open-apis/contact/v3/departments/${encodeURIComponent(id)}?department_id_type=open_department_id`,
    { token },
  );
  const d = r.data.department;
  return { id: d.open_department_id || id, name: d.name, parentId: d.parent_department_id && d.parent_department_id !== "0" ? d.parent_department_id : undefined };
}

/**
 * Departamentos da pessoa, cada um com a cadeia de "pais" até onde o app enxerga
 * (ex.: CD CTG 001 → DC MNH 001 → Gestão Regional → Subsidiária Minas Gerais → Subsidiária MN).
 */
export async function getUserDepartmentChains(openId: string, maxDepth = 8): Promise<FeishuDept[][]> {
  const token = await getTenantAccessToken();
  const r = await call<{ data: { user: { department_ids?: string[] } } }>(
    `/open-apis/contact/v3/users/${encodeURIComponent(openId)}?user_id_type=open_id&department_id_type=open_department_id`,
    { token },
  );
  const chains: FeishuDept[][] = [];
  for (const id of r.data.user.department_ids ?? []) {
    const chain: FeishuDept[] = [];
    let current: string | undefined = id;
    for (let i = 0; current && i < maxDepth; i++) {
      try {
        const dep = await getDepartment(current, token);
        chain.push(dep);
        current = dep.parentId;
      } catch {
        break; // acima do alcance do app (ex.: J&T Brasil): a cadeia termina aí
      }
    }
    chains.push(chain);
  }
  return chains;
}
