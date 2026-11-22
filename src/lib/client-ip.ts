/**
 * IP de quem fez a requisição, sem depender da hospedagem (puro — testado em client-ip.test.ts).
 *
 * Só vale um cabeçalho que a PLATAFORMA preenche e o cliente não consegue forjar:
 * - Netlify (`NETLIFY=true`): `x-nf-client-connection-ip`
 * - Vercel (`VERCEL=1`): `x-real-ip` (a Vercel sobrescreve o que o cliente mandar)
 * - Outra hospedagem: defina `TRUSTED_IP_HEADER` com o nome do cabeçalho que ela preenche.
 * - Desenvolvimento local: primeiro valor de `x-forwarded-for`, ou "local".
 *
 * Em produção sem nenhum desses, devolve UNKNOWN_IP: o limite de login por IP é desligado
 * (senão todo mundo dividiria o mesmo "IP" e 300 senhas erradas travariam o login de todas as bases).
 */
export const UNKNOWN_IP = "desconhecido";

type Env = { NODE_ENV?: string; NETLIFY?: string; VERCEL?: string; TRUSTED_IP_HEADER?: string };

export function pickClientIp(get: (name: string) => string | null, env: Env): string {
  const header = env.TRUSTED_IP_HEADER?.trim().toLowerCase();
  const first = (v: string | null) => v?.split(",")[0]?.trim() || null;
  if (header) return first(get(header)) ?? UNKNOWN_IP;
  if (env.NETLIFY === "true") return first(get("x-nf-client-connection-ip")) ?? UNKNOWN_IP;
  if (env.VERCEL === "1") return first(get("x-real-ip")) ?? first(get("x-vercel-forwarded-for")) ?? UNKNOWN_IP;
  if (env.NODE_ENV !== "production") return first(get("x-forwarded-for")) ?? "local";
  return UNKNOWN_IP;
}
