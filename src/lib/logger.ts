// Logs estruturados em JSON (uma linha por evento) — legíveis no painel de logs do Netlify.
type Level = "info" | "warn" | "error";

function log(level: Level, msg: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (msg: string, data?: Record<string, unknown>) => log("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log("error", msg, data),
};

export function errorInfo(e: unknown) {
  return e instanceof Error ? { error: e.message, stack: e.stack } : { error: String(e) };
}
